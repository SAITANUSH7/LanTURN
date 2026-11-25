// The seven-day gauge history behind the admin sparklines: bucketing, retention and the on-demand sample.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, login } from './helpers.js';
import { db } from '../src/db.js';
import { metricHistory, recordSample, maybeSample, __clearHistory, SAMPLE_MS, RETENTION_DAYS } from '../src/metricHistory.js';

before(start);
after(stop);

const insert = (offset, { rss, heap = 20, inflight = 0, queued = 0, running = 0, dead = 0 }) => db.prepare(
  `INSERT INTO metric_samples (at, rss_mb, heap_mb, inflight, queued, running, dead_letters)
   VALUES (datetime('now', ?), ?, ?, ?, ?, ?, ?)`,
).run(offset, rss, heap, inflight, queued, running, dead);

test('samples fold into hourly buckets, oldest first, with gauges averaged and peaks kept', () => {
  __clearHistory();
  insert('-90 minutes', { rss: 100, inflight: 1, queued: 2 });
  insert('-85 minutes', { rss: 200, inflight: 5, queued: 0 });
  insert('-3 days', { rss: 300, inflight: 2, queued: 9 });
  insert(`-${RETENTION_DAYS + 3} days`, { rss: 999 }); // outside the window

  const h = metricHistory();
  assert.equal(h.at.length, 2, 'two populated hours inside the window');
  assert.deepEqual(h.rssMb, [300, 150], 'the average per hour, oldest first');
  assert.deepEqual(h.rssPeakMb, [300, 200], 'the peak is kept separately, because a leak shows up in peaks');
  assert.equal(h.inflight.at(-1), 5, 'the busiest minute of the hour, not an average');
  assert.equal(h.queued.at(-1), 2);
  assert.equal(h.samples, 3, 'the sample outside the window is not counted');
  assert.ok(h.at[0] < h.at[1], 'oldest first: the chart draws left to right');
  assert.equal(h.intervalSec, SAMPLE_MS / 1000);
  // Every series is the same length, because the renderer indexes them against `at`.
  for (const k of ['rssMb', 'rssPeakMb', 'inflight', 'queued', 'deadLetters']) assert.equal(h[k].length, h.at.length, k);
});

test('an empty history is an empty chart, not an error', () => {
  __clearHistory();
  const h = metricHistory();
  assert.deepEqual(h.at, []);
  assert.deepEqual(h.rssMb, []);
});

test('recording a sample prunes rows past the retention window', () => {
  __clearHistory();
  insert(`-${RETENTION_DAYS + 1} days`, { rss: 500 });
  insert('-1 hour', { rss: 120 });
  recordSample();
  const ages = db.prepare(`SELECT COUNT(*) n FROM metric_samples WHERE at < datetime('now', ?)`).get(`-${RETENTION_DAYS} days`).n;
  assert.equal(ages, 0, 'nothing older than the window survives a write');
  assert.ok(metricHistory().rssMb.includes(120), 'the recent row is still there');
});

test('maybeSample fills a gap but respects the interval', () => {
  __clearHistory();
  assert.equal(maybeSample(), true, 'no samples yet, so the first call records one');
  assert.equal(maybeSample(), false, 'a second call inside the interval does nothing');
  assert.equal(maybeSample(Date.now() + SAMPLE_MS + 1000), true, 'once the interval has passed it samples again');
});

test('/admin/metrics carries the history the dashboard draws', async () => {
  __clearHistory();
  const admin = await login('admin@test.local', 'Admin@12345');
  const res = await api('GET', '/admin/metrics', { token: admin });
  assert.equal(res.status, 200);
  const h = res.body.history;
  assert.ok(h && Array.isArray(h.at), 'history is attached to the metrics payload');
  assert.equal(h.at.length, 1, 'opening the dashboard on a fresh process records the first point');
  assert.equal(typeof h.rssMb[0], 'number');
  assert.equal(h.rssMb.length, h.at.length);
  assert.ok(h.rssMb[0] > 0);
  assert.equal(h.days, RETENTION_DAYS);

  const student = await api('GET', '/admin/metrics');
  assert.equal(student.status, 401, 'the history is admin-only with the rest of the payload');
});
