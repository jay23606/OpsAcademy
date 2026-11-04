const request = require('supertest');
const config = require('../config');
const units = require('../lib/units');
const pty = require('../services/ptyService');
const { createApp } = require('../app');
const { fakeEngine, install } = require('./helpers');

let app;
let ctx;

/** A fake engine that makes every lab check pass or fail on demand. */
function labEngine() {
  const engine = fakeEngine();
  engine.passing = true;
  engine.exec = (engineId, command) => {
    for (const meta of units.listMeta()) {
      const step = units.getSteps(meta.id).find((s) => s.verification.command === command);
      if (step) {
        return Promise.resolve({ exitCode: 0, stdout: engine.passing ? step.verification.expectedOutput : 'FAIL', stderr: '' });
      }
    }
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  };
  return engine;
}

function setup(options = {}) {
  ctx = install({ engine: labEngine(), ...options });
  app = createApp();
}

async function guest() {
  const res = await request(app).post('/api/auth/guest');
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

async function registered(overrides = {}) {
  const body = { name: 'Asha Rao', email: `asha${Math.random().toString(36).slice(2)}@example.com`, password: 'correct-horse', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body);
  return { ...body, token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` }, res };
}

async function startSandbox(who, labId = 'linux-basics') {
  const res = await request(app).post('/api/sandbox/start').set(who.auth).send({ labId });
  return res.body.data;
}

beforeEach(() => setup());
afterEach(async () => { await ctx.manager.shutdown(); });

describe('health and readiness', () => {
  test('health is public and reports the sandbox mode', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', sandboxMode: config.sandboxMode });
  });

  test('ready reports degraded, not failed, when the AI hub is down', async () => {
    expect((await request(app).get('/api/ready')).body.status).toBe('ready');
    ctx.hub.down = true;
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { store: true, aiHub: false } });
  });

  test('ready fails when the store cannot be written', async () => {
    ctx.store.isWritable = () => false;
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  test('preflight answers can be cached by the browser', async () => {
    const res = await request(app)
      .options('/api/progress')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-max-age']).toBe('7200');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  test('unknown API paths return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });

  test('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('auth', () => {
  test('guest tokens identify a distinct user', async () => {
    const a = await guest();
    const b = await guest();
    expect(a.user).toMatchObject({ guest: true, email: null });
    expect(a.user.id).not.toBe(b.user.id);

    const me = await request(app).get('/api/auth/me').set(a.auth);
    expect(me.body.user).toEqual(a.user);
  });

  test('register returns a token and never returns the password hash', async () => {
    const user = await registered();
    expect(user.res.status).toBe(201);
    expect(user.user).toEqual({ id: expect.any(String), name: 'Asha Rao', email: user.email, guest: false, emailVerified: false, profileSlug: null });
    expect(JSON.stringify(user.res.body)).not.toMatch(/password|\$2[aby]\$/);
  });

  test('passwords are stored hashed', async () => {
    const user = await registered();
    const stored = ctx.store.get('users', user.user.id);
    expect(stored.password).not.toBe(user.password);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });

  test('registering as a guest keeps the same account and its progress', async () => {
    const visitor = await guest();
    const session = await startSandbox(visitor);
    await request(app).post('/api/labs/linux-basics/verify').set(visitor.auth).send({ sessionId: session.sessionId, stepNumber: 1 });

    const res = await request(app).post('/api/auth/register').set(visitor.auth)
      .send({ name: 'Asha', email: 'asha@example.com', password: 'correct-horse' });

    expect(res.body.user).toMatchObject({ id: visitor.user.id, guest: false, name: 'Asha' });
    const progress = await request(app).get('/api/progress').set({ Authorization: `Bearer ${res.body.token}` });
    expect(progress.body.data.xp).toBe(20);
  });

  test.each([
    [{ email: 'a@example.com', password: 'correct-horse' }, /Name/],
    [{ name: 'A', email: 'not-an-email', password: 'correct-horse' }, /email/],
    [{ name: 'A', email: 'a@example.com', password: 'short' }, /at least 8/],
    [{ name: 'A', email: 'a@example.com' }, /Password/],
    [{ name: { $gt: '' }, email: 'a@example.com', password: 'correct-horse' }, /Name/],
  ])('register rejects %j', async (body, message) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  test('register rejects a duplicate email, case-insensitively', async () => {
    const user = await registered({ email: 'dup@example.com' });
    expect(user.res.status).toBe(201);
    const res = await request(app).post('/api/auth/register').send({ name: 'B', email: 'DUP@Example.com', password: 'correct-horse' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });

  test('login works with the right password and fails the same way for wrong password or unknown email', async () => {
    const user = await registered();

    const ok = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password: user.password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe(user.user.id);

    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  test('login without credentials is a 400', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
  });

  test.each([
    ['no header', {}],
    ['garbage token', { Authorization: 'Bearer not.a.jwt' }],
    ['wrong scheme', { Authorization: 'Basic abc' }],
  ])('protected routes reject %s', async (_label, headers) => {
    const res = await request(app).get('/api/auth/me').set(headers);
    expect(res.status).toBe(401);
  });

  test('a token signed with another secret is rejected', async () => {
    const forged = require('jsonwebtoken').sign({ id: 'u_admin', name: 'x' }, 'some-other-secret');
    const res = await request(app).get('/api/progress').set({ Authorization: `Bearer ${forged}` });
    expect(res.status).toBe(401);
  });

  test('an unsigned (alg none) token is rejected', async () => {
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 'u_admin' })}.`;
    const res = await request(app).get('/api/progress').set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  test('sign-in attempts are rate limited', async () => {
    // Build a separate app in its own module registry so the low limit
    // does not leak into the other tests.
    process.env.RATE_LIMIT_AUTH = '3';
    let limitedApp;
    jest.isolateModules(() => {
      limitedApp = require('../app').createApp();
    });
    delete process.env.RATE_LIMIT_AUTH;

    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(limitedApp).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' })).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  test('students sharing one address each get their own request budget, but sign-in attempts do not', async () => {
    process.env.RATE_LIMIT_API = '4';
    process.env.RATE_LIMIT_AUTH = '3';
    let limitedApp;
    jest.isolateModules(() => {
      limitedApp = require('../app').createApp();
    });
    delete process.env.RATE_LIMIT_API;
    delete process.env.RATE_LIMIT_AUTH;

    // Two guests behind the same address (creating them uses the shared, per-address budget).
    const tokens = [];
    for (let i = 0; i < 2; i += 1) tokens.push((await request(limitedApp).post('/api/auth/guest')).body.token);
    const hit = (token) => request(limitedApp).get('/api/progress').set(token ? { Authorization: `Bearer ${token}` } : {}).then((res) => res.status);

    const first = [];
    for (let i = 0; i < 5; i += 1) first.push(await hit(tokens[0]));
    expect(first).toEqual([200, 200, 200, 200, 429]);
    // The second student is not slowed down by the first.
    expect(await hit(tokens[1])).toBe(200);
    // A made-up token earns no budget of its own: it counts against the address.
    expect(await hit('not-a-real-token')).toBe(401);

    // Sending a guest token with a sign-in attempt does not buy extra attempts.
    const attempts = [];
    for (let i = 0; i < 4; i += 1) {
      const fresh = tokens[i % 2];
      attempts.push((await request(limitedApp).post('/api/auth/login').set({ Authorization: `Bearer ${fresh}` }).send({ email: 'a@example.com', password: 'x' })).status);
    }
    expect(attempts.filter((status) => status === 429).length).toBeGreaterThan(0);
  });
});

describe('password reset and email confirmation', () => {
  const tokenFrom = (message) => message.text.match(/token=([\w-]+)/)[1];
  const lastMail = () => ctx.mailer.outbox[ctx.mailer.outbox.length - 1];

  test('a reset link sets a new password, works once, and signs out older sessions', async () => {
    const user = await registered();
    const before = ctx.mailer.outbox.length;

    const asked = await request(app).post('/api/auth/forgot').send({ email: user.email.toUpperCase() });
    expect(asked.status).toBe(200);
    expect(ctx.mailer.outbox).toHaveLength(before + 1);
    expect(lastMail()).toMatchObject({ to: user.email, subject: expect.stringMatching(/reset/i) });
    expect(lastMail().text).toContain(`${config.appUrl}/reset-password?token=`);
    const token = tokenFrom(lastMail());

    // Token issue times have one-second precision, so step past that second.
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
    let reset;
    try {
      reset = await request(app).post('/api/auth/reset').send({ token, password: 'a-brand-new-password' });
    } finally {
      Date.now.mockRestore();
    }
    expect(reset.status).toBe(200);
    expect(reset.body.user).toMatchObject({ id: user.user.id, emailVerified: true });
    expect(JSON.stringify(reset.body)).not.toMatch(/\$2[aby]\$/);

    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'a-brand-new-password' })).status).toBe(200);

    // The link cannot be used a second time.
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'another-password-1' })).status).toBe(400);

    // A session from before the reset no longer works (a thief's token dies with it).
    expect((await request(app).get('/api/progress').set(user.auth)).status).toBe(401);
  });

  test('asking for a reset answers the same whether or not the account exists', async () => {
    const user = await registered();
    const known = await request(app).post('/api/auth/forgot').send({ email: user.email });
    const unknown = await request(app).post('/api/auth/forgot').send({ email: 'nobody@example.com' });
    const strip = ({ devResetLink, ...rest }) => rest;
    expect(strip(unknown.body)).toEqual(strip(known.body));
    expect(unknown.status).toBe(known.status);
    expect((await request(app).post('/api/auth/forgot').send({})).status).toBe(200);
  });

  test.each([
    ['a made-up token', 'x'.repeat(43), 'long-enough-password', /invalid or has expired/],
    ['no token', undefined, 'long-enough-password', /invalid or has expired/],
    ['a short password', null, 'short', /at least 8/],
  ])('reset is refused for %s', async (_name, token, password, message) => {
    const user = await registered();
    await request(app).post('/api/auth/forgot').send({ email: user.email });
    const res = await request(app).post('/api/auth/reset').send({ token: token === null ? tokenFrom(lastMail()) : token, password });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).status).toBe(200);
  });

  test('a reset link expires after 30 minutes, and a newer link replaces an older one', async () => {
    const user = await registered();
    await request(app).post('/api/auth/forgot').send({ email: user.email });
    const first = tokenFrom(lastMail());
    await request(app).post('/api/auth/forgot').send({ email: user.email });
    const second = tokenFrom(lastMail());
    expect(second).not.toBe(first);
    expect((await request(app).post('/api/auth/reset').send({ token: first, password: 'long-enough-password' })).status).toBe(400);

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 31 * 60000);
    try {
      expect((await request(app).post('/api/auth/reset').send({ token: second, password: 'long-enough-password' })).status).toBe(400);
    } finally {
      Date.now.mockRestore();
    }
  });

  test('registering sends a confirmation link that marks the email as confirmed', async () => {
    const user = await registered();
    expect(user.user.emailVerified).toBe(false);
    expect(lastMail()).toMatchObject({ to: user.email, subject: expect.stringMatching(/confirm/i) });
    const token = tokenFrom(lastMail());

    // A reset token is not accepted as a confirmation token, and the reverse.
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'long-enough-password' })).status).toBe(400);

    await request(app).post('/api/auth/resend-verification').set(user.auth);
    const fresh = tokenFrom(lastMail());
    const confirmed = await request(app).post('/api/auth/verify-email').send({ token: fresh });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.user.emailVerified).toBe(true);
    expect((await request(app).get('/api/auth/me').set(user.auth)).body.user.emailVerified).toBe(true);
    expect((await request(app).post('/api/auth/verify-email').send({ token: fresh })).status).toBe(400);
    expect((await request(app).post('/api/auth/resend-verification').set(user.auth)).body.alreadyVerified).toBe(true);

    const visitor = await guest();
    expect((await request(app).post('/api/auth/resend-verification').set(visitor.auth)).status).toBe(403);
  });

  test('links are handed back only outside production, and only when no mail provider is set', async () => {
    const user = await registered();
    expect(user.res.body.devVerifyLink).toContain('/verify-email?token=');
    const asked = await request(app).post('/api/auth/forgot').send({ email: user.email });
    expect(asked.body).toMatchObject({ emailConfigured: false, devResetLink: expect.stringContaining('/reset-password?token=') });

    config.isProd = true;
    try {
      const inProd = await request(app).post('/api/auth/forgot').send({ email: user.email });
      expect(inProd.body.devResetLink).toBeUndefined();
      expect(JSON.stringify(inProd.body)).not.toContain('token=');
    } finally {
      config.isProd = false;
    }
  });
});

describe('public profile', () => {
  test('a profile is private until its owner shares it, and shows achievements only', async () => {
    const owner = await registered({ name: 'Meera Nair' });
    const { sessionId } = await startSandbox(owner);
    await request(app).post('/api/labs/linux-basics/verify').set(owner.auth).send({ sessionId });
    const cert = await request(app).post('/api/certificates').set(owner.auth).send({ unitId: 'linux-basics' });

    expect(owner.user.profileSlug).toBeNull();
    const shared = await request(app).post('/api/auth/profile').set(owner.auth).send({ public: true });
    expect(shared.status).toBe(200);
    const slug = shared.body.user.profileSlug;
    expect(slug).toMatch(/^meera-nair-[0-9a-f]{6}$/);

    const page = await request(app).get(`/api/profiles/${slug}`);
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({
      name: 'Meera Nair',
      xp: expect.any(Number),
      level: expect.any(Number),
      completedUnits: [{ unitId: 'linux-basics', title: units.getUnit('linux-basics').meta.title, completedAt: expect.any(Number) }],
      certificates: [{ id: cert.body.data.id, unitId: 'linux-basics' }],
    });
    // Nothing private: no email, account id, weak topics or hint counts.
    const text = JSON.stringify(page.body);
    expect(text).not.toContain(owner.email);
    expect(text).not.toContain(owner.user.id);
    expect(text).not.toMatch(/weakTopics|hints|fails|password/);

    // Turning it off hides the page; turning it on again brings back the same address.
    await request(app).post('/api/auth/profile').set(owner.auth).send({ public: false });
    expect((await request(app).get(`/api/profiles/${slug}`)).status).toBe(404);
    const again = await request(app).post('/api/auth/profile').set(owner.auth).send({ public: true });
    expect(again.body.user.profileSlug).toBe(slug);
  });

  test.each(['nobody-000000', '..%2F..%2Fetc', 'A', 'x'.repeat(80)])('GET /api/profiles/%s -> 404', async (slug) => {
    expect((await request(app).get(`/api/profiles/${slug}`)).status).toBe(404);
  });

  test('a guest cannot have a profile page', async () => {
    const visitor = await guest();
    expect((await request(app).post('/api/auth/profile').set(visitor.auth).send({ public: true })).status).toBe(403);
  });
});

describe('lab of the day', () => {
  beforeEach(() => { config.dailyChallenge = true; });
  afterEach(() => { config.dailyChallenge = false; });

  test('verifying a step in today\'s unit earns the bonus once per day', async () => {
    const progressService = require('../services/progressService');
    const today = progressService.dailyUnit();
    const other = units.listMeta().find((meta) => meta.id !== today.id && units.getSteps(meta.id).length > 0);
    const learner = await guest();

    const summary = (await request(app).get('/api/progress').set(learner.auth)).body.data;
    expect(summary.daily).toMatchObject({ unitId: today.id, title: today.title, done: false, bonusXp: 15 });

    // A different unit earns no bonus.
    const elsewhere = await startSandbox(learner, other.id);
    const plain = await request(app).post(`/api/labs/${other.id}/verify`).set(learner.auth).send({ sessionId: elsewhere.sessionId, stepNumber: 1 });
    expect(plain.body).toMatchObject({ xpEarned: 20, dailyBonus: 0 });

    const session = await startSandbox(learner, today.id);
    const first = await request(app).post(`/api/labs/${today.id}/verify`).set(learner.auth).send({ sessionId: session.sessionId, stepNumber: 1 });
    expect(first.body).toMatchObject({ xpEarned: 35, dailyBonus: 15 });
    const second = await request(app).post(`/api/labs/${today.id}/verify`).set(learner.auth).send({ sessionId: session.sessionId, stepNumber: 1 });
    expect(second.body).toMatchObject({ xpEarned: 0, dailyBonus: 0 });
    expect((await request(app).get('/api/progress').set(learner.auth)).body.data.daily.done).toBe(true);
  });

  test('a failed check does not earn the bonus', async () => {
    const progressService = require('../services/progressService');
    const today = progressService.dailyUnit();
    const learner = await guest();
    const session = await startSandbox(learner, today.id);
    ctx.engine.passing = false;
    const res = await request(app).post(`/api/labs/${today.id}/verify`).set(learner.auth).send({ sessionId: session.sessionId, stepNumber: 1 });
    expect(res.body).toMatchObject({ allPassed: false, dailyBonus: 0 });
  });

  test('everyone gets the same unit on a day, and it changes over time', () => {
    const progressService = require('../services/progressService');
    const day = Date.UTC(2026, 9, 7, 3);
    expect(progressService.dailyUnit(day).id).toBe(progressService.dailyUnit(day + 20 * 3600000).id);
    const month = new Set(Array.from({ length: 30 }, (_, i) => progressService.dailyUnit(day + i * 86400000).id));
    expect(month.size).toBeGreaterThan(5);
  });
});

describe('units', () => {
  test('lists every unit', async () => {
    const res = await request(app).get('/api/units');
    expect(res.body.count).toBe(units.listMeta().length);
    expect(res.body.data.map((u) => u.id)).toContain('linux-basics');
  });

  test('unit metadata says which units have a case study', async () => {
    const list = (await request(app).get('/api/units')).body.data;
    const withStudy = list.filter((u) => u.hasCaseStudy).map((u) => u.id).sort();
    expect(withStudy).toEqual(['digital-forensics', 'endpoint-security', 'realworld-internship-case-study']);
    expect((await request(app).get('/api/units/linux-basics')).body.data.hasCaseStudy).toBe(false);
    for (const id of withStudy) {
      expect((await request(app).get(`/api/units/${id}/casestudy`)).status).toBe(200);
    }
  });

  test('practice content does not include the verification commands', async () => {
    const res = await request(app).get('/api/units/linux-basics/practice');
    expect(res.status).toBe(200);
    expect(res.body.data.steps[0]).toMatchObject({ step: 1, autoVerified: true });
    expect(JSON.stringify(res.body)).not.toContain('verification');
  });

  test('learn and prepare content are served', async () => {
    expect((await request(app).get('/api/units/linux-basics/learn')).body.data.sections.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/units/linux-basics/prepare')).body.data.flashcards.length).toBeGreaterThan(0);
  });

  test('lesson content is compressed and cacheable; errors and personal data are not cached', async () => {
    const learn = await request(app).get('/api/units/linux-basics/learn').set('Accept-Encoding', 'gzip');
    expect(learn.headers['content-encoding']).toBe('gzip');
    expect(learn.headers['cache-control']).toBe('public, max-age=300');
    expect(learn.headers.etag).toBeDefined();
    expect(learn.body.data.sections.length).toBeGreaterThan(0);

    // The browser's revalidation costs no body at all.
    const revalidated = await request(app).get('/api/units/linux-basics/learn').set('If-None-Match', learn.headers.etag);
    expect(revalidated.status).toBe(304);

    expect((await request(app).get('/api/units')).headers['cache-control']).toBe('public, max-age=300');
    expect((await request(app).get('/api/units/does-not-exist')).headers['cache-control']).toBeUndefined();
    const visitor = await guest();
    expect((await request(app).get('/api/progress').set(visitor.auth)).headers['cache-control']).toBeUndefined();
  });

  test.each([
    ['/api/units/does-not-exist', 404],
    ['/api/units/linux-basics/secrets', 400],
    ['/api/units/linux-basics/casestudy', 404],
    ['/api/units/..%2F..%2Fconfig/learn', 404],
    ['/api/units/%2e%2e/practice', 404],
  ])('GET %s -> %i', async (url, status) => {
    expect((await request(app).get(url)).status).toBe(status);
  });
});

describe('sandbox ownership', () => {
  test('starting a sandbox needs a token', async () => {
    expect((await request(app).post('/api/sandbox/start').send({})).status).toBe(401);
  });

  test('the owner can use their sandbox', async () => {
    const owner = await guest();
    const session = await startSandbox(owner);
    expect(session).toMatchObject({ labId: 'linux-basics', userId: owner.user.id, wsUrl: `/api/terminal?sessionId=${session.sessionId}` });

    for (const path of ['status', 'telemetry', 'history']) {
      expect((await request(app).get(`/api/sandbox/${session.sessionId}/${path}`).set(owner.auth)).status).toBe(200);
    }
    expect((await request(app).post(`/api/sandbox/${session.sessionId}/reset`).set(owner.auth)).status).toBe(200);
  });

  test("another user gets 404 for someone else's sandbox on every route", async () => {
    const owner = await guest();
    const intruder = await guest();
    const { sessionId } = await startSandbox(owner);

    const attempts = [
      request(app).get(`/api/sandbox/${sessionId}/status`),
      request(app).get(`/api/sandbox/${sessionId}/telemetry`),
      request(app).get(`/api/sandbox/${sessionId}/history`),
      request(app).post(`/api/sandbox/${sessionId}/reset`),
      request(app).delete(`/api/sandbox/${sessionId}`),
      request(app).post('/api/labs/linux-basics/verify').send({ sessionId }),
    ];
    for (const attempt of attempts) {
      expect((await attempt.set(intruder.auth)).status).toBe(404);
    }
    expect(ctx.manager.getSession(sessionId)).not.toBeNull();
  });

  test('listing shows only your own sandboxes', async () => {
    const a = await guest();
    const b = await guest();
    const mine = await startSandbox(a);
    await startSandbox(b);

    const res = await request(app).get('/api/sandbox').set(a.auth);
    expect(res.body.data.map((s) => s.sessionId)).toEqual([mine.sessionId]);
  });

  test('public stats expose no session or user ids', async () => {
    const owner = await guest();
    const session = await startSandbox(owner);
    const res = await request(app).get('/api/sandbox/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.activeSessions).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(session.sessionId);
    expect(JSON.stringify(res.body)).not.toContain(owner.user.id);
  });

  test('stop destroys the sandbox', async () => {
    const owner = await guest();
    const { sessionId } = await startSandbox(owner);
    expect((await request(app).delete(`/api/sandbox/${sessionId}`).set(owner.auth)).status).toBe(200);
    expect((await request(app).get(`/api/sandbox/${sessionId}/status`).set(owner.auth)).status).toBe(404);
  });

  test('the per-user limit returns 429 with a clear message', async () => {
    const owner = await guest();
    const labs = units.listMeta().map((meta) => meta.id);
    for (let i = 0; i < config.sandbox.maxPerUser; i += 1) await startSandbox(owner, labs[i]);
    const res = await request(app).post('/api/sandbox/start').set(owner.auth).send({});
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Stop one first/);
  });

  test('starting a lab that is already running hands back the same sandbox', async () => {
    const owner = await guest();
    const other = await guest();
    const first = await request(app).post('/api/sandbox/start').set(owner.auth).send({ labId: 'linux-basics' });
    expect(first.status).toBe(201);
    expect(first.body.data.resumed).toBe(false);

    // A second tab, or a page whose terminal dropped, must not use up another slot.
    const again = await request(app).post('/api/sandbox/start').set(owner.auth).send({ labId: 'linux-basics' });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ sessionId: first.body.data.sessionId, resumed: true });
    expect(ctx.engine.created).toHaveLength(1);

    // A different lab, or a different user, still gets a sandbox of their own.
    expect((await startSandbox(owner, 'git-basics')).sessionId).not.toBe(first.body.data.sessionId);
    expect((await startSandbox(other)).sessionId).not.toBe(first.body.data.sessionId);

    // Once stopped, the next start is a fresh sandbox.
    await request(app).delete(`/api/sandbox/${first.body.data.sessionId}`).set(owner.auth);
    const fresh = await request(app).post('/api/sandbox/start').set(owner.auth).send({ labId: 'linux-basics' });
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.sessionId).not.toBe(first.body.data.sessionId);
  });

  test('the page is told when the sandbox will close, and can ask to keep it', async () => {
    const owner = await guest();
    const other = await guest();
    const { sessionId } = await startSandbox(owner);
    const startedAt = ctx.manager.getSession(sessionId).lastActiveAt;
    const idleMs = config.sandbox.maxInactivityMinutes * 60000;

    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 10 * 60000);
    try {
      const history = await request(app).get(`/api/sandbox/${sessionId}/history`).set(owner.auth);
      expect(history.body.session).toEqual({
        expiresAt: ctx.manager.getSession(sessionId).createdAt + config.sandbox.maxSessionMinutes * 60000,
        idleExpiresAt: startedAt + idleMs,
        serverTime: startedAt + 10 * 60000,
      });

      const kept = await request(app).post(`/api/sandbox/${sessionId}/keepalive`).set(owner.auth);
      expect(kept.status).toBe(200);
      expect(kept.body.session.idleExpiresAt).toBe(startedAt + 10 * 60000 + idleMs);
      // The hard limit on a session's age is not extended by it.
      expect(kept.body.session.expiresAt).toBe(history.body.session.expiresAt);

      expect((await request(app).post(`/api/sandbox/${sessionId}/keepalive`).set(other.auth)).status).toBe(404);
    } finally {
      Date.now.mockRestore();
    }
    expect(await ctx.manager.sweep(startedAt + 16 * 60000)).toEqual([]);
    expect(await ctx.manager.sweep(startedAt + 26 * 60000)).toEqual([{ sessionId, reason: 'idle' }]);
  });

  test('the inspector polling telemetry does not keep an unused sandbox alive', async () => {
    const owner = await guest();
    const { sessionId } = await startSandbox(owner);
    const startedAt = ctx.manager.getSession(sessionId).lastActiveAt;

    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 5 * 60000);
    try {
      await request(app).get(`/api/sandbox/${sessionId}/telemetry`).set(owner.auth);
      await request(app).get(`/api/sandbox/${sessionId}/history`).set(owner.auth);
      expect(ctx.manager.getSession(sessionId).lastActiveAt).toBe(startedAt);

      // Real work in the sandbox still counts as activity.
      await request(app).post('/api/labs/linux-basics/verify').set(owner.auth).send({ sessionId, stepNumber: 1 });
      expect(ctx.manager.getSession(sessionId).lastActiveAt).toBe(startedAt + 5 * 60000);
    } finally {
      Date.now.mockRestore();
    }
  });

  test('an invalid labId falls back to a plain sandbox', async () => {
    const owner = await guest();
    expect((await startSandbox(owner, '../../etc')).labId).toBe('sandbox');
  });
});

describe('admin', () => {
  test('admin routes do not exist unless ADMIN_TOKEN is configured', async () => {
    expect((await request(app).get('/api/admin/sandboxes').set('x-admin-token', 'anything')).status).toBe(404);
  });

  describe('with ADMIN_TOKEN set', () => {
    beforeEach(() => { config.adminToken = 'operator-secret'; });
    afterEach(() => { config.adminToken = null; });

    test('rejects a missing or wrong token', async () => {
      expect((await request(app).get('/api/admin/sandboxes')).status).toBe(403);
      expect((await request(app).get('/api/admin/sandboxes').set('x-admin-token', 'operator-secreT')).status).toBe(403);
    });

    test('lists and stops any sandbox', async () => {
      const owner = await guest();
      const { sessionId } = await startSandbox(owner);
      const admin = { 'x-admin-token': 'operator-secret' };

      const list = await request(app).get('/api/admin/sandboxes').set(admin);
      expect(list.body.data.map((s) => s.sessionId)).toEqual([sessionId]);

      expect((await request(app).delete(`/api/admin/sandboxes/${sessionId}`).set(admin)).status).toBe(200);
      expect((await request(app).delete(`/api/admin/sandboxes/${sessionId}`).set(admin)).status).toBe(404);
      expect((await request(app).post('/api/admin/pool/refill').set(admin)).status).toBe(200);
    });

    test('the overview reports sandboxes, accounts and what is configured', async () => {
      await registered();
      const visitor = await guest();
      const { sessionId } = await startSandbox(visitor);
      await request(app).post('/api/labs/linux-basics/verify').set(visitor.auth).send({ sessionId, stepNumber: 1 });

      expect((await request(app).get('/api/admin/overview')).status).toBe(403);
      const res = await request(app).get('/api/admin/overview').set('x-admin-token', 'operator-secret');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        users: { registered: 1, guests: 1 },
        progress: { learnersWithXp: 1, totalXp: 20 },
        certificates: 0,
        sandbox: { activeSessions: 1 },
        services: { aiHub: true, storeWritable: true, emailDelivers: false },
        limits: { maxPerUser: config.sandbox.maxPerUser },
      });
      expect(res.body.data.sandboxes.map((s) => s.sessionId)).toEqual([sessionId]);
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$|password/);
    });
  });
});

describe('metrics', () => {
  test('exposes Prometheus metrics including sandbox gauges', async () => {
    const owner = await guest();
    await startSandbox(owner);
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/opsacademy_sandboxes_active 1/);
    expect(res.text).toMatch(/opsacademy_http_request_duration_seconds_count\{[^}]*route="\/api\/sandbox\/start"/);
    expect(res.text).toMatch(/opsacademy_sandbox_claim_duration_seconds_count\{source="cold"\}/);
  });

  test('requires the bearer token when METRICS_TOKEN is set', async () => {
    config.metricsToken = 'scrape-me';
    try {
      expect((await request(app).get('/metrics')).status).toBe(401);
      expect((await request(app).get('/metrics').set('Authorization', 'Bearer scrape-me')).status).toBe(200);
    } finally {
      config.metricsToken = null;
    }
  });
});

describe('lab verification and progress', () => {
  test('verifying one step records it and awards XP once', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);

    const first = await request(app).post('/api/labs/linux-basics/verify').set(student.auth).send({ sessionId, stepNumber: 2 });
    expect(first.body).toMatchObject({ allPassed: true, score: 100, xpEarned: 20, passedCount: 1, totalCount: 1, unitCompleted: false });
    expect(first.body.results[0]).toMatchObject({ step: 2, passed: true });
    expect(first.body.results[0]).not.toHaveProperty('expectedOutput');

    const again = await request(app).post('/api/labs/linux-basics/verify').set(student.auth).send({ sessionId, stepNumber: 2 });
    expect(again.body.xpEarned).toBe(0);
  });

  test('a failing check is reported and counted as a weak spot', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);
    setFailing(true);
    const res = await request(app).post('/api/labs/linux-basics/verify').set(student.auth).send({ sessionId, stepNumber: 3 });
    expect(res.body).toMatchObject({ allPassed: false, score: 0, xpEarned: 0 });

    const progress = (await request(app).get('/api/progress').set(student.auth)).body.data;
    expect(progress.xp).toBe(0);
    expect(progress.weakTopics[0]).toMatchObject({ unitId: 'linux-basics', fails: 1 });
    expect(progress.weakTopics[0].steps[0]).toMatchObject({ step: 3, fails: 1 });
  });

  test('completing every step completes the unit and pays the bonus once', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);
    const stepCount = units.getSteps('linux-basics').length;

    const res = await request(app).post('/api/labs/linux-basics/verify').set(student.auth).send({ sessionId });
    expect(res.body).toMatchObject({ allPassed: true, unitCompleted: true, newlyCompleted: true, totalCount: stepCount });
    expect(res.body.xpEarned).toBe(stepCount * 20 + 100);

    const repeat = await request(app).post('/api/labs/linux-basics/verify').set(student.auth).send({ sessionId });
    expect(repeat.body).toMatchObject({ unitCompleted: true, newlyCompleted: false, xpEarned: 0 });

    const progress = (await request(app).get('/api/progress').set(student.auth)).body.data;
    expect(progress.completedUnits).toEqual(['linux-basics']);
    expect(progress.unitProgress['linux-basics']).toMatchObject({ passedSteps: stepCount, totalSteps: stepCount });
    expect(progress.streak).toMatchObject({ current: 1, activeToday: true });
    expect(progress.readiness).toBe(Math.round((stepCount / units.totalSteps()) * 100));
  });

  test.each([
    [{}, 400],
    [{ sessionId: 'no-such-session' }, 404],
  ])('verify with body %j -> %i', async (body, status) => {
    const student = await guest();
    expect((await request(app).post('/api/labs/linux-basics/verify').set(student.auth).send(body)).status).toBe(status);
  });

  test('verify rejects unknown units, unknown steps and path traversal', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);
    const post = (unit, body) => request(app).post(`/api/labs/${unit}/verify`).set(student.auth).send(body);

    expect((await post('nope', { sessionId })).status).toBe(404);
    expect((await post('..%2F..%2Fconfig', { sessionId })).status).toBe(404);
    expect((await post('linux-basics', { sessionId, stepNumber: 99 })).status).toBe(404);
  });

  test('quiz answers are checked on the server', async () => {
    const student = await guest();
    const section = units.getLearnSections('linux-basics').find((s) => s.quiz);
    const send = (answerIndex) => request(app).post('/api/progress/quiz').set(student.auth)
      .send({ unitId: 'linux-basics', sectionId: section.id, answerIndex });

    const wrongIndex = (section.quiz.correctIndex + 1) % section.quiz.options.length;
    expect((await send(wrongIndex)).body).toMatchObject({ correct: false, xpAwarded: 0 });
    expect((await send(section.quiz.correctIndex)).body).toMatchObject({ correct: true, xpAwarded: 25 });
    expect((await send(section.quiz.correctIndex)).body).toMatchObject({ correct: true, xpAwarded: 0 });

    const missing = await request(app).post('/api/progress/quiz').set(student.auth).send({ unitId: 'linux-basics', sectionId: 'nope', answerIndex: 0 });
    expect(missing.status).toBe(404);
  });

  test('the leaderboard ranks by XP and marks the caller', async () => {
    const top = await registered({ name: 'Top Learner' });
    const other = await guest();
    const idle = await guest();

    const a = await startSandbox(top);
    await request(app).post('/api/labs/linux-basics/verify').set(top.auth).send({ sessionId: a.sessionId });
    const b = await startSandbox(other);
    await request(app).post('/api/labs/linux-basics/verify').set(other.auth).send({ sessionId: b.sessionId, stepNumber: 1 });

    const res = await request(app).get('/api/progress/leaderboard').set(other.auth);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ rank: 1, name: 'Top Learner', you: false, completedUnits: 1 });
    expect(res.body.data[1]).toMatchObject({ rank: 2, you: true, xp: 20 });
    expect(JSON.stringify(res.body)).not.toContain(top.user.id);
    expect(JSON.stringify(res.body)).not.toContain(idle.user.id);
  });

  test('the leaderboard shows a new name straight away', async () => {
    const learner = await guest();
    const board = () => request(app).get('/api/progress/leaderboard').set(learner.auth).then((res) => res.body.data);

    const { sessionId } = await startSandbox(learner);
    await request(app).post('/api/labs/linux-basics/verify').set(learner.auth).send({ sessionId, stepNumber: 1 });
    expect(await board()).toMatchObject([{ rank: 1, xp: 20, name: learner.user.name }]);

    // Registering renames the guest; names are read fresh even while the ranking is cached.
    await request(app).post('/api/auth/register').set(learner.auth)
      .send({ name: 'Meera Nair', email: `meera${Date.now()}@example.com`, password: 'correct-horse' });
    expect((await board())[0].name).toBe('Meera Nair');
  });
});

/** Flip the lab engine between passing and failing checks. */
function setFailing(failing) {
  const session = ctx.manager.listSessions()[0];
  if (!session) throw new Error('start a sandbox first');
  ctx.engine.passing = !failing;
}

describe('flashcards (spaced repetition)', () => {
  test('a new deck is entirely due; reviewing a card schedules it', async () => {
    const student = await guest();
    const deck = (await request(app).get('/api/progress/flashcards/linux-basics').set(student.auth)).body.data;
    expect(deck.total).toBe(units.getFlashcards('linux-basics').length);
    expect(deck.dueCount).toBe(deck.total);

    const card = deck.cards[0];
    const review = await request(app).post(`/api/progress/flashcards/linux-basics/${card.id}/review`).set(student.auth).send({ grade: 4 });
    expect(review.body.data).toMatchObject({ reps: 1, intervalDays: 1 });
    // The response carries the re-sorted deck, so the page needs no second request.
    expect(review.body.deck.dueCount).toBe(deck.total - 1);
    expect(review.body.deck.cards[review.body.deck.cards.length - 1].id).toBe(card.id);

    const after = (await request(app).get('/api/progress/flashcards/linux-basics').set(student.auth)).body.data;
    expect(after.dueCount).toBe(deck.total - 1);
    expect(after.cards[after.cards.length - 1]).toMatchObject({ id: card.id, due: false, seen: true });
  });

  test('"again" keeps the card due soon', async () => {
    const student = await guest();
    const cardId = units.getFlashcards('linux-basics')[0].id;
    const review = await request(app).post(`/api/progress/flashcards/linux-basics/${cardId}/review`).set(student.auth).send({ grade: 1 });
    expect(review.body.data.intervalDays).toBe(0);
    expect(review.body.data.due - Date.now()).toBeLessThan(11 * 60 * 1000);
  });

  test.each([
    ['fc-does-not-exist', { grade: 4 }, 404],
    [null, { grade: 9 }, 400],
    [null, { grade: 'good' }, 400],
    [null, { grade: 2.5 }, 400],
    [null, {}, 400],
  ])('review of %s with %j -> %i', async (cardId, body, status) => {
    const student = await guest();
    const id = cardId || units.getFlashcards('linux-basics')[0].id;
    const res = await request(app).post(`/api/progress/flashcards/linux-basics/${id}/review`).set(student.auth).send(body);
    expect(res.status).toBe(status);
  });

  test('unknown unit deck is a 404', async () => {
    const student = await guest();
    expect((await request(app).get('/api/progress/flashcards/nope').set(student.auth)).status).toBe(404);
  });
});

describe('certificates', () => {
  async function completeUnit(who, unitId = 'linux-basics') {
    const { sessionId } = await startSandbox(who, unitId);
    await request(app).post(`/api/labs/${unitId}/verify`).set(who.auth).send({ sessionId });
    await request(app).delete(`/api/sandbox/${sessionId}`).set(who.auth);
  }

  test('cannot be issued for a unit that was not completed', async () => {
    const user = await registered();
    const res = await request(app).post('/api/certificates').set(user.auth).send({ unitId: 'linux-basics' });
    expect(res.status).toBe(403);
    expect(ctx.store.all('certificates')).toEqual([]);
  });

  test('guests must create an account first', async () => {
    const visitor = await guest();
    await completeUnit(visitor);
    const res = await request(app).post('/api/certificates').set(visitor.auth).send({ unitId: 'linux-basics' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/account/);
  });

  test('anonymous callers cannot issue certificates', async () => {
    const res = await request(app).post('/api/certificates').send({ unitId: 'linux-basics', studentName: 'Anyone', score: 100 });
    expect(res.status).toBe(401);
  });

  test('is issued once for a completed unit, in the account name, and verifies publicly', async () => {
    const user = await registered({ name: 'Asha Rao' });
    await completeUnit(user);

    const issued = await request(app).post('/api/certificates').set(user.auth)
      .send({ unitId: 'linux-basics', studentName: 'Someone Else', score: 1000 });
    expect(issued.status).toBe(201);
    expect(issued.body.data).toMatchObject({
      id: expect.stringMatching(/^OPS-[0-9A-F]{12}$/),
      studentName: 'Asha Rao',
      unitId: 'linux-basics',
      unitTitle: 'Linux Fundamentals',
      score: 100,
      algorithm: 'HMAC-SHA256',
    });
    expect(issued.body.data).not.toHaveProperty('userId');

    const again = await request(app).post('/api/certificates').set(user.auth).send({ unitId: 'linux-basics' });
    expect(again.body.data.id).toBe(issued.body.data.id);
    expect(ctx.store.all('certificates')).toHaveLength(1);

    const verified = await request(app).get(`/api/certificates/verify/${issued.body.data.id}`);
    expect(verified.body).toMatchObject({ verified: true, data: { studentName: 'Asha Rao', signature: issued.body.data.signature } });

    const mine = await request(app).get('/api/certificates').set(user.auth);
    expect(mine.body.data.map((c) => c.id)).toEqual([issued.body.data.id]);
  });

  test('a certificate edited in the store no longer verifies', async () => {
    const user = await registered();
    await completeUnit(user);
    const { id } = (await request(app).post('/api/certificates').set(user.auth).send({ unitId: 'linux-basics' })).body.data;

    const stored = ctx.store.get('certificates', id);
    ctx.store.set('certificates', id, { ...stored, studentName: 'Forged Name' });

    const res = await request(app).get(`/api/certificates/verify/${id}`);
    expect(res.status).toBe(404);
    expect(res.body.verified).toBe(false);
  });

  test.each(['OPS-000000000000', 'not-an-id', '..%2F..%2Fusers'])('verify %s -> 404', async (id) => {
    expect((await request(app).get(`/api/certificates/verify/${id}`)).status).toBe(404);
  });

  test('unknown unit is a 404', async () => {
    const user = await registered();
    expect((await request(app).post('/api/certificates').set(user.auth).send({ unitId: 'nope' })).status).toBe(404);
  });
});

describe('AI mentor hints', () => {
  const ask = (who, body) => request(app).post('/api/agent/hint').set(who.auth)
    .send({ query: 'my check keeps failing', unitId: 'linux-basics', stepNumber: 2, ...body });

  test('hints escalate one tier per request and cannot be skipped ahead', async () => {
    const student = await guest();

    const jump = await ask(student, { tier: 3 });
    expect(jump.body.data).toMatchObject({ tier: 1, nextTier: 2, maxTier: 3, hint: 'tier 1 hint' });
    expect((await ask(student)).body.data).toMatchObject({ tier: 2, nextTier: 3 });
    expect((await ask(student)).body.data).toMatchObject({ tier: 3, nextTier: null });
    expect((await ask(student)).body.data.tier).toBe(3);
    // An earlier tier can always be asked for again.
    expect((await ask(student, { tier: 1 })).body.data.tier).toBe(1);
  });

  test('tiers are tracked separately for each step', async () => {
    const student = await guest();
    await ask(student);
    await ask(student);
    expect((await ask(student, { stepNumber: 3 })).body.data.tier).toBe(1);
  });

  test('the hub receives the step, the typed commands and the sandbox files', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);
    ctx.manager.recordCommand(sessionId, 'mkdir webapp');

    await ask(student, { sessionId });

    const { payload } = ctx.hub.calls.find((c) => c.endpoint === 'hint');
    expect(payload).toMatchObject({
      unitId: 'linux-basics',
      stepNumber: 2,
      tier: 1,
      commandHistory: ['mkdir webapp'],
      step: { title: units.getStep('linux-basics', 2).title, verificationCommand: units.getStep('linux-basics', 2).verification.command },
    });
    expect(payload.containerTelemetry).toHaveProperty('fileTree');
  });

  test("another user's session id adds no context", async () => {
    const owner = await guest();
    const other = await guest();
    const { sessionId } = await startSandbox(owner);
    ctx.manager.recordCommand(sessionId, 'cat secret-notes.txt');

    await ask(other, { sessionId });

    const { payload } = ctx.hub.calls.find((c) => c.endpoint === 'hint');
    expect(payload.commandHistory).toEqual([]);
    expect(payload.containerTelemetry).toBeNull();
  });

  test('falls back to the step instructions when the hub is down, without leaking the check', async () => {
    const student = await guest();
    ctx.hub.down = true;
    const step = units.getStep('linux-basics', 2);

    const res = await ask(student);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fallback: true, source: 'fallback', tier: 1 });
    expect(res.body.data.hint).toContain(step.description);
    expect(res.body.data.hint).not.toContain(step.verification.command);

    const second = await ask(student);
    expect(second.body.data.hint).toContain(step.tasks[0]);
  });

  test('a blocked question is not counted as a used hint', async () => {
    const student = await guest();
    ctx.hub.hintResponse = { blocked: true, message: 'no' };
    const blocked = await ask(student);
    expect(blocked.body.data).toMatchObject({ blocked: true, nextTier: null });

    ctx.hub.hintResponse = null;
    expect((await ask(student)).body.data.tier).toBe(1);
  });

  test('hints used show up as a weak topic', async () => {
    const student = await guest();
    await ask(student);
    await ask(student);
    const progress = (await request(app).get('/api/progress').set(student.auth)).body.data;
    expect(progress.weakTopics[0]).toMatchObject({ unitId: 'linux-basics', hints: 2, fails: 0 });
  });

  test('requires a question and a token', async () => {
    const student = await guest();
    expect((await ask(student, { query: '   ' })).status).toBe(400);
    expect((await request(app).post('/api/agent/hint').send({ query: 'hi' })).status).toBe(401);
  });

  test('scan reports unavailable instead of "safe" when the hub is down', async () => {
    const student = await guest();
    expect((await request(app).post('/api/agent/scan').set(student.auth).send({ command: 'ls' })).body.data).toEqual({ safe: true });
    ctx.hub.down = true;
    expect((await request(app).post('/api/agent/scan').set(student.auth).send({ command: 'ls' })).status).toBe(503);
  });
});

describe('AI mentor hints, streamed', () => {
  const lines = (res) => res.text.trim().split('\n').map((line) => JSON.parse(line));
  const ask = (who, body) => request(app).post('/api/agent/hint/stream').set(who.auth)
    .send({ query: 'verify keeps failing', unitId: 'linux-basics', stepNumber: 2, ...body });
  // What the student ends up seeing.
  const shown = (events) => events.reduce((text, e) => (e.type === 'reset' ? '' : e.type === 'delta' ? text + e.text : text), '');

  test('a hint is passed on piece by piece and ends with the same data as the plain endpoint', async () => {
    const student = await guest();
    ctx.hub.streamEvents = [
      { type: 'delta', text: 'Look at the folder. ' },
      { type: 'delta', text: 'Then compare it with the tasks.' },
      { type: 'done', data: { blocked: false, hint: 'Look at the folder. Then compare it with the tasks.', source: 'llm', tier: 1 } },
    ];
    const res = await ask(student);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/x-ndjson/);
    expect(res.headers['content-encoding']).toBeUndefined();

    const events = lines(res);
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
    expect(shown(events)).toBe('Look at the folder. Then compare it with the tasks.');
    expect(events[2].data).toMatchObject({ hint: shown(events), source: 'llm', tier: 1, maxTier: 3, nextTier: 2 });

    // The hub was given the same grounded context as for a plain hint.
    const call = ctx.hub.calls.find((c) => c.endpoint === 'hintStream');
    expect(call.payload).toMatchObject({ unitId: 'linux-basics', stepNumber: 2, tier: 1, step: { title: expect.any(String) } });
    // And the hint counts: the next request may ask for tier 2.
    ctx.hub.streamEvents = null;
    expect(lines(await ask(student)).pop().data.tier).toBe(2);
  });

  test('a reset from the hub is passed on, so a withdrawn draft is replaced', async () => {
    const student = await guest();
    ctx.hub.streamEvents = [
      { type: 'delta', text: 'Draft that will be withdrawn. ' },
      { type: 'reset' },
      { type: 'delta', text: 'Safe rule-based hint.' },
      { type: 'done', data: { blocked: false, hint: 'Safe rule-based hint.', source: 'rules', tier: 1 } },
    ];
    const events = lines(await ask(student));
    expect(events.map((e) => e.type)).toEqual(['delta', 'reset', 'delta', 'done']);
    expect(shown(events)).toBe('Safe rule-based hint.');
  });

  test.each([
    ['the hub is down', (hub) => { hub.down = true; }, ['delta', 'done']],
    ['the hub dies after sending some text', (hub) => { hub.streamEvents = [{ type: 'delta', text: 'Half a ' }, { type: 'throw' }]; }, ['delta', 'reset', 'delta', 'done']],
    ['the hub ends without a final event', (hub) => { hub.streamEvents = [{ type: 'delta', text: 'Half a ' }]; }, ['delta', 'reset', 'delta', 'done']],
  ])('when %s the student still gets the fallback hint', async (_name, breakHub, types) => {
    const student = await guest();
    breakHub(ctx.hub);
    const events = lines(await ask(student));
    expect(events.map((e) => e.type)).toEqual(types);
    const done = events[events.length - 1].data;
    expect(done).toMatchObject({ source: 'fallback', fallback: true, tier: 1 });
    expect(shown(events)).toBe(done.hint);
    expect(done.hint).not.toContain('test -d');
  });

  test('a blocked request sends no text and does not use up a hint', async () => {
    const student = await guest();
    ctx.hub.hintResponse = { blocked: true, message: 'That command is blocked.' };
    const events = lines(await ask(student));
    expect(events).toEqual([{ type: 'done', data: expect.objectContaining({ blocked: true, nextTier: null }) }]);
    ctx.hub.hintResponse = null;
    expect(lines(await ask(student)).pop().data.tier).toBe(1);
  });

  test('it needs a question and a token like the plain endpoint', async () => {
    const student = await guest();
    expect((await ask(student, { query: '   ' })).status).toBe(400);
    expect((await request(app).post('/api/agent/hint/stream').send({ query: 'help' })).status).toBe(401);
  });
});

describe('mock interview', () => {
  const question = () => units.getInterviewQuestions('linux-basics')[0];
  const answer = (who, text) => request(app).post(`/api/interview/linux-basics/${question().id}/answer`).set(who.auth).send({ answer: text });
  const longAnswer = 'I would start with df -h to find the full partition, then du to find the big directories.';

  test('questions are listed without their model answers', async () => {
    const student = await guest();
    const res = await request(app).get('/api/interview/linux-basics/questions').set(student.auth);
    expect(res.body.data[0]).toEqual({ id: question().id, question: question().question, difficulty: question().difficulty });
    expect(JSON.stringify(res.body)).not.toContain('modelAnswer');
  });

  test('scores an answer, reveals the model answer and awards XP once for a pass', async () => {
    const student = await guest();
    const res = await answer(student, longAnswer);
    expect(res.body.data).toMatchObject({ score: 80, xpAwarded: 30, passScore: 70, modelAnswer: question().modelAnswer });
    expect(ctx.hub.calls.find((c) => c.endpoint === 'score').payload).toMatchObject({ answer: longAnswer, keyPoints: question().keyPoints });

    expect((await answer(student, longAnswer)).body.data.xpAwarded).toBe(0);
    const progress = (await request(app).get('/api/progress').set(student.auth)).body.data;
    expect(progress.interviews).toEqual({ answered: 2, averageScore: 80 });
  });

  test('a low score earns no XP', async () => {
    const student = await guest();
    ctx.hub.scoreResponse = { score: 40, covered: [], missed: ['x'], feedback: 'Thin', source: 'rules' };
    expect((await answer(student, longAnswer)).body.data.xpAwarded).toBe(0);
  });

  test.each([
    ['too short', 'df -h', 400],
    ['too long', 'x'.repeat(4001), 400],
    ['missing', undefined, 400],
  ])('rejects a %s answer', async (_label, text, status) => {
    const student = await guest();
    expect((await answer(student, text)).status).toBe(status);
  });

  test('says scoring is unavailable when the hub is down', async () => {
    const student = await guest();
    ctx.hub.down = true;
    expect((await answer(student, longAnswer)).status).toBe(503);
  });

  test('unknown question or unit is a 404', async () => {
    const student = await guest();
    expect((await request(app).post('/api/interview/linux-basics/iq-nope/answer').set(student.auth).send({ answer: longAnswer })).status).toBe(404);
    expect((await request(app).get('/api/interview/nope/questions').set(student.auth)).status).toBe(404);
  });
});

describe('real shell: a lab step verified end to end', () => {
  beforeEach(() => setup({ engine: pty }));

  test('file preview reads files in the student home and nothing else', async () => {
    const student = await guest();
    const other = await guest();
    const { sessionId } = await startSandbox(student);
    await ctx.manager.exec(sessionId, "mkdir -p webapp && printf 'hello world' > webapp/a.txt && mkdir 'my dir' && printf 'spaced' > 'my dir/b.txt'");
    const read = (path, who = student) => request(app).get(`/api/sandbox/${sessionId}/file`).query({ path }).set(who.auth);

    expect((await read('webapp/a.txt')).body.data).toEqual({ path: 'webapp/a.txt', content: 'hello world', truncated: false });
    expect((await read('my dir/b.txt')).body.data.content).toBe('spaced');

    expect((await read('webapp/missing.txt')).status).toBe(404);
    expect((await read('webapp')).status).toBe(404); // a directory
    for (const bad of ['../../../etc/passwd', '/etc/passwd', 'webapp/../../x', "a'; cat /etc/passwd; echo '", 'a$(id)', 'a`id`', 'a;id', '', 'a\nb']) {
      expect((await read(bad)).status).toBe(400);
    }
    expect((await read('webapp/a.txt', other)).status).toBe(404);
  });

  test('file preview is capped at 20 KB', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);
    await ctx.manager.exec(sessionId, 'head -c 30000 /dev/zero | tr "\\0" "x" > big.txt');
    const res = await request(app).get(`/api/sandbox/${sessionId}/file`).query({ path: 'big.txt' }).set(student.auth);
    expect(res.body.data.truncated).toBe(true);
    expect(res.body.data.content).toHaveLength(20 * 1024);
  });

  test('step 2 of linux-basics fails on an empty sandbox and passes once the files exist', async () => {
    const student = await guest();
    const { sessionId } = await startSandbox(student);
    const verify = () => request(app).post('/api/labs/linux-basics/verify').set(student.auth).send({ sessionId, stepNumber: 2 });

    expect((await verify()).body).toMatchObject({ allPassed: false, results: [{ step: 2, passed: false, stdout: 'FAIL' }] });

    await ctx.manager.exec(sessionId, 'mkdir -p webapp/src webapp/public webapp/config && touch webapp/src/index.js webapp/public/index.html webapp/config/app.conf');

    expect((await verify()).body).toMatchObject({ allPassed: true, xpEarned: 20, results: [{ step: 2, passed: true, stdout: 'PASS' }] });

    const telemetry = await request(app).get(`/api/sandbox/${sessionId}/telemetry`).set(student.auth);
    expect(telemetry.body.data.fileTree.map((f) => f.path)).toContain('webapp/config/app.conf');

    await request(app).post(`/api/sandbox/${sessionId}/reset`).set(student.auth);
    expect((await verify()).body.allPassed).toBe(false);
  });
});
