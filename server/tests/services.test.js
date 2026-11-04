const { JsonStore, setStore } = require('../lib/store');
const units = require('../lib/units');
const progress = require('../services/progressService');
const certificates = require('../services/certificateService');
const { createClient, HubUnavailableError } = require('../services/aiHubClient');
const telemetry = require('../services/telemetryService');
const users = require('../services/userService');
const config = require('../config');

const DAY = 24 * 60 * 60 * 1000;
const day = (n) => Date.UTC(2026, 0, n, 12);

beforeEach(() => setStore(new JsonStore(null)));

describe('streaks', () => {
  const streak = (days, today) => progress.computeStreak(days.map((n) => new Date(day(n)).toISOString().slice(0, 10)), day(today));

  test('no activity is a zero streak', () => {
    expect(progress.computeStreak([], day(1))).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  test('consecutive days ending today', () => {
    expect(streak([1, 2, 3], 3)).toEqual({ current: 3, longest: 3, activeToday: true });
  });

  test('yesterday still counts until today is missed', () => {
    expect(streak([1, 2, 3], 4)).toEqual({ current: 3, longest: 3, activeToday: false });
    expect(streak([1, 2, 3], 5)).toEqual({ current: 0, longest: 3, activeToday: false });
  });

  test('a gap restarts the current streak but keeps the longest', () => {
    expect(streak([1, 2, 3, 4, 7, 8], 8)).toEqual({ current: 2, longest: 4, activeToday: true });
  });

  test('crosses month boundaries', () => {
    const days = ['2026-01-30', '2026-01-31', '2026-02-01'];
    expect(progress.computeStreak(days, Date.UTC(2026, 1, 1, 9))).toMatchObject({ current: 3 });
  });

  test('activity on several days builds a streak in the summary', () => {
    progress.recordHint('u1', 'linux-basics', 1, day(1));
    progress.recordHint('u1', 'linux-basics', 1, day(2));
    progress.recordHint('u1', 'linux-basics', 1, day(2) + 3600000);
    expect(progress.summary('u1', day(2)).streak).toEqual({ current: 2, longest: 2, activeToday: true });
    expect(progress.summary('u1', day(2)).activeDays).toEqual(['2026-01-01', '2026-01-02']);
  });
});

describe('verification records', () => {
  test('fails before the first pass count as struggle; re-check failures afterwards do not', () => {
    progress.recordVerification('u1', 'linux-basics', [{ step: 2, passed: false }]);
    progress.recordVerification('u1', 'linux-basics', [{ step: 2, passed: false }]);
    expect(progress.recordVerification('u1', 'linux-basics', [{ step: 2, passed: true }]).xpAwarded).toBe(20);
    progress.recordVerification('u1', 'linux-basics', [{ step: 2, passed: false }]);

    const summary = progress.summary('u1');
    expect(summary.weakTopics[0]).toMatchObject({ unitId: 'linux-basics', fails: 2 });
    expect(summary.unitProgress['linux-basics'].passedSteps).toBe(1);
    expect(summary.unitProgress['linux-basics'].passedStepNumbers).toHaveLength(1);
  });

  test('a unit completes only when every step has passed, across separate runs', () => {
    const steps = units.getSteps('linux-basics');
    for (const step of steps.slice(0, -1)) {
      expect(progress.recordVerification('u1', 'linux-basics', [{ step: step.step, passed: true }]).unitCompleted).toBe(false);
    }
    const last = progress.recordVerification('u1', 'linux-basics', [{ step: steps[steps.length - 1].step, passed: true }]);
    expect(last).toEqual({ xpAwarded: 120, unitCompleted: true, newlyCompleted: true, dailyBonus: 0 });
    expect(progress.isUnitCompleted('u1', 'linux-basics')).toBe(true);
    expect(progress.isUnitCompleted('u2', 'linux-basics')).toBe(false);
  });

  test('accuracy reflects failed attempts before passing', () => {
    const all = units.getSteps('linux-basics').map((s) => ({ step: s.step, passed: true }));
    progress.recordVerification('u1', 'linux-basics', [{ step: 1, passed: false }]);
    progress.recordVerification('u1', 'linux-basics', all);
    expect(progress.unitAccuracy('u1', 'linux-basics')).toBe(Math.round((all.length / (all.length + 1)) * 100));
    expect(progress.unitAccuracy('nobody', 'linux-basics')).toBe(0);
  });

  test('weak topics are ranked by fails plus half-weighted hints', () => {
    progress.recordVerification('u1', 'git-basics', [{ step: 1, passed: false }]);
    progress.recordHint('u1', 'docker-basics', 2);
    progress.recordHint('u1', 'docker-basics', 2);
    progress.recordHint('u1', 'docker-basics', 3);

    const weak = progress.summary('u1').weakTopics;
    expect(weak.map((w) => [w.unitId, w.score])).toEqual([['docker-basics', 1.5], ['git-basics', 1]]);
    expect(weak[0].steps[0]).toMatchObject({ step: 2, hints: 2, title: units.getStep('docker-basics', 2).title });
  });

  test('level rises every 250 XP', () => {
    expect(progress.summary('u1')).toMatchObject({ xp: 0, level: 1, xpToNextLevel: 250 });
    const all = units.getSteps('linux-basics').map((s) => ({ step: s.step, passed: true }));
    progress.recordVerification('u1', 'linux-basics', all);
    const summary = progress.summary('u1');
    expect(summary.xp).toBe(all.length * 20 + 100);
    expect(summary.level).toBe(Math.floor(summary.xp / 250) + 1);
  });
});

describe('flashcard deck', () => {
  test('cards come back when their interval has passed', () => {
    const cardId = units.getFlashcards('linux-basics')[0].id;
    progress.reviewCard('u1', 'linux-basics', cardId, 4, day(1));

    expect(progress.getDeck('u1', 'linux-basics', day(1)).cards.find((c) => c.id === cardId).due).toBe(false);
    expect(progress.getDeck('u1', 'linux-basics', day(1) + DAY).cards.find((c) => c.id === cardId).due).toBe(true);
    expect(progress.summary('u1', day(1) + DAY)).toMatchObject({ cardsDue: 1, cardsStarted: 1 });
  });

  test('reviewing an unknown card changes nothing', () => {
    expect(progress.reviewCard('u1', 'linux-basics', 'nope', 4)).toBeNull();
    expect(progress.summary('u1').xp).toBe(0);
  });
});

describe('certificates', () => {
  const user = { id: 'u1', name: 'Asha Rao' };
  const complete = (userId) => progress.recordVerification(userId, 'linux-basics', units.getSteps('linux-basics').map((s) => ({ step: s.step, passed: true })));

  test('the signature covers every field a forger would want to change', () => {
    complete('u1');
    const issued = certificates.issue(user, 'linux-basics');
    const stored = { ...issued, userId: 'u1' };

    for (const [field, value] of Object.entries({ studentName: 'Mallory', unitId: 'kubernetes-basics', unitTitle: 'Kubernetes', score: 99, issuedAt: '2020-01-01T00:00:00.000Z', userId: 'u2', id: 'OPS-AAAAAAAAAAAA' })) {
      expect(certificates.sign({ ...stored, [field]: value })).not.toBe(issued.signature);
    }
    expect(certificates.sign(stored)).toBe(issued.signature);
  });

  test('a certificate signed with a different key does not verify', () => {
    complete('u1');
    const issued = certificates.issue(user, 'linux-basics');
    expect(certificates.verify(issued.id)).not.toBeNull();

    const original = config.certSecret;
    config.certSecret = 'rotated-key';
    try {
      expect(certificates.verify(issued.id)).toBeNull();
    } finally {
      config.certSecret = original;
    }
  });

  test('each learner gets their own certificate', () => {
    complete('u1');
    complete('u2');
    const a = certificates.issue(user, 'linux-basics');
    const b = certificates.issue({ id: 'u2', name: 'Ben' }, 'linux-basics');
    expect(a.id).not.toBe(b.id);
    expect(certificates.listFor('u2').map((c) => c.studentName)).toEqual(['Ben']);
  });
});

describe('AI hub client', () => {
  function httpStub() {
    const stub = {
      posts: [],
      fail: false,
      post: jest.fn(async (url, body, options) => {
        stub.posts.push({ url, body, options });
        if (stub.fail) throw new Error('ECONNREFUSED');
        return { data: { data: { ok: true } } };
      }),
      get: jest.fn(async () => {
        if (stub.fail) throw new Error('ECONNREFUSED');
        return { data: {} };
      }),
    };
    return stub;
  }

  test('sends the internal token and timeout, and unwraps the response', async () => {
    const http = httpStub();
    const client = createClient({ baseUrl: 'http://hub:5000', token: 'shared', timeoutMs: 1234, http });
    await expect(client.scan('ls')).resolves.toEqual({ ok: true });
    expect(http.posts[0]).toEqual({
      url: 'http://hub:5000/api/agent/scan',
      body: { command: 'ls' },
      options: { timeout: 1234, headers: { 'x-internal-token': 'shared' } },
    });
  });

  test('after three failures the circuit opens and calls fail without touching the network', async () => {
    const http = httpStub();
    http.fail = true;
    const client = createClient({ baseUrl: 'http://hub:5000', http });

    for (let i = 0; i < 3; i += 1) await expect(client.hint({})).rejects.toBeInstanceOf(HubUnavailableError);
    expect(http.post).toHaveBeenCalledTimes(3);

    http.fail = false;
    await expect(client.hint({})).rejects.toThrow('circuit open');
    expect(http.post).toHaveBeenCalledTimes(3);
  });

  test('the circuit closes again after the cool-down', async () => {
    const http = httpStub();
    http.fail = true;
    const client = createClient({ baseUrl: 'http://hub:5000', http });
    for (let i = 0; i < 3; i += 1) await client.hint({}).catch(() => {});

    http.fail = false;
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 31000);
    try {
      await expect(client.hint({})).resolves.toEqual({ ok: true });
    } finally {
      Date.now.mockRestore();
    }
  });

  test('a connection reset on a stale keep-alive socket is retried once', async () => {
    const http = httpStub();
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    http.post.mockRejectedValueOnce(reset);
    const client = createClient({ baseUrl: 'http://hub:5000', http });

    await expect(client.hint({})).resolves.toEqual({ ok: true });
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  test('timeouts and HTTP errors are not retried', async () => {
    const http = httpStub();
    const client = createClient({ baseUrl: 'http://hub:5000', http });
    for (const error of [Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }), Object.assign(new Error('500'), { response: { status: 500 } })]) {
      http.post.mockClear();
      http.post.mockRejectedValueOnce(error);
      await expect(client.hint({})).rejects.toBeInstanceOf(HubUnavailableError);
      expect(http.post).toHaveBeenCalledTimes(1);
    }
  });

  test('a second reset in a row is reported as unavailable', async () => {
    const http = httpStub();
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    http.post.mockRejectedValueOnce(reset).mockRejectedValueOnce(reset);
    const client = createClient({ baseUrl: 'http://hub:5000', http });
    await expect(client.hint({})).rejects.toBeInstanceOf(HubUnavailableError);
  });

  test('a success resets the failure count', async () => {
    const http = httpStub();
    const client = createClient({ baseUrl: 'http://hub:5000', http });
    http.fail = true;
    await client.hint({}).catch(() => {});
    await client.hint({}).catch(() => {});
    http.fail = false;
    await client.hint({});
    http.fail = true;
    await client.hint({}).catch(() => {});
    await client.hint({}).catch(() => {});
    http.fail = false;
    await expect(client.hint({})).resolves.toEqual({ ok: true });
  });

  test('isHealthy reflects the hub health endpoint', async () => {
    const http = httpStub();
    const client = createClient({ baseUrl: 'http://hub:5000', http });
    expect(await client.isHealthy()).toBe(true);
    http.fail = true;
    expect(await client.isHealthy()).toBe(false);
  });
});

describe('AI hub client: streamed hints over real HTTP', () => {
  const http = require('http');
  let server;
  let baseUrl;
  let respond;
  let seen;

  beforeEach(async () => {
    seen = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        seen.push({ url: req.url, token: req.headers['x-internal-token'], body: JSON.parse(body) });
        respond(res);
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));

  const collect = async (client, options) => {
    const events = [];
    for await (const event of client.hintStream({ query: 'help', tier: 1 }, options)) events.push(event);
    return events;
  };
  const line = (event) => `${JSON.stringify(event)}\n`;

  test('events are parsed however the bytes are split', async () => {
    respond = (res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      const text = line({ type: 'delta', text: 'Look at the folder — then compare. ' }) + line({ type: 'delta', text: 'Done.' }) + line({ type: 'done', data: { hint: 'x' } });
      const bytes = Buffer.from(text);
      // Cut in awkward places, including inside the multi-byte dash.
      const cut = bytes.indexOf(Buffer.from('—')) + 1;
      res.write(bytes.subarray(0, cut));
      setTimeout(() => { res.write(bytes.subarray(cut, cut + 40)); res.end(bytes.subarray(cut + 40)); }, 20);
    };
    const events = await collect(createClient({ baseUrl, token: 'shared-secret', timeoutMs: 1000 }));
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
    expect(events[0].text).toBe('Look at the folder — then compare. ');
    expect(seen[0]).toMatchObject({ url: '/api/agent/hint/stream', token: 'shared-secret', body: { query: 'help', tier: 1 } });
  });

  test.each([
    ['ends without a final event', (res) => { res.writeHead(200); res.end(line({ type: 'delta', text: 'half' })); }],
    ['reports an error part-way', (res) => { res.writeHead(200); res.end(line({ type: 'delta', text: 'half' }) + line({ type: 'error' })); }],
    ['answers 500', (res) => { res.writeHead(500); res.end('{}'); }],
    ['sends something that is not JSON', (res) => { res.writeHead(200); res.end('<html>proxy error</html>\n'); }],
    ['drops the connection', (res) => { res.writeHead(200); res.write(line({ type: 'delta', text: 'half' })); setTimeout(() => res.destroy(), 20); }],
  ])('a hub that %s is reported as unavailable', async (_name, behave) => {
    respond = behave;
    await expect(collect(createClient({ baseUrl, timeoutMs: 1000 }))).rejects.toBeInstanceOf(HubUnavailableError);
  });

  test('a hub that goes quiet mid-stream is given up on', async () => {
    respond = (res) => { res.writeHead(200); res.write(line({ type: 'delta', text: 'half' })); };
    const started = Date.now();
    await expect(collect(createClient({ baseUrl, timeoutMs: 60 }))).rejects.toBeInstanceOf(HubUnavailableError);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('repeated stream failures open the circuit, so later calls fail at once', async () => {
    respond = (res) => { res.writeHead(500); res.end('{}'); };
    const client = createClient({ baseUrl, timeoutMs: 1000 });
    for (let i = 0; i < 3; i += 1) await expect(collect(client)).rejects.toBeInstanceOf(HubUnavailableError);
    const calls = seen.length;
    await expect(collect(client)).rejects.toThrow('circuit open');
    await expect(client.hint({ query: 'help' })).rejects.toThrow('circuit open');
    expect(seen.length).toBe(calls);
  });

  test('stopping early closes the connection to the hub', async () => {
    let closed = false;
    respond = (res) => {
      res.writeHead(200);
      res.on('close', () => { closed = true; });
      res.write(line({ type: 'delta', text: 'one ' }));
    };
    const client = createClient({ baseUrl, timeoutMs: 5000 });
    for await (const event of client.hintStream({ query: 'help' })) {
      expect(event.type).toBe('delta');
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(closed).toBe(true);
  });
});

describe('config', () => {
  test.each([
    ['opsacademy-ai-hub', 'http://opsacademy-ai-hub:5000'],
    ['opsacademy-ai-hub:10000', 'http://opsacademy-ai-hub:10000'],
    ['http://localhost:5000/', 'http://localhost:5000'],
    ['https://hub.example.com', 'https://hub.example.com'],
  ])('AI_HUB_URL %s is normalised to %s', (raw, expected) => {
    process.env.AI_HUB_URL = raw;
    let isolated;
    jest.isolateModules(() => { isolated = require('../config'); });
    delete process.env.AI_HUB_URL;
    expect(isolated.aiHubUrl).toBe(expected);
  });

  test('with no AI_HUB_URL the hub is expected on its local default port', () => {
    const saved = process.env.AI_HUB_URL;
    delete process.env.AI_HUB_URL;
    let isolated;
    jest.isolateModules(() => {
      jest.doMock('dotenv', () => ({ config: () => ({}) }));
      isolated = require('../config');
    });
    if (saved !== undefined) process.env.AI_HUB_URL = saved;
    expect(isolated.aiHubUrl).toBe('http://localhost:5005');
  });

  test('production refuses to start with the default JWT secret', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    try {
      jest.isolateModules(() => {
        // Keep the real .env out of this test.
        jest.doMock('dotenv', () => ({ config: () => ({}) }));
        expect(() => require('../config')).toThrow(/JWT_SECRET must be set/);
      });
    } finally {
      Object.assign(process.env, saved);
    }
  });
});

describe('telemetry parsing', () => {
  test('listening ports are read from netstat and ss output', () => {
    const netstat = 'Proto Recv-Q Send-Q Local Address Foreign Address State\ntcp 0 0 0.0.0.0:8080 0.0.0.0:* LISTEN\ntcp 0 0 :::22 :::* LISTEN\ntcp 0 0 10.0.0.5:55012 1.1.1.1:443 ESTABLISHED';
    expect(telemetry.parsePorts(netstat)).toEqual([22, 8080]);
    expect(telemetry.parsePorts('State Recv-Q Send-Q Local Address:Port Peer\nLISTEN 0 128 0.0.0.0:3000 0.0.0.0:*')).toEqual([3000]);
    expect(telemetry.parsePorts('')).toEqual([]);
  });

  test('processes are parsed below the header line', () => {
    expect(telemetry.parseProcesses('PID USER COMMAND\n  1 student /bin/sh\n 12 student python3 -m http.server 8080')).toEqual([
      { pid: '1', user: 'student', command: '/bin/sh' },
      { pid: '12', user: 'student', command: 'python3 -m http.server 8080' },
    ]);
  });

  test('a file named like a directory is still a file', () => {
    expect(telemetry.parseFiles('d /home/student/app\nf /home/student/Makefile\nf /home/student/app/README')).toEqual([
      { name: 'app', path: 'app', type: 'directory', depth: 0 },
      { name: 'Makefile', path: 'Makefile', type: 'file', depth: 0 },
      { name: 'README', path: 'app/README', type: 'file', depth: 1 },
    ]);
  });
});

describe('expired guests', () => {
  test('guests past their token lifetime are removed with their progress; everyone else stays', async () => {
    const now = Date.now();
    const backdate = (user, days) => {
      const { getStore } = require('../lib/store');
      getStore().set('users', user.id, { ...user, createdAt: new Date(now - days * DAY).toISOString() });
    };

    const oldGuest = users.createGuest();
    const oldGuestWithXp = users.createGuest();
    const recentGuest = users.createGuest();
    const upgraded = await users.register({ name: 'Asha Rao', email: 'asha@example.com', password: 'correct-horse' }, users.createGuest().id);
    backdate(oldGuest, 40);
    backdate(oldGuestWithXp, 32);
    backdate(recentGuest, 29);
    backdate(upgraded, 400);
    progress.recordQuiz(oldGuestWithXp.id, 'linux-basics', 'q1');
    progress.recordQuiz(upgraded.id, 'linux-basics', 'q1');
    expect(progress.leaderboard()).toHaveLength(2);

    expect(users.pruneExpiredGuests(now)).toBe(2);

    expect(users.getById(oldGuest.id)).toBeNull();
    expect(users.getById(oldGuestWithXp.id)).toBeNull();
    expect(users.getById(recentGuest.id)).not.toBeNull();
    expect(users.getById(upgraded.id)).toMatchObject({ guest: false, name: 'Asha Rao' });
    expect(progress.summary(oldGuestWithXp.id).xp).toBe(0);
    expect(progress.summary(upgraded.id).xp).toBe(progress.XP.quiz);
    expect(progress.leaderboard().map((row) => row.name)).toEqual(['Asha Rao']);
    await expect(users.login({ email: 'asha@example.com', password: 'correct-horse' })).resolves.toMatchObject({ id: upgraded.id });

    // Nothing left to remove on the next run.
    expect(users.pruneExpiredGuests(now)).toBe(0);
  });
});

describe('leaderboard cache', () => {
  test('saving progress does not force a rescan; the cache lasts one TTL', () => {
    const { getStore } = require('../lib/store');
    const learner = users.createGuest();
    const start = Date.now();
    progress.recordQuiz(learner.id, 'linux-basics', 'q1');
    expect(progress.leaderboard(20, start)[0].xp).toBe(progress.XP.quiz);

    const scan = jest.spyOn(getStore(), 'all');
    progress.recordInterview(learner.id, 'linux-basics', 'q2', 100);
    const cached = progress.leaderboard(20, start + 1000);
    expect(scan).not.toHaveBeenCalled();
    expect(cached[0].xp).toBe(progress.XP.quiz);

    expect(progress.leaderboard(20, start + 15 * 1000)[0].xp).toBe(progress.XP.quiz + progress.XP.interview);
    expect(scan).toHaveBeenCalledTimes(1);
    scan.mockRestore();
  });
});

describe('telemetry snapshot', () => {
  test('one command per snapshot, split back into files, processes and ports', async () => {
    const calls = [];
    const manager = {
      exec: async (sessionId, command, options) => {
        calls.push({ sessionId, command, options });
        return {
          exitCode: 0,
          stderr: '',
          stdout: [
            '@@opsacademy-section@@ files',
            'd /home/student/webapp',
            'f /home/student/webapp/index.html',
            '@@opsacademy-section@@ processes',
            'PID USER COMMAND',
            '1 student /bin/sh',
            '42 student python3 -m http.server 8000',
            '@@opsacademy-section@@ ports',
            'tcp 0 0 127.0.0.1:8000 0.0.0.0:* LISTEN',
            '',
          ].join('\n'),
        };
      },
    };

    const snapshot = await telemetry.capture('session-1', { touch: false, manager });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sessionId: 'session-1', command: telemetry.SNAPSHOT_COMMAND, options: { touch: false } });
    expect(snapshot.fileTree.map((f) => `${f.type}:${f.path}`)).toEqual(['directory:webapp', 'file:webapp/index.html']);
    expect(snapshot.processes.map((p) => p.pid)).toEqual(['1', '42']);
    expect(snapshot.ports).toEqual([8000]);
  });

  test('a file whose name looks like a marker cannot move later lines into another part', () => {
    const sections = telemetry.splitSections([
      '@@opsacademy-section@@ files',
      'f /home/student/@@opsacademy-section@@ ports',
      'f /home/student/notes.txt',
      '@@opsacademy-section@@ ports',
      'tcp 0 0 127.0.0.1:22 0.0.0.0:* LISTEN',
    ].join('\n'));
    expect(sections.files).toContain('notes.txt');
    expect(sections.files).toContain('@@opsacademy-section@@ ports');
    expect(sections.ports).not.toContain('notes.txt');
  });

  test('a sandbox that has gone away gives an empty snapshot', async () => {
    const snapshot = await telemetry.capture('gone', { manager: { exec: async () => { throw new Error('Sandbox session not found'); } } });
    expect(snapshot).toMatchObject({ fileTree: [], processes: [], ports: [], truncated: false });
  });
});
