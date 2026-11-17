import { db } from './db.js';
import { config } from './config.js';

// SQLite-backed task queue: durable (survives restarts), retried with exponential backoff, and recovered if the
// process died mid-task. One worker loop per process; handlers must be idempotent because delivery is at-least-once.
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  dedupe_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, run_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedupe ON tasks(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('QUEUED','RUNNING');`);

const handlers = new Map();
export const registerTask = (type, fn) => handlers.set(type, fn);

/** Add a task. `dedupeKey` collapses duplicates that are still waiting or running. Returns the task id (or null if deduped). */
export function enqueue(type, payload = {}, { userId = null, delayMs = 0, maxAttempts = 4, dedupeKey = null } = {}) {
  try {
    const r = db.prepare("INSERT INTO tasks (type, payload, user_id, max_attempts, run_at, dedupe_key) VALUES (?,?,?,?, datetime('now', ?), ?)")
      .run(type, JSON.stringify(payload), userId, maxAttempts, `+${Math.max(0, Math.ceil(delayMs / 1000))} seconds`, dedupeKey);
    wake();
    return Number(r.lastInsertRowid);
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return null;
    throw e;
  }
}

export const backoffSeconds = (attempt) => Math.min(900, 5 * 2 ** (attempt - 1)); // 5s, 10s, 20s ...

function claim() {
  // Single-writer SQLite: claim inside one statement so two loops can never take the same row.
  return db.prepare(`UPDATE tasks SET status = 'RUNNING', started_at = datetime('now'), attempts = attempts + 1
    WHERE id = (SELECT id FROM tasks WHERE status = 'QUEUED' AND run_at <= datetime('now') ORDER BY run_at, id LIMIT 1)
    RETURNING id, type, payload, attempts, max_attempts, user_id`).get();
}

let running = 0;
let timer = null;
let stopping = false;
const inflight = new Set();
const stats = { done: 0, failed: 0, retried: 0 };
export const queueStats = () => ({
  ...stats, running,
  queued: db.prepare("SELECT COUNT(*) n FROM tasks WHERE status = 'QUEUED'").get().n,
  oldestQueuedSec: db.prepare("SELECT CAST((julianday('now') - julianday(MIN(run_at))) * 86400 AS INTEGER) s FROM tasks WHERE status = 'QUEUED' AND run_at <= datetime('now')").get().s || 0,
  deadLetters: db.prepare("SELECT COUNT(*) n FROM tasks WHERE status = 'FAILED'").get().n,
});

async function runOne(t) {
  const fn = handlers.get(t.type);
  try {
    if (!fn) throw new Error(`no handler for ${t.type}`);
    const result = await fn(JSON.parse(t.payload), t);
    db.prepare("UPDATE tasks SET status = 'DONE', result = ?, error = NULL, finished_at = datetime('now') WHERE id = ?").run(result === undefined ? null : JSON.stringify(result).slice(0, 4000), t.id);
    stats.done += 1;
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    if (t.attempts >= t.max_attempts || !fn) {
      db.prepare("UPDATE tasks SET status = 'FAILED', error = ?, finished_at = datetime('now') WHERE id = ?").run(msg, t.id);
      stats.failed += 1;
      if (!config.isTest) console.error(`[queue] task ${t.id} ${t.type} failed for good: ${msg}`);
    } else {
      db.prepare("UPDATE tasks SET status = 'QUEUED', error = ?, run_at = datetime('now', ?) WHERE id = ?").run(msg, `+${backoffSeconds(t.attempts)} seconds`, t.id);
      stats.retried += 1;
    }
  }
}

/** Run everything that is due right now (used by the loop and by tests). */
export async function drain(concurrency = 2) {
  let t;
  while (!stopping && running < concurrency && (t = claim())) {
    running += 1;
    const p = runOne(t).finally(() => { running -= 1; inflight.delete(p); });
    inflight.add(p);
  }
  await Promise.all(inflight);
}

function wake() { if (timer && !stopping) setImmediate(() => drain().catch(() => {})); }

export function startWorker({ intervalMs = 1000, concurrency = 2 } = {}) {
  if (timer) return;
  stopping = false;
  // A previous process may have died mid-task: put those back (their attempt already counted).
  db.prepare("UPDATE tasks SET status = 'QUEUED' WHERE status = 'RUNNING'").run();
  timer = setInterval(() => { drain(concurrency).catch((e) => console.error('[queue]', e.message)); }, intervalMs);
  timer.unref();
}

/** Stop claiming new work and wait (up to ms) for running tasks to finish. */
export async function stopWorker(ms = 8000) {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  await Promise.race([Promise.all(inflight), new Promise((r) => setTimeout(r, ms).unref())]);
}
export const __resume = () => { stopping = false; };
