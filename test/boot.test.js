/**
 * Boot behaviour in production. This file exists because of a real outage: an upgrade that turned "your admin password
 * is still the public default" into `process.exit(1)` crash-looped a running host. The security intent stays (the risk is
 * shouted about, and STRICT_BOOT=1 can make it fatal), but an existing deployment must not be taken down by an upgrade.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lt-boot-'));

function runServer(env, { waitMs = 4000 } = {}) {
  const dir = tmp();
  const child = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SEED_DEMO: 'false',
      PORT: '0',
      DB_FILE: path.join(dir, 'lanturn.db'),
      UPLOAD_DIR: path.join(dir, 'uploads'),
      ADMIN_EMAIL: 'admin@boot.test',
      ADMIN_PASSWORD: 'Boot-Test-Passw0rd',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ code: null, out }); }, waitMs);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

test('a default admin password warns loudly in production instead of refusing to boot', async () => {
  const { code, out } = await runServer({ ADMIN_PASSWORD: 'Admin@12345' });
  assert.equal(code, null, `server must keep running, got exit ${code}: ${out.slice(-600)}`);
  assert.match(out, /SECURITY WARNING: ADMIN_PASSWORD/);
  assert.match(out, /STRICT_BOOT=1/);
  assert.match(out, /LanTURN running on/, 'it still serves traffic');
});

test('SEED_DEMO=true in production warns, because demo passwords are public', async () => {
  const { code, out } = await runServer({ SEED_DEMO: 'true', ALLOW_DEMO_SEED: '' });
  assert.equal(code, null, `server must keep running, got exit ${code}`);
  assert.match(out, /SECURITY WARNING: SEED_DEMO/);
});

test('STRICT_BOOT=1 turns those warnings into a hard stop', async () => {
  const { code, out } = await runServer({ ADMIN_PASSWORD: 'Admin@12345', STRICT_BOOT: '1' });
  assert.equal(code, 1, 'an operator who asked for strict boot gets one');
  assert.match(out, /stopping instead of starting/);
  assert.doesNotMatch(out, /LanTURN running on/);
});

test('a clean production environment starts without security warnings', async () => {
  const { code, out } = await runServer({ ADMIN_PASSWORD: 'A-real-passw0rd-for-prod' });
  assert.equal(code, null);
  assert.doesNotMatch(out, /SECURITY WARNING/);
  assert.match(out, /LanTURN running on/);
});
