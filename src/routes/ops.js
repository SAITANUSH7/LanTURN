import fs from 'node:fs';
import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../auth.js';
import { z } from 'zod';
import { wrap, notFound, bad, parse } from '../util.js';
import { pushEnabled, vapidPublicKey, subscriptionCount } from '../push.js';
import { snapshot, prometheus } from '../metrics.js';
import { metricHistory, maybeSample } from '../metricHistory.js';
import { queueStats } from '../queue.js';
import { breakerStates } from '../ai/breaker.js';
import { backend } from '../match.js';
import { nlpStatus, modelInfo, retrainModel } from '../nlp.js';
import { prefsFor, setPrefs, checkUnsubToken, emailEnabled } from '../email.js';
import { runBackup, listBackups, monitorStatus } from '../monitor.js';
import { measureOutcomes, feedbackExtras } from '../ai/measure.js';
import { searchStatus } from '../searchEngine.js';

export const opsRouter = Router();
let draining = false;
export const setDraining = (v) => { draining = v; };

// Liveness: the process is up. No dependencies, so a slow database never gets the container killed.
opsRouter.get('/health/live', (_req, res) => res.json({ status: 'live' }));

// Readiness: can this instance take traffic right now? 503 while draining or if the database or queue is unhealthy.
opsRouter.get('/health/ready', (_req, res) => {
  const checks = {};
  try { db.prepare('SELECT 1').get(); checks.db = 'ok'; } catch (e) { checks.db = `fail: ${e.message}`; }
  try { fs.accessSync(config.uploadDir, fs.constants.W_OK); checks.uploads = 'ok'; } catch { checks.uploads = 'fail: not writable'; }
  try { const q = queueStats(); checks.queue = q.oldestQueuedSec > 300 ? `stalled (${q.oldestQueuedSec}s behind)` : 'ok'; } catch (e) { checks.queue = `fail: ${e.message}`; }
  if (draining) checks.draining = 'yes';
  const ok = Object.entries(checks).every(([k, v]) => k === 'draining' ? false : v === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks });
});

const admin = [authenticate, requireRole('ADMIN')];
opsRouter.get('/admin/metrics', ...admin, wrap(async (_req, res) => {
  // Take a sample if the last one is stale, so a freshly deployed process still has something to chart, then answer
  // with the hourly buckets the dashboard draws as sparklines.
  try { maybeSample(); } catch { /* charts are decoration; never fail the endpoint for them */ }
  res.json({ ...snapshot(), queue: queueStats(), breakers: breakerStates(), matchBackend: backend, email: { enabled: emailEnabled() }, monitoring: monitorStatus(), nlp: nlpStatus(), search: searchStatus(), history: metricHistory() });
}));
opsRouter.get('/admin/metrics.prom', ...admin, wrap(async (_req, res) => {
  const q = queueStats();
  res.type('text/plain; version=0.0.4').send(prometheus({ queue_depth: q.queued, queue_running: q.running, queue_dead_letters: q.deadLetters, queue_oldest_seconds: q.oldestQueuedSec }));
}));
opsRouter.get('/admin/tasks', ...admin, wrap(async (_req, res) => {
  res.json({ stats: queueStats(), items: db.prepare('SELECT id, type, status, attempts, max_attempts, error, created_at, finished_at FROM tasks ORDER BY id DESC LIMIT 50').all() });
}));
opsRouter.post('/admin/tasks/:id/retry', ...admin, wrap(async (req, res) => {
  const r = db.prepare("UPDATE tasks SET status = 'QUEUED', attempts = 0, run_at = datetime('now'), error = NULL WHERE id = ? AND status = 'FAILED'").run(Number(req.params.id));
  if (!r.changes) throw notFound('No failed task with that id');
  res.json({ ok: true });
}));
// A user can poll their own background tasks.
opsRouter.get('/tasks/:id', authenticate, wrap(async (req, res) => {
  const t = db.prepare('SELECT id, type, status, attempts, result, error, created_at, finished_at FROM tasks WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!t) throw notFound('Task not found');
  res.json({ ...t, result: t.result ? JSON.parse(t.result) : null });
}));

opsRouter.get('/admin/ml', ...admin, wrap(async (_req, res) => {
  res.json({ nlp: nlpStatus(), model: await modelInfo() });
}));
opsRouter.get('/admin/ml/measure', ...admin, wrap(async (_req, res) => {
  res.json({ ...measureOutcomes(), feedbackExamples: feedbackExtras().length });
}));
opsRouter.post('/admin/ml/retrain', ...admin, wrap(async (req, res) => {
  const extra = req.body?.includeFeedback ? feedbackExtras() : [];
  try { res.json({ ...(await retrainModel(extra)), feedbackUsed: extra.length }); } catch (e) { res.status(502).json({ error: { code: 'NLP_UNAVAILABLE', message: e.message } }); }
}));

// ---- Email preferences ----
opsRouter.get('/email-prefs', authenticate, wrap(async (req, res) => { res.json(prefsFor(req.actorId ?? req.user.id)); }));
opsRouter.put('/email-prefs', authenticate, wrap(async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') throw bad('enabled must be true or false');
  setPrefs(req.actorId ?? req.user.id, req.body.enabled);
  res.json(prefsFor(req.actorId ?? req.user.id));
}));
// ---- Browser push ----
opsRouter.get('/push/key', authenticate, wrap(async (req, res) => {
  const id = req.actorId ?? req.user.id;
  res.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? vapidPublicKey() : '', subscribed: subscriptionCount(id) > 0 });
}));
opsRouter.post('/push/subscribe', authenticate, wrap(async (req, res) => {
  if (!pushEnabled()) throw bad('Browser alerts are not set up on this server');
  const b = parse(z.object({ endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'endpoint must be https'), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }) }).strict(), req.body);
  const id = req.actorId ?? req.user.id;
  if (subscriptionCount(id) >= 10 && !db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(b.endpoint)) throw bad('Too many devices. Turn alerts off on one you no longer use.');
  // A device belongs to whoever is signed in on it now (shared computers): re-registering moves the endpoint.
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth')
    .run(id, b.endpoint, b.keys.p256dh, b.keys.auth);
  res.status(201).json({ subscribed: true, devices: subscriptionCount(id) });
}));
opsRouter.post('/push/unsubscribe', authenticate, wrap(async (req, res) => {
  const b = parse(z.object({ endpoint: z.string().max(1000) }).strict(), req.body);
  const id = req.actorId ?? req.user.id;
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(b.endpoint, id);
  res.json({ subscribed: subscriptionCount(id) > 0, devices: subscriptionCount(id) });
}));
// One-click unsubscribe from the link in every email (no login needed; the token is an HMAC of the user id).
opsRouter.get('/email/unsubscribe', (req, res) => {
  const u = Number(req.query.u);
  if (!Number.isInteger(u) || !checkUnsubToken(u, req.query.t)) return res.status(400).type('html').send('<p>This unsubscribe link is not valid.</p>');
  setPrefs(u, false);
  res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:480px;margin:60px auto;padding:0 16px"><h2>You are unsubscribed</h2><p>LanTURN will no longer email you. You will still see notifications in the app, and you can turn emails back on in your settings.</p></body>');
});

opsRouter.get('/admin/backups', ...admin, wrap(async (_req, res) => { res.json({ items: listBackups(), monitoring: monitorStatus() }); }));
opsRouter.post('/admin/backups/run', ...admin, wrap(async (_req, res) => { res.json(runBackup()); }));
