import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin } from './helpers.js';
import { allow, success, failure, breakerStates, __reset, __setClock, CircuitOpen } from '../src/ai/breaker.js';
import { enqueue, registerTask, drain, queueStats, backoffSeconds, __resume } from '../src/queue.js';
import { db } from '../src/db.js';
import { matchManyJs, pack } from '../src/match.js';
import '../src/tasks.js';

before(start);
after(stop);

test('circuit opens after 3 failures, probes after cooldown, closes on success', () => {
  __reset();
  let t = 1_000_000;
  __setClock(() => t);
  for (let i = 0; i < 3; i++) { allow('p|m'); failure('p|m'); }
  assert.throws(() => allow('p|m'), CircuitOpen);
  assert.equal(breakerStates()[0].open, true);
  t += 61_000;
  allow('p|m'); // half-open probe allowed
  assert.throws(() => allow('p|m'), CircuitOpen); // only one probe at a time
  success('p|m');
  allow('p|m');
  assert.equal(breakerStates().length, 0);
  __setClock(null);
});

test('queue runs tasks, retries with backoff, then dead-letters', async () => {
  __resume();
  let calls = 0;
  registerTask('t.flaky', async ({ failTimes }) => { calls += 1; if (calls <= failTimes) throw new Error('boom'); return { calls }; });
  const ok = enqueue('t.flaky', { failTimes: 0 });
  await drain();
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get(ok).status, 'DONE');

  calls = 0;
  const flaky = enqueue('t.flaky', { failTimes: 1 }, { maxAttempts: 3 });
  await drain();
  let row = db.prepare('SELECT status, attempts, error FROM tasks WHERE id = ?').get(flaky);
  assert.equal(row.status, 'QUEUED'); assert.equal(row.attempts, 1); assert.equal(row.error, 'boom');
  db.prepare("UPDATE tasks SET run_at = datetime('now') WHERE id = ?").run(flaky); // skip the backoff wait
  await drain();
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get(flaky).status, 'DONE');

  const dead = enqueue('t.flaky', { failTimes: 99 }, { maxAttempts: 1 });
  await drain();
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get(dead).status, 'FAILED');
  assert.ok(queueStats().deadLetters >= 1);
  assert.deepEqual([1, 2, 3, 10].map(backoffSeconds), [5, 10, 20, 900]);
});

test('dedupe key collapses duplicate pending tasks', () => {
  const a = enqueue('t.flaky', { failTimes: 0 }, { dedupeKey: 'same', delayMs: 60_000 });
  const b = enqueue('t.flaky', { failTimes: 0 }, { dedupeKey: 'same', delayMs: 60_000 });
  assert.ok(a); assert.equal(b, null);
});

test('matchMany scores weighted coverage', () => {
  const { skillIds, offsets } = pack([[1, 2, 3], [1], [], [9]]);
  const s = matchManyJs(skillIds, offsets, Int32Array.from([1, 2]), Int32Array.from([3, 1]));
  assert.deepEqual([...s], [100, 75, 0, 0]);
  assert.deepEqual([...matchManyJs(skillIds, offsets, new Int32Array(0), new Int32Array(0))], [0, 0, 0, 0]);
});

test('posting a job notifies matching students in the background, once', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: admin });
  const st = await register('STUDENT');
  const sk = (await api('GET', '/skills?q=Kotlin', { token: st.accessToken })).body;
  const skillId = (sk.items || sk)[0].id;
  db.prepare('INSERT OR IGNORE INTO student_skills (user_id, skill_id, source) VALUES (?,?,?)').run(st.user.id, skillId, 'MANUAL');
  const job = await api('POST', '/employer/jobs', { token: emp.accessToken, body: { title: 'Kotlin Dev', description: 'Build Android apps in Kotlin.', type: 'INTERNSHIP', location: 'Hyderabad', remote: false, skills: [{ skillId, weight: 3 }] } });
  assert.equal(job.status, 201, job.text);
  await drain();
  await drain();
  const n = db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'job_match'").get(st.user.id).n;
  assert.equal(n, 1);
  enqueue('job.match_notify', { jobId: job.body.id });
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'job_match'").get(st.user.id).n, 1, 'idempotent');
});

test('health endpoints and admin-only metrics', async () => {
  assert.equal((await fetch(`${getOrigin()}/api/health/live`)).status, 200);
  const ready = await fetch(`${getOrigin()}/api/health/ready`);
  assert.equal(ready.status, 200);
  const st = await register('STUDENT');
  assert.equal((await api('GET', '/admin/metrics', { token: st.accessToken })).status, 403);
  const admin = await login('admin@test.local', 'Admin@12345');
  const m = await api('GET', '/admin/metrics', { token: admin });
  assert.equal(m.status, 200);
  assert.ok(m.body.routes.length > 0 && m.body.queue && Array.isArray(m.body.breakers));
  const prom = await api('GET', '/admin/metrics.prom', { token: admin });
  assert.match(prom.text, /lanturn_requests_total/);
});
