// Monitoring and backups, all optional and environment-gated:
//   SENTRY_DSN          error reports sent to Sentry over its HTTP envelope API (no SDK dependency)
//   ALERT_WEBHOOK_URL   Slack/Discord-compatible webhook for alerts (5xx errors, stuck queue, open breakers, failed backups)
//   UPTIME_PING_URL     dead-man's-switch ping (healthchecks.io style) sent every 5 minutes only while the app is ready
//   BACKUP_DIR/BACKUP_KEEP  daily consistent SQLite snapshots (default folder next to the database, keep 7)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { registerTask, enqueue, queueStats } from './queue.js';
import { breakerStates } from './ai/breaker.js';

let fetchImpl = (...a) => fetch(...a);
export const __setMonitorFetch = (fn) => { fetchImpl = fn || ((...a) => fetch(...a)); };

// ---- Alerts (rate-limited per key so one outage is one message, not hundreds) ----
const lastSent = new Map();
export async function alert(key, text, minGapMs = 10 * 60_000) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < minGapMs) return false;
  lastSent.set(key, now);
  try {
    await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `[LanTURN] ${text}`, content: `[LanTURN] ${text}` }), signal: AbortSignal.timeout(5000) });
    return true;
  } catch { return false; }
}
export const __resetAlerts = () => lastSent.clear();

// ---- Sentry (minimal envelope sender) ----
function parseDsn(dsn) {
  try { const u = new URL(dsn); const project = u.pathname.replace(/^\/+/, ''); return { key: u.username, host: u.host, protocol: u.protocol, project }; } catch { return null; }
}
export async function reportError(err, ctx = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  if (process.env.SENTRY_DSN) {
    const d = parseDsn(process.env.SENTRY_DSN);
    if (d) {
      try {
        const eventId = crypto.randomUUID().replace(/-/g, '');
        const event = { event_id: eventId, timestamp: Date.now() / 1000, platform: 'node', level: 'error', environment: process.env.NODE_ENV || 'development',
          exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: String(e.stack || '').split('\n').slice(1, 20).map((l) => ({ function: l.trim() })).reverse() } }] }, tags: ctx.tags, extra: ctx.extra };
        const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
        await fetchImpl(`${d.protocol}//${d.host}/api/${d.project}/envelope/`, { method: 'POST', body, signal: AbortSignal.timeout(5000),
          headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': `Sentry sentry_version=7, sentry_client=lanturn/1.0, sentry_key=${d.key}` } });
      } catch { /* never let reporting break the request */ }
    }
  }
  await alert(`err:${e.name}:${e.message.slice(0, 60)}`, `Server error${ctx.extra?.route ? ` on ${ctx.extra.route}` : ''}: ${e.message.slice(0, 200)}`);
}

// ---- Backups ----
const backupDir = () => path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(config.dbFile), 'backups'));
export function runBackup(dir = backupDir(), keep = Number(process.env.BACKUP_KEEP || 7)) {
  fs.mkdirSync(dir, { recursive: true });
  const name = `lanturn-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  const file = path.join(dir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); // consistent snapshot even while the app is writing
  const all = fs.readdirSync(dir).filter((f) => /^lanturn-.*\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, old), { force: true });
  return { file: name, sizeBytes: fs.statSync(file).size, kept: Math.min(all.length, keep) };
}
export function listBackups(dir = backupDir()) {
  try { return fs.readdirSync(dir).filter((f) => /^lanturn-.*\.db$/.test(f)).sort().reverse().map((f) => ({ file: f, sizeBytes: fs.statSync(path.join(dir, f)).size, createdAt: fs.statSync(path.join(dir, f)).mtime.toISOString() })); } catch { return []; }
}
registerTask('maintenance.backup', async () => {
  try { return runBackup(); } catch (e) { await alert('backup-failed', `Backup failed: ${e.message}`, 6 * 3600_000); throw e; }
});

// ---- Health tick: every 5 minutes ----
let lastDead = 0;
registerTask('monitor.tick', async () => {
  const q = queueStats();
  const problems = [];
  if (q.deadLetters > lastDead) problems.push(`${q.deadLetters - lastDead} background task(s) failed permanently (${q.deadLetters} total)`);
  lastDead = q.deadLetters;
  if (q.oldestQueuedSec > 300) problems.push(`queue is ${q.oldestQueuedSec}s behind`);
  const open = breakerStates().filter((b) => b.open).map((b) => b.key);
  if (open.length) problems.push(`circuit open: ${open.join(', ')} (fallbacks are serving)`);
  if (problems.length) await alert('tick-problems', problems.join('; '), 30 * 60_000);
  let ready = true;
  try { db.prepare('SELECT 1').get(); } catch { ready = false; }
  if (ready && q.oldestQueuedSec <= 300 && process.env.UPTIME_PING_URL) {
    try { await fetchImpl(process.env.UPTIME_PING_URL, { signal: AbortSignal.timeout(5000) }); } catch { /* the monitor will notice the missing ping */ }
  }
  return { problems, pinged: Boolean(process.env.UPTIME_PING_URL) && ready };
});

let timers = [];
export function startMonitor() {
  enqueue('monitor.tick', {}, { dedupeKey: 'monitor.tick', delayMs: 60_000 });
  enqueue('maintenance.backup', {}, { dedupeKey: 'backup', delayMs: 120_000 });
  timers = [
    setInterval(() => enqueue('monitor.tick', {}, { dedupeKey: 'monitor.tick', maxAttempts: 1 }), 300_000),
    setInterval(() => enqueue('maintenance.backup', {}, { dedupeKey: 'backup', maxAttempts: 2 }), 24 * 3600_000),
  ];
  timers.forEach((t) => t.unref());
}
export const stopMonitor = () => { timers.forEach(clearInterval); timers = []; };
export const monitorStatus = () => ({ sentry: Boolean(process.env.SENTRY_DSN), alertWebhook: Boolean(process.env.ALERT_WEBHOOK_URL), uptimePing: Boolean(process.env.UPTIME_PING_URL), backups: listBackups().slice(0, 3) });
