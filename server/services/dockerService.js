/**
 * Docker engine — container sandbox
 *
 * Runs each sandbox in its own locked-down container via dockerode.
 * Used when SANDBOX_MODE=docker. See docs/THREAT_MODEL.md for what each
 * restriction below is there to stop.
 *
 * Implements the engine interface shared with ptyService.js:
 *   create, destroy, isAlive, exec, attach, reset, onExit, info
 */

const Docker = require('dockerode');
const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const config = require('../config');
const logger = require('../lib/logger');

const STUDENT_HOME = '/home/student';
const STUDENT_UID = 1000;

let docker = null;
function getDocker() {
  if (!docker) docker = new Docker({ socketPath: config.dockerSocketPath });
  return docker;
}

// Map<engineId, { containerId, networkName, alive, exitListeners }>
const sandboxes = new Map();

function containerName(engineId) {
  return `opsacademy-sbx-${engineId}`;
}

/**
 * 'none' gives the container no network interface at all. 'internal' gives
 * each sandbox its own bridge with no route out, for labs that need
 * localhost-style networking. 'bridge' allows outbound internet.
 */
async function resolveNetwork(engineId) {
  const mode = config.sandbox.dockerNetworkMode;
  if (mode === 'none' || mode === 'bridge') return { networkMode: mode, networkName: null };

  const networkName = `opsacademy-net-${engineId}`;
  await getDocker().createNetwork({
    Name: networkName,
    Driver: 'bridge',
    Internal: true,
    Labels: { 'opsacademy.sandbox': engineId },
  });
  return { networkMode: networkName, networkName };
}

/**
 * Container settings for a sandbox. Exported so tests can assert the
 * hardening without needing a Docker daemon.
 */
function buildContainerOptions(engineId, { labId, networkMode }) {
  const securityOpt = ['no-new-privileges:true'];
  if (config.sandbox.dockerSeccompProfile) {
    securityOpt.push(`seccomp=${fs.readFileSync(config.sandbox.dockerSeccompProfile, 'utf8')}`);
  }

  const memoryBytes = config.sandbox.maxMemoryMB * 1024 * 1024;

  return {
    name: containerName(engineId),
    Image: config.sandbox.dockerImage,
    Cmd: ['/bin/sh'],
    Tty: true,
    OpenStdin: true,
    User: `${STUDENT_UID}:${STUDENT_UID}`,
    WorkingDir: STUDENT_HOME,
    Hostname: 'opsacademy',
    Env: [
      `LAB_ID=${labId || 'sandbox'}`,
      `HOME=${STUDENT_HOME}`,
      // The ports the labs use. Each container has its own loopback, so every student gets the same numbers.
      ...Object.entries(config.sandbox.labPorts).map(([name, port]) => `${name}=${port}`),
    ],
    Labels: { 'opsacademy.sandbox': engineId },
    HostConfig: {
      Memory: memoryBytes,
      MemorySwap: memoryBytes, // equal to Memory: no swap to hide in
      NanoCpus: Math.round(config.sandbox.maxCpuCores * 1e9),
      PidsLimit: config.sandbox.maxPids,
      NetworkMode: networkMode,
      CapDrop: ['ALL'],
      SecurityOpt: securityOpt,
      Privileged: false,
      ReadonlyRootfs: true,
      AutoRemove: false,
      Ulimits: [
        { Name: 'nofile', Soft: 1024, Hard: 1024 },
        { Name: 'fsize', Soft: config.sandbox.homeSizeMB * 1024 * 1024, Hard: config.sandbox.homeSizeMB * 1024 * 1024 },
      ],
      // Writable space is RAM-backed and size-capped, so a student cannot
      // fill the host disk and nothing survives the container.
      Tmpfs: {
        // `exec` because labs have students write and run their own scripts (Docker's tmpfs default is noexec).
        [STUDENT_HOME]: `rw,exec,nosuid,nodev,size=${config.sandbox.homeSizeMB}m,uid=${STUDENT_UID},gid=${STUDENT_UID},mode=0755`,
        '/tmp': `rw,nosuid,nodev,noexec,size=${Math.min(64, config.sandbox.homeSizeMB)}m,mode=1777`,
      },
    },
  };
}

async function create(engineId, { labId } = {}) {
  const { networkMode, networkName } = await resolveNetwork(engineId);

  let container;
  try {
    container = await getDocker().createContainer(buildContainerOptions(engineId, { labId, networkMode }));
    await container.start();
  } catch (err) {
    if (container) await container.remove({ force: true }).catch(() => {});
    if (networkName) await getDocker().getNetwork(networkName).remove().catch(() => {});
    throw err;
  }

  const sandbox = { containerId: container.id, networkName, alive: true, exitListeners: [] };
  sandboxes.set(engineId, sandbox);

  // Notice containers that die on their own (OOM kill, pid limit, `exit`).
  container.wait().then(() => {
    sandbox.alive = false;
    for (const listener of sandbox.exitListeners) listener();
  }).catch(() => {});

  logger.debug({ engineId, containerId: container.id.slice(0, 12) }, '[Docker] sandbox created');
}

async function destroy(engineId) {
  const sandbox = sandboxes.get(engineId);
  if (!sandbox) return false;
  sandboxes.delete(engineId);
  sandbox.exitListeners = [];

  try {
    await getDocker().getContainer(sandbox.containerId).remove({ force: true });
  } catch (err) {
    if (err.statusCode !== 404) logger.warn({ engineId, err: err.message }, '[Docker] error removing container');
  }

  if (sandbox.networkName) {
    await getDocker().getNetwork(sandbox.networkName).remove().catch((err) => {
      logger.warn({ engineId, err: err.message }, '[Docker] error removing network');
    });
  }
  return true;
}

function isAlive(engineId) {
  const sandbox = sandboxes.get(engineId);
  return Boolean(sandbox && sandbox.alive);
}

function onExit(engineId, listener) {
  const sandbox = sandboxes.get(engineId);
  if (sandbox) sandbox.exitListeners.push(listener);
}

/**
 * Run a command inside the container and capture stdout/stderr separately.
 */
async function exec(engineId, command, { timeoutMs = config.sandbox.execTimeoutMs } = {}) {
  const sandbox = sandboxes.get(engineId);
  if (!sandbox) throw new Error('Sandbox not found');

  const container = getDocker().getContainer(sandbox.containerId);
  const execInstance = await container.exec({
    Cmd: ['/bin/sh', '-c', command],
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: STUDENT_HOME,
  });
  const stream = await execInstance.start({});

  return new Promise((resolve, reject) => {
    const out = [];
    const err = [];
    const collect = (chunks) => ({ write: (chunk) => chunks.push(chunk) });
    getDocker().modem.demuxStream(stream, collect(out), collect(err));

    const timer = setTimeout(() => {
      stream.destroy();
      resolve({ exitCode: 124, stdout: Buffer.concat(out).toString(), stderr: 'Command timed out' });
    }, timeoutMs);

    stream.on('error', (streamErr) => {
      clearTimeout(timer);
      reject(streamErr);
    });
    stream.on('end', async () => {
      clearTimeout(timer);
      const data = await execInstance.inspect().catch(() => null);
      resolve({
        exitCode: data && data.ExitCode !== null ? data.ExitCode : 1,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      });
    });
  });
}

/**
 * Attach a terminal: each attachment gets its own interactive shell inside
 * the container.
 */
async function attach(engineId) {
  const sandbox = sandboxes.get(engineId);
  if (!sandbox || !sandbox.alive) return null;

  const container = getDocker().getContainer(sandbox.containerId);
  const execInstance = await container.exec({
    Cmd: ['/bin/sh', '-c', 'command -v bash >/dev/null 2>&1 && exec bash -l || exec sh -l'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: STUDENT_HOME,
    Env: ['TERM=xterm-256color'],
  });
  const stream = await execInstance.start({ hijack: true, stdin: true, Tty: true });

  return {
    onData(callback) {
      // A chunk can end in the middle of a multi-byte character (an accented
      // letter, a box-drawing line); the decoder holds the tail until the rest arrives.
      const decoder = new StringDecoder('utf8');
      stream.on('data', (chunk) => {
        const text = decoder.write(chunk);
        if (text) callback(text);
      });
    },
    write(data) {
      if (!stream.destroyed) stream.write(data);
    },
    resize(cols, rows) {
      execInstance.resize({ h: rows, w: cols }).catch(() => {});
    },
    close() {
      stream.destroy();
    },
  };
}

/** Wipe the student's home directory so the lab can be started over. */
async function reset(engineId) {
  await exec(engineId, `find ${STUDENT_HOME} -mindepth 1 -delete`);
}

function info(engineId) {
  const sandbox = sandboxes.get(engineId);
  return { mode: 'docker', containerId: sandbox ? sandbox.containerId.slice(0, 12) : null };
}

/**
 * Reconnect to live containers left behind by a previous process
 * (e.g. after a zero-downtime deploy or process restart).
 */
async function reconcile() {
  const filters = { label: ['opsacademy.sandbox'] };
  let containers = [];
  try {
    containers = await getDocker().listContainers({ all: false, filters });
  } catch (err) {
    logger.warn({ err: err.message }, '[Docker] could not list running containers to reconcile');
    return;
  }

  for (const item of containers) {
    const engineId = item.Labels && item.Labels['opsacademy.sandbox'];
    if (engineId && !sandboxes.has(engineId)) {
      const networkName = `opsacademy-net-${engineId}`;
      const sandbox = { containerId: item.Id, networkName, alive: true, exitListeners: [] };
      sandboxes.set(engineId, sandbox);

      const container = getDocker().getContainer(item.Id);
      container.wait().then(() => {
        sandbox.alive = false;
        for (const listener of sandbox.exitListeners) listener();
      }).catch(() => {});
    }
  }
}

/**
 * Remove containers and networks left behind by a previous gateway process
 * (crash or redeploy), found by label. Preserves containers matching keepEngineIds.
 */
async function cleanupOrphans({ keepEngineIds = new Set() } = {}) {
  const filters = { label: ['opsacademy.sandbox'] };
  let containers = [];
  try {
    containers = await getDocker().listContainers({ all: true, filters });
  } catch (err) {
    logger.warn({ err: err.message }, '[Docker] could not list containers for orphan cleanup');
    return { containers: 0, networks: 0 };
  }

  let removedContainers = 0;
  for (const item of containers) {
    const engineId = item.Labels && item.Labels['opsacademy.sandbox'];
    if (engineId && keepEngineIds.has(engineId)) {
      continue;
    }
    try {
      await getDocker().getContainer(item.Id).remove({ force: true });
      removedContainers++;
    } catch {}
  }

  let removedNetworks = 0;
  try {
    const networks = await getDocker().listNetworks({ filters });
    for (const item of networks) {
      const engineId = item.Labels && item.Labels['opsacademy.sandbox'];
      if (engineId && keepEngineIds.has(engineId)) {
        continue;
      }
      try {
        await getDocker().getNetwork(item.Id).remove();
        removedNetworks++;
      } catch {}
    }
  } catch {}

  return { containers: removedContainers, networks: removedNetworks };
}

module.exports = {
  name: 'docker',
  create,
  destroy,
  isAlive,
  onExit,
  exec,
  attach,
  reset,
  info,
  reconcile,
  cleanupOrphans,
  buildContainerOptions,
};
