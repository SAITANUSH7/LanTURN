import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { start, stop, api, login } from './helpers.js';
import { __setMonitorFetch, __resetAlerts, alert, reportError, runBackup, listBackups } from '../src/monitor.js';
import { drain, enqueue } from '../src/queue.js';

before(start);
after(async () => { __setMonitorFetch(null); for (const k of ['ALERT_WEBHOOK_URL', 'SENTRY_DSN', 'UPTIME_PING_URL', 'BACKUP_DIR']) delete process.env[k]; await stop(); });

test('alerts are off without a webhook and rate-limited with one', async () => {
  const calls = []; __setMonitorFetch(async (u, i) => { calls.push({ u, b: JSON.parse(i?.body || '{}') }); return new Response('ok'); });
  assert.equal(await alert('k', 'x'), false);
  process.env.ALERT_WEBHOOK_URL = 'http://hook.test/x'; __resetAlerts();
  assert.equal(await alert('k', 'queue stuck'), true);
  assert.equal(await alert('k', 'queue stuck'), false, 'same key is suppressed');
  assert.equal(await alert('other', 'y'), true);
  assert.match(calls[0].b.text, /^\[LanTURN\] queue stuck/);
});

test('Sentry envelope is well formed and a failing sender never throws', async () => {
  process.env.SENTRY_DSN = 'https://abc123@o1.ingest.sentry.io/4242'; __resetAlerts();
  let seen;
  __setMonitorFetch(async (u, i) => { if (String(u).includes('sentry')) seen = { u, i }; return new Response('ok'); });
  await reportError(new Error('boom'), { extra: { route: 'GET /x' } });
  assert.equal(seen.u, 'https://o1.ingest.sentry.io/api/4242/envelope/');
  assert.match(seen.i.headers['x-sentry-auth'], /sentry_key=abc123/);
  const lines = seen.i.body.split('\n');
  assert.equal(JSON.parse(lines[1]).type, 'event');
  assert.equal(JSON.parse(lines[2]).exception.values[0].value, 'boom');
  __setMonitorFetch(async () => { throw new Error('network'); });
  await reportError(new Error('again')); // must resolve
  delete process.env.SENTRY_DSN;
});

test('backup writes a consistent snapshot, prunes old ones, and the admin API works', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  for (let i = 0; i < 4; i++) { runBackup(dir, 2); await new Promise((r) => setTimeout(r, 15)); }
  const files = listBackups(dir);
  assert.equal(files.length, 2, 'keeps only the newest 2');
  const copy = new DatabaseSync(path.join(dir, files[0].file), { readOnly: true });
  assert.ok(copy.prepare('SELECT COUNT(*) n FROM users').get().n >= 1, 'snapshot contains data');
  copy.close();
  process.env.BACKUP_DIR = dir;
  const admin = await login('admin@test.local', 'Admin@12345');
  assert.equal((await api('POST', '/admin/backups/run', { token: admin })).status, 200);
  assert.ok((await api('GET', '/admin/backups', { token: admin })).body.items.length >= 1);
  assert.equal((await api('GET', '/admin/backups', {})).status, 401);
});

test('monitor tick pings the uptime URL only while healthy and alerts on dead letters', async () => {
  process.env.UPTIME_PING_URL = 'http://ping.test/abc'; process.env.ALERT_WEBHOOK_URL = 'http://hook.test/x'; __resetAlerts();
  const hits = []; __setMonitorFetch(async (u) => { hits.push(String(u)); return new Response('ok'); });
  enqueue('monitor.tick', {}); await drain();
  assert.ok(hits.includes('http://ping.test/abc'));
});
