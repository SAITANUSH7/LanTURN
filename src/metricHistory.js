// A seven-day memory for the admin dashboard.
//
// `/admin/metrics` answers "what is true right now", which is enough to render a number and not enough to render a
// trend - and a trend is the whole point of watching memory or queue depth. This keeps one sample a minute in SQLite
// (so it survives the restarts that a Railway deploy does) and folds them into hourly buckets for the sparklines.
//
// Sampling is deliberately boring: the interval lives in server.js, and the metrics route also asks for a sample when
// the last one is stale, so a quiet process still has a history the first time someone opens the page.
import { db } from './db.js';
import { snapshot } from './metrics.js';
import { queueStats } from './queue.js';

export const SAMPLE_MS = 60_000;
export const RETENTION_DAYS = 7;

db.exec(`CREATE TABLE IF NOT EXISTS metric_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  rss_mb INTEGER NOT NULL,
  heap_mb INTEGER NOT NULL,
  inflight INTEGER NOT NULL,
  queued INTEGER NOT NULL,
  running INTEGER NOT NULL,
  dead_letters INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metric_samples_at ON metric_samples(at);`);

/** Record one sample of the gauges worth trending. Returns the row id. */
export function recordSample() {
  const m = snapshot();
  const q = queueStats();
  const r = db.prepare(`INSERT INTO metric_samples (rss_mb, heap_mb, inflight, queued, running, dead_letters)
    VALUES (?,?,?,?,?,?)`)
    .run(m.memoryMb.rss, m.memoryMb.heapUsed, m.inflight, q.queued ?? 0, q.running ?? 0, q.deadLetters ?? 0);
  db.prepare(`DELETE FROM metric_samples WHERE at < datetime('now', ?)`).run(`-${RETENTION_DAYS} days`);
  return Number(r.lastInsertRowid);
}

/** Sample only if the newest row is older than the interval. Safe to call on every request to the dashboard. */
export function maybeSample(now = Date.now()) {
  const last = db.prepare('SELECT at FROM metric_samples ORDER BY id DESC LIMIT 1').get();
  if (last) {
    const age = now - Date.parse(`${last.at.replace(' ', 'T')}Z`);
    if (Number.isFinite(age) && age < SAMPLE_MS) return false;
  }
  recordSample();
  return true;
}

/**
 * Hourly buckets for the last `days` days, oldest first. Every series has the same length as `at`, because the
 * sparkline indexes across them. Empty hours are simply absent - the chart draws the samples it was given.
 */
export function metricHistory({ days = RETENTION_DAYS } = {}) {
  const window = `-${Math.max(1, days)} days`;
  const rows = db.prepare(`SELECT strftime('%Y-%m-%dT%H:00:00Z', at) AS hour,
      CAST(ROUND(AVG(rss_mb)) AS INTEGER) AS rss,
      CAST(MAX(rss_mb) AS INTEGER) AS rssPeak,
      MAX(inflight) AS inflight,
      MAX(queued) AS queued,
      MAX(dead_letters) AS deadLetters,
      COUNT(*) AS samples
    FROM metric_samples
    WHERE at >= datetime('now', ?)
    GROUP BY hour ORDER BY hour`).all(window);

  // A process deployed ten minutes ago has three samples and one hourly bucket. Charting that single bucket would
  // show a flat line where a real trend exists, so while the history is younger than three hours we chart the raw
  // samples instead. Same contract, smaller bucket: the client does not care which one it got.
  if (rows.length < 3) {
    const raw = db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%SZ', at) AS at, rss_mb, inflight, queued, dead_letters
      FROM metric_samples WHERE at >= datetime('now', ?) ORDER BY at`).all(window);
    // Only while the whole history is young: an established history with three quiet hours is still an hour chart.
    const ageHours = raw.length ? (Date.now() - Date.parse(raw[0].at)) / 3600000 : 0;
    if (raw.length >= 2 && ageHours < 3) {
      return {
        days,
        bucket: 'minute',
        at: raw.map((r) => r.at),
        rssMb: raw.map((r) => r.rss_mb),
        rssPeakMb: raw.map((r) => r.rss_mb),
        inflight: raw.map((r) => r.inflight),
        queued: raw.map((r) => r.queued),
        deadLetters: raw.map((r) => r.dead_letters),
        samples: raw.length,
        intervalSec: SAMPLE_MS / 1000,
      };
    }
  }

  return {
    days,
    bucket: 'hour',
    at: rows.map((r) => r.hour),
    rssMb: rows.map((r) => r.rss),
    rssPeakMb: rows.map((r) => r.rssPeak),
    inflight: rows.map((r) => r.inflight),
    queued: rows.map((r) => r.queued),
    deadLetters: rows.map((r) => r.deadLetters),
    samples: rows.reduce((n, r) => n + r.samples, 0),
    intervalSec: SAMPLE_MS / 1000,
  };
}

/** Test hook: drop everything so a suite starts with a known-empty history. */
export function __clearHistory() {
  db.exec('DELETE FROM metric_samples');
}

let timer = null;
/** Start the once-a-minute sampler. `unref` so a sampler never keeps the process (or a test) alive. */
export function startMetricSampler() {
  if (timer) return timer;
  timer = setInterval(() => {
    try { recordSample(); } catch { /* a metrics write must never take the process down */ }
  }, SAMPLE_MS);
  timer.unref?.();
  return timer;
}

export function stopMetricSampler() {
  if (timer) clearInterval(timer);
  timer = null;
}
