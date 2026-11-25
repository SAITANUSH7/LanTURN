import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('production without JWT secrets generates and persists strong ones instead of crashing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-cfg-'));
  const run = () => execFileSync(process.execPath, ['--no-warnings', '-e', "import('./src/config.js').then(({config}) => console.log(config.accessSecret + ' ' + config.refreshSecret))"], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', DB_FILE: path.join(dir, 'x.db'), JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: '', ADMIN_PASSWORD: 'Config-Test-Passw0rd' },
  }).trim();
  const a = run();
  const [acc, ref] = a.split(' ');
  assert.ok(acc.length >= 64 && ref.length >= 64 && acc !== ref);
  assert.equal(run(), a, 'same secrets on the next boot');
  assert.equal(fs.statSync(path.join(dir, '.lanturn-secrets.json')).mode & 0o077, 0, 'file is private');
  fs.rmSync(dir, { recursive: true, force: true });
});
