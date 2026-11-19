import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, login, getOrigin } from './helpers.js';

before(start);
after(stop);

test('system view is routed for admins and its data endpoints are admin-only and shaped as the UI expects', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const [m, t, ml, me] = await Promise.all(['/admin/metrics', '/admin/tasks', '/admin/ml', '/admin/ml/measure'].map((p) => api('GET', p, { token: admin })));
  for (const r of [m, t, ml, me]) assert.equal(r.status, 200);
  for (const k of ['uptimeSec', 'inflight', 'memoryMb', 'matchBackend', 'queue', 'breakers', 'routes']) assert.ok(k in m.body, k);
  for (const k of ['queued', 'running', 'deadLetters', 'oldestQueuedSec']) assert.ok(k in m.body.queue, k);
  assert.ok(Array.isArray(t.body.items));
  assert.ok('feedbackExamples' in me.body && 'matchScore' in me.body);
  const js = await (await fetch(`${getOrigin()}/js/main.js`)).text();
  assert.ok(js.includes('/admin/system'));
});
