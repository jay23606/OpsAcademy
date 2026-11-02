// Runs before each test file: keep sandbox working directories out of the repo.
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.SANDBOXES_DIR = path.join(os.tmpdir(), `opsacademy-test-${process.pid}`);
// The lab of the day depends on the date; its own tests switch it on.
process.env.DAILY_CHALLENGE = 'off';
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_DRIVER;
delete process.env.ADMIN_TOKEN;
delete process.env.METRICS_TOKEN;
delete process.env.CORS_ORIGINS;
delete process.env.CLIENT_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_KEY;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_PUBLISHABLE_KEY;

// Tests create many users and sandboxes from one address; the limiters get
// their own tests with low limits.
for (const name of ['API', 'AUTH', 'GUEST', 'SANDBOX_START', 'AGENT']) {
  process.env[`RATE_LIMIT_${name}`] = '100000';
}
