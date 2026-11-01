const { createManager, SandboxError } = require('../services/sandboxManager');
const { createPool } = require('../services/sandboxPoolService');
const { fakeEngine, waitFor } = require('./helpers');

const settle = () => new Promise((resolve) => setImmediate(resolve));

function managerWith(engine, { limits, pool = { enabled: false } } = {}) {
  return createManager({ engine, limits, pool });
}

describe('pool claims', () => {
  test('a sandbox claimed from the pool is reachable by its session id', async () => {
    // Regression: pooled sandboxes used to stay registered under their
    // standby id, so every pool claim ended in "Sandbox session not found".
    const engine = fakeEngine();
    const manager = managerWith(engine, { pool: { enabled: true, size: 2 } });
    await manager.init();
    expect(manager.stats().pool.available).toBe(2);

    const session = await manager.createSession('user-1', 'linux-basics');

    expect(session.fromPool).toBe(true);
    expect(manager.getSession(session.sessionId)).toMatchObject({ userId: 'user-1', labId: 'linux-basics' });
    expect(manager.isOwner(session.sessionId, 'user-1')).toBe(true);
    await expect(manager.exec(session.sessionId, 'pwd')).resolves.toMatchObject({ exitCode: 0 });
    await expect(manager.attach(session.sessionId)).resolves.not.toBeNull();
  });

  test('the pool refills in the background after a claim', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine, { pool: { enabled: true, size: 2 } });
    await manager.init();
    await manager.createSession('user-1');
    await waitFor(() => manager.stats().pool.available === 2);
    expect(engine.created).toHaveLength(3);
  });

  test('standby sandboxes are not sessions: not listed, not reaped', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine, { pool: { enabled: true, size: 3 } });
    await manager.init();

    expect(manager.listSessions()).toEqual([]);
    expect(manager.stats().activeSessions).toBe(0);
    expect(await manager.sweep(Date.now() + 365 * 24 * 3600 * 1000)).toEqual([]);
    expect(engine.destroyed).toEqual([]);
    expect(manager.stats().pool.available).toBe(3);
  });

  test('a standby sandbox that died while waiting is discarded, not handed out', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine, { pool: { enabled: true, size: 1 } });
    await manager.init();
    const dead = engine.created[0];
    engine.alive.delete(dead);

    const session = await manager.createSession('user-1');

    expect(session.fromPool).toBe(false);
    expect(engine.destroyed).toContain(dead);
    await expect(manager.exec(session.sessionId, 'pwd')).resolves.toBeDefined();
  });

  test('falls back to a cold start when the pool is empty or disabled', async () => {
    const manager = managerWith(fakeEngine());
    const session = await manager.createSession('user-1');
    expect(session.fromPool).toBe(false);
    expect(manager.stats().pool).toMatchObject({ enabled: false, available: 0 });
  });

  test('pre-warming stops quietly when the engine is unavailable', async () => {
    const engine = fakeEngine();
    engine.failCreate = true;
    const pool = createPool(engine, { enabled: true, size: 3 });
    await expect(pool.replenish()).resolves.toBeUndefined();
    expect(pool.stats().available).toBe(0);
    await expect(pool.acquire()).rejects.toThrow('engine unavailable');
  });

  test('concurrent replenish calls do not overfill the pool', async () => {
    const engine = fakeEngine();
    const pool = createPool(engine, { enabled: true, size: 2 });
    await Promise.all([pool.replenish(), pool.replenish(), pool.replenish()]);
    expect(pool.stats().available).toBe(2);
    expect(engine.created).toHaveLength(2);
  });

  test('drain destroys every standby sandbox', async () => {
    const engine = fakeEngine();
    const pool = createPool(engine, { enabled: true, size: 2 });
    await pool.replenish();
    await pool.drain();
    expect(pool.stats().available).toBe(0);
    expect(engine.alive.size).toBe(0);
  });
});

describe('limits', () => {
  test('a user cannot exceed their sandbox limit, but others still can start', async () => {
    const manager = managerWith(fakeEngine(), { limits: { maxPerUser: 2 } });
    await manager.createSession('user-1');
    await manager.createSession('user-1');

    await expect(manager.createSession('user-1')).rejects.toMatchObject({ statusCode: 429 });
    await expect(manager.createSession('user-1')).rejects.toBeInstanceOf(SandboxError);
    await expect(manager.createSession('user-2')).resolves.toBeDefined();
  });

  test('stopping a sandbox frees the slot', async () => {
    const manager = managerWith(fakeEngine(), { limits: { maxPerUser: 1 } });
    const first = await manager.createSession('user-1');
    await manager.destroySession(first.sessionId);
    await expect(manager.createSession('user-1')).resolves.toBeDefined();
  });

  test('the per-user limit holds when starts race each other', async () => {
    const manager = managerWith(fakeEngine(), { limits: { maxPerUser: 2 } });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => manager.createSession('user-1')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(manager.listSessions()).toHaveLength(2);
  });

  test('returns 503 when the host is full', async () => {
    const manager = managerWith(fakeEngine(), { limits: { maxPerUser: 5, maxTotal: 2 } });
    await manager.createSession('user-1');
    await manager.createSession('user-2');
    await expect(manager.createSession('user-3')).rejects.toMatchObject({ statusCode: 503 });
  });

  test('a failed start releases its reserved slot', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine, { limits: { maxPerUser: 1 } });
    engine.failCreate = true;
    await expect(manager.createSession('user-1')).rejects.toThrow('engine unavailable');
    engine.failCreate = false;
    await expect(manager.createSession('user-1')).resolves.toBeDefined();
  });
});

describe('session lifecycle', () => {
  test('ownership is per user', async () => {
    const manager = managerWith(fakeEngine());
    const session = await manager.createSession('user-1');
    expect(manager.isOwner(session.sessionId, 'user-2')).toBe(false);
    expect(manager.isOwner('no-such-session', 'user-1')).toBe(false);
  });

  test('destroy removes the session, destroys the sandbox and notifies listeners', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine);
    const session = await manager.createSession('user-1');
    const reasons = [];
    manager.onClose(session.sessionId, (reason) => reasons.push(reason));

    expect(await manager.destroySession(session.sessionId, 'stopped')).toBe(true);
    expect(await manager.destroySession(session.sessionId)).toBe(false);
    expect(manager.getSession(session.sessionId)).toBeNull();
    expect(engine.alive.size).toBe(0);
    expect(reasons).toEqual(['stopped']);
    await expect(manager.exec(session.sessionId, 'pwd')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('an unsubscribed close listener is not called', async () => {
    const manager = managerWith(fakeEngine());
    const session = await manager.createSession('user-1');
    const listener = jest.fn();
    manager.onClose(session.sessionId, listener)();
    await manager.destroySession(session.sessionId);
    expect(listener).not.toHaveBeenCalled();
  });

  test('when the shell exits on its own the session is dropped', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine);
    const session = await manager.createSession('user-1');
    const reasons = [];
    manager.onClose(session.sessionId, (reason) => reasons.push(reason));

    engine.exit(engine.created[0]);
    await settle();

    expect(manager.getSession(session.sessionId)).toBeNull();
    expect(reasons).toEqual(['exited']);
  });

  test('exec with touch: false leaves the idle timer alone; a normal exec resets it', async () => {
    const manager = managerWith(fakeEngine());
    const session = await manager.createSession('user-1');
    const startedAt = manager.getSession(session.sessionId).lastActiveAt;

    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 60000);
    try {
      await manager.exec(session.sessionId, 'ls', { touch: false });
      expect(manager.getSession(session.sessionId).lastActiveAt).toBe(startedAt);
      await manager.exec(session.sessionId, 'ls');
      expect(manager.getSession(session.sessionId).lastActiveAt).toBe(startedAt + 60000);
    } finally {
      Date.now.mockRestore();
    }
  });

  test('exec passes engine options through without the touch flag', async () => {
    const engine = fakeEngine();
    const seen = [];
    engine.exec = (engineId, command, options) => {
      seen.push(options);
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    const manager = managerWith(engine);
    const session = await manager.createSession('user-1');
    await manager.exec(session.sessionId, 'ls', { touch: false, timeoutMs: 500 });
    await manager.exec(session.sessionId, 'ls');
    expect(seen).toEqual([{ timeoutMs: 500 }, {}]);
  });

  test('findSession returns the running sandbox for a user and lab only', async () => {
    const manager = managerWith(fakeEngine(), { limits: { maxPerUser: 5 } });
    const linux = await manager.createSession('user-1', 'linux-basics');
    await manager.createSession('user-1', 'git-basics');

    expect(manager.findSession('user-1', 'linux-basics').sessionId).toBe(linux.sessionId);
    expect(manager.findSession('user-2', 'linux-basics')).toBeNull();
    expect(manager.findSession('user-1', 'docker-basics')).toBeNull();
    await manager.destroySession(linux.sessionId);
    expect(manager.findSession('user-1', 'linux-basics')).toBeNull();
  });

  test('sweep reaps sessions past max age or idle time and leaves fresh ones', async () => {
    const manager = managerWith(fakeEngine(), { limits: { maxSessionMs: 30 * 60000, maxIdleMs: 15 * 60000, maxPerUser: 5 } });
    const now = Date.now();
    const idle = await manager.createSession('user-1');
    const busy = await manager.createSession('user-2');

    expect(await manager.sweep(now + 10 * 60000)).toEqual([]);

    // user-2 keeps typing; user-1 goes quiet.
    jest.spyOn(Date, 'now').mockReturnValue(now + 14 * 60000);
    manager.touch(busy.sessionId);
    Date.now.mockRestore();

    expect(await manager.sweep(now + 16 * 60000)).toEqual([{ sessionId: idle.sessionId, reason: 'idle' }]);
    expect(manager.getSession(busy.sessionId)).not.toBeNull();

    // Activity does not extend a session past its maximum age.
    expect(await manager.sweep(now + 31 * 60000)).toEqual([{ sessionId: busy.sessionId, reason: 'max_age' }]);
    expect(manager.listSessions()).toEqual([]);
  });

  test('command history is kept per session and capped', async () => {
    const manager = managerWith(fakeEngine(), { limits: { historyLimit: 3 } });
    const session = await manager.createSession('user-1');
    for (const command of ['a', 'b', 'c', 'd']) manager.recordCommand(session.sessionId, command);
    expect(manager.getHistory(session.sessionId).map((h) => h.command)).toEqual(['b', 'c', 'd']);
    expect(manager.getHistory('no-such-session')).toEqual([]);
  });

  test('reset clears history and resets the sandbox', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine);
    const session = await manager.createSession('user-1');
    manager.recordCommand(session.sessionId, 'ls');
    await manager.reset(session.sessionId);
    expect(manager.getHistory(session.sessionId)).toEqual([]);
    expect(engine.resets).toEqual([engine.created[0]]);
  });

  test('strikes accumulate per session', async () => {
    const manager = managerWith(fakeEngine());
    const session = await manager.createSession('user-1');
    expect(manager.addStrike(session.sessionId)).toBe(1);
    expect(manager.addStrike(session.sessionId)).toBe(2);
    expect(manager.addStrike('no-such-session')).toBe(0);
  });

  test('shutdown destroys sessions and standby sandboxes', async () => {
    const engine = fakeEngine();
    const manager = managerWith(engine, { pool: { enabled: true, size: 2 } });
    await manager.init();
    await manager.createSession('user-1');
    await waitFor(() => manager.stats().pool.available === 2);
    await manager.shutdown();
    expect(engine.alive.size).toBe(0);
    expect(manager.listSessions()).toEqual([]);
  });

  test('stats report claim latency by source without exposing session ids', async () => {
    const manager = managerWith(fakeEngine(), { pool: { enabled: true, size: 1 } });
    await manager.init();
    const session = await manager.createSession('user-1');
    const stats = manager.stats();
    expect(stats.claimLatencyMs.pool.samples).toBe(1);
    expect(stats.claimLatencyMs.pool.p50).toEqual(expect.any(Number));
    expect(stats.claimLatencyMs.cold).toEqual({ samples: 0, p50: null, p95: null });
    expect(JSON.stringify(stats)).not.toContain(session.sessionId);
  });

  test('init restores active unexpired sessions from the store', async () => {
    const engine = fakeEngine();
    const manager1 = managerWith(engine);
    await manager1.init();
    const session = await manager1.createSession('user-restored', 'k8s');

    // Simulate process restart: create a new manager instance sharing the store and engine
    const manager2 = managerWith(engine);
    await manager2.init();

    expect(manager2.getSession(session.sessionId)).toMatchObject({
      sessionId: session.sessionId,
      userId: 'user-restored',
      labId: 'k8s',
    });
    expect(manager2.isOwner(session.sessionId, 'user-restored')).toBe(true);
  });
});
