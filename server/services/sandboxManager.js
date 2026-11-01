/**
 * Sandbox Manager — owns every student session
 *
 * Maps session ids to sandboxes, enforces per-user and global limits, and
 * hides whether the sandbox is a PTY shell or a Docker container. Routes and
 * services should use this module only, never an engine directly.
 */

const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../lib/logger');
const metrics = require('../lib/metrics');
const { createPool } = require('./sandboxPoolService');

const LATENCY_SAMPLES = 200;

class SandboxError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function loadEngine(mode) {
  return mode === 'docker' ? require('./dockerService') : require('./ptyService');
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function createManager({ engine = loadEngine(config.sandboxMode), limits = {}, pool: poolOptions } = {}) {
  const settings = {
    maxPerUser: config.sandbox.maxPerUser,
    maxTotal: config.sandbox.maxTotal,
    maxSessionMs: config.sandbox.maxSessionMinutes * 60 * 1000,
    maxIdleMs: config.sandbox.maxInactivityMinutes * 60 * 1000,
    historyLimit: config.sandbox.historyLimit,
    ...limits,
  };

  const pool = createPool(engine, poolOptions);
  // Map<sessionId, session>
  const sessions = new Map();
  // Slots reserved by createSession calls that are still starting a sandbox.
  const pending = new Map();
  const claimLatencies = { pool: [], cold: [] };
  const SESSIONS = 'sessions';

  function persist(session) {
    try {
      const store = require('../lib/store').getStore();
      if (store) {
        store.set(SESSIONS, session.sessionId, {
          sessionId: session.sessionId,
          engineId: session.engineId,
          userId: session.userId,
          labId: session.labId,
          createdAt: session.createdAt,
          lastActiveAt: session.lastActiveAt,
          fromPool: session.fromPool,
          claimMs: session.claimMs,
          history: session.history,
          strikes: session.strikes,
        });
      }
    } catch {}
  }

  function unpersist(sessionId) {
    try {
      const store = require('../lib/store').getStore();
      if (store) store.delete(SESSIONS, sessionId);
    } catch {}
  }

  function countFor(userId) {
    let count = pending.get(userId) || 0;
    for (const session of sessions.values()) if (session.userId === userId) count += 1;
    return count;
  }

  function totalCount() {
    let count = sessions.size;
    for (const reserved of pending.values()) count += reserved;
    return count;
  }

  function recordLatency(source, ms) {
    const samples = claimLatencies[source];
    samples.push(ms);
    if (samples.length > LATENCY_SAMPLES) samples.shift();
    metrics.sandboxClaimDuration.observe({ source }, ms / 1000);
  }

  /**
   * Start a sandbox for a user.
   * @throws {SandboxError} 429 when the user is at their limit, 503 when the host is full
   */
  async function createSession(userId, labId = 'sandbox') {
    if (countFor(userId) >= settings.maxPerUser) {
      throw new SandboxError(`You already have ${settings.maxPerUser} sandboxes running. Stop one first.`, 429);
    }
    if (totalCount() >= settings.maxTotal) {
      throw new SandboxError('All sandboxes are in use. Please try again in a few minutes.', 503);
    }

    pending.set(userId, (pending.get(userId) || 0) + 1);
    const startedAt = process.hrtime.bigint();
    let acquired;
    try {
      acquired = await pool.acquire({ labId });
    } finally {
      const left = pending.get(userId) - 1;
      if (left > 0) pending.set(userId, left);
      else pending.delete(userId);
    }

    const claimMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    recordLatency(acquired.fromPool ? 'pool' : 'cold', claimMs);

    const now = Date.now();
    const session = {
      sessionId: randomUUID(),
      engineId: acquired.engineId,
      userId,
      labId,
      createdAt: now,
      lastActiveAt: now,
      fromPool: acquired.fromPool,
      claimMs: Math.round(claimMs * 100) / 100,
      history: [],
      strikes: 0,
      closeListeners: new Set(),
    };
    sessions.set(session.sessionId, session);
    persist(session);
    metrics.sandboxesActive.set(sessions.size);

    // If the shell or container exits on its own, drop the session too.
    engine.onExit(session.engineId, () => {
      destroySession(session.sessionId, 'exited').catch(() => {});
    });

    logger.info({ sessionId: session.sessionId, userId, labId, fromPool: session.fromPool, claimMs: session.claimMs }, 'sandbox started');
    return describe(session);
  }

  function describe(session) {
    const now = Date.now();
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      labId: session.labId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      idleMs: now - session.lastActiveAt,
      uptime: now - session.createdAt,
      expiresAt: session.createdAt + settings.maxSessionMs,
      idleExpiresAt: session.lastActiveAt + settings.maxIdleMs,
      fromPool: session.fromPool,
      claimMs: session.claimMs,
      ...engine.info(session.engineId),
    };
  }

  function getSession(sessionId) {
    const session = sessions.get(sessionId);
    return session ? describe(session) : null;
  }

  /** True when the session exists and belongs to this user. */
  function isOwner(sessionId, userId) {
    const session = sessions.get(sessionId);
    return Boolean(session && session.userId === userId);
  }

  function listSessions() {
    return [...sessions.values()].map(describe);
  }

  /** The user's running sandbox for a lab, if they have one. */
  function findSession(userId, labId) {
    for (const session of sessions.values()) {
      if (session.userId === userId && session.labId === labId) return describe(session);
    }
    return null;
  }

  function touch(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
      persist(session);
    }
  }

  async function destroySession(sessionId, reason = 'stopped') {
    const session = sessions.get(sessionId);
    if (!session) return false;
    sessions.delete(sessionId);
    unpersist(sessionId);
    metrics.sandboxesActive.set(sessions.size);

    for (const listener of session.closeListeners) listener(reason);
    session.closeListeners.clear();

    await engine.destroy(session.engineId);
    logger.info({ sessionId, reason }, 'sandbox destroyed');
    return true;
  }

  /** Be told when the session ends, e.g. to close its terminal sockets. Returns an unsubscribe function. */
  function onClose(sessionId, listener) {
    const session = sessions.get(sessionId);
    if (!session) return () => {};
    session.closeListeners.add(listener);
    return () => session.closeListeners.delete(listener);
  }

  function requireSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) throw new SandboxError('Sandbox session not found', 404);
    return session;
  }

  /**
   * Run a command in the sandbox. Pass `touch: false` for background reads
   * (the inspector's polling), so an open but unused tab still goes idle.
   */
  async function exec(sessionId, command, { touch: countsAsActivity = true, ...options } = {}) {
    const session = requireSession(sessionId);
    if (countsAsActivity) session.lastActiveAt = Date.now();
    return engine.exec(session.engineId, command, options);
  }

  async function attach(sessionId) {
    const session = sessions.get(sessionId);
    return session ? engine.attach(session.engineId) : null;
  }

  async function reset(sessionId) {
    const session = requireSession(sessionId);
    session.lastActiveAt = Date.now();
    session.history = [];
    await engine.reset(session.engineId);
  }

  function recordCommand(sessionId, command) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.history.push({ command, at: Date.now() });
    if (session.history.length > settings.historyLimit) session.history.shift();
  }

  function getHistory(sessionId) {
    const session = sessions.get(sessionId);
    return session ? session.history.slice() : [];
  }

  /** Count a blocked command. Returns the running total for the session. */
  function addStrike(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return 0;
    session.strikes += 1;
    return session.strikes;
  }

  /**
   * Destroy sessions past their maximum age or idle time.
   * @returns {Promise<Array<{ sessionId: string, reason: string }>>}
   */
  async function sweep(now = Date.now()) {
    const reaped = [];
    for (const session of [...sessions.values()]) {
      let reason = null;
      if (now - session.createdAt > settings.maxSessionMs) reason = 'max_age';
      else if (now - session.lastActiveAt > settings.maxIdleMs) reason = 'idle';
      if (!reason) continue;

      await destroySession(session.sessionId, reason).catch((err) => {
        logger.warn({ sessionId: session.sessionId, err: err.message }, 'reaper failed to destroy sandbox');
      });
      metrics.sandboxesReaped.inc({ reason });
      reaped.push({ sessionId: session.sessionId, reason });
    }
    return reaped;
  }

  /** Aggregate numbers that are safe to show publicly (no session ids). */
  function stats() {
    const summarise = (samples) => {
      const sorted = samples.slice().sort((a, b) => a - b);
      const round = (v) => (v === null ? null : Math.round(v * 100) / 100);
      return { samples: sorted.length, p50: round(percentile(sorted, 50)), p95: round(percentile(sorted, 95)) };
    };
    return {
      mode: engine.name,
      activeSessions: sessions.size,
      capacity: settings.maxTotal,
      pool: pool.stats(),
      claimLatencyMs: { pool: summarise(claimLatencies.pool), cold: summarise(claimLatencies.cold) },
    };
  }

  async function init() {
    if (engine.reconcile) {
      await engine.reconcile().catch((err) => {
        logger.warn({ err: err.message }, 'could not reconcile running sandboxes');
      });
    }

    const activeEngineIds = new Set();
    try {
      const store = require('../lib/store').getStore();
      if (store) {
        const stored = store.all(SESSIONS);
        const now = Date.now();
        for (const s of stored) {
          const isExpired = (now - s.createdAt > settings.maxSessionMs) || (now - s.lastActiveAt > settings.maxIdleMs);
          const alive = engine.isAlive ? engine.isAlive(s.engineId) : true;
          if (!isExpired && alive) {
            const restored = {
              ...s,
              closeListeners: new Set(),
            };
            sessions.set(s.sessionId, restored);
            activeEngineIds.add(s.engineId);
            if (engine.onExit) {
              engine.onExit(s.engineId, () => {
                destroySession(s.sessionId, 'exited').catch(() => {});
              });
            }
          } else {
            if (engine.destroy && alive) await engine.destroy(s.engineId).catch(() => {});
            store.delete(SESSIONS, s.sessionId);
          }
        }
        if (sessions.size > 0) {
          logger.info({ count: sessions.size }, 'restored active student sessions after restart');
          metrics.sandboxesActive.set(sessions.size);
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'could not restore sessions from store');
    }

    if (engine.cleanupOrphans) {
      const cleaned = await engine.cleanupOrphans({ keepEngineIds: activeEngineIds }).catch((err) => {
        logger.warn({ err: err.message }, 'could not clean up orphaned sandboxes');
        return null;
      });
      if (cleaned && Object.values(cleaned).some(Boolean)) logger.info(cleaned, 'removed orphaned sandboxes');
    }
    await pool.replenish();
  }

  async function shutdown() {
    for (const sessionId of [...sessions.keys()]) {
      await destroySession(sessionId, 'shutdown').catch(() => {});
    }
    await pool.drain();
  }

  return {
    init,
    shutdown,
    createSession,
    getSession,
    isOwner,
    listSessions,
    findSession,
    touch,
    destroySession,
    onClose,
    exec,
    attach,
    reset,
    recordCommand,
    getHistory,
    addStrike,
    sweep,
    stats,
    replenishPool: () => pool.replenish(),
    getMode: () => engine.name,
  };
}

let defaultManager = null;

/** The process-wide manager, created on first use. */
function getManager() {
  if (!defaultManager) defaultManager = createManager();
  return defaultManager;
}

/** Replace the shared manager (tests). */
function setManager(manager) {
  defaultManager = manager;
}

module.exports = { createManager, getManager, setManager, SandboxError };
