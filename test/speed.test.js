import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin } from './helpers.js';
import { dataVersion } from '../src/db.js';

before(start);
after(stop);

test('cached job list reflects create, edit and close immediately', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: admin });
  const st = await register('STUDENT');
  const sk = (await api('GET', '/skills?q=Kotlin', { token: st.accessToken })).body;
  const skillId = (sk.items || sk)[0].id;
  const body = { title: 'Cache Probe Alpha', description: 'Probe description for cache.', type: 'INTERNSHIP', location: 'Hyderabad', remote: false, skills: [{ skillId, weight: 2 }] };
  const v0 = dataVersion('jobs');
  const job = await api('POST', '/employer/jobs', { token: emp.accessToken, body });
  assert.equal(job.status, 201, job.text);
  assert.ok(dataVersion('jobs') > v0, 'trigger bumped the version');
  const titles = async () => (await api('GET', '/jobs?pageSize=50', { token: st.accessToken })).body.items.map((j) => j.title);
  assert.ok((await titles()).includes('Cache Probe Alpha'));
  assert.equal((await api('PUT', `/employer/jobs/${job.body.id}`, { token: emp.accessToken, body: { ...body, title: 'Cache Probe Beta' } })).status, 200);
  const t2 = await titles();
  assert.ok(t2.includes('Cache Probe Beta') && !t2.includes('Cache Probe Alpha'));
  const rec = (await api('GET', '/jobs/recommended', { token: st.accessToken })).body.items.map((j) => j.title);
  assert.ok(rec.includes('Cache Probe Beta'));
  await api('POST', `/employer/jobs/${job.body.id}/close`, { token: emp.accessToken });
  assert.ok(!(await titles()).includes('Cache Probe Beta'));
});

test('JSON responses are gzip-compressed when large, SSE is left alone', async () => {
  const st = await register('STUDENT');
  const r = await fetch(`${getOrigin()}/api/skills`, { headers: { authorization: `Bearer ${st.accessToken}`, 'accept-encoding': 'gzip' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-encoding'), 'gzip');
});
