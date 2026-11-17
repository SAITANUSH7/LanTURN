import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { start, stop, api, register, login, pdfForm } from './helpers.js';
import { semanticRank, nlpStatus } from '../src/nlp.js';
import { __reset } from '../src/ai/breaker.js';

let fake, hits = 0, mode = 'ok';
before(async () => {
  await start();
  fake = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      hits += 1;
      if (mode === 'fail') { res.writeHead(500); return res.end('{}'); }
      if (mode === 'slow') return; // never answers
      const { jobs } = JSON.parse(b);
      // pretend the *last* job reads like the resume
      res.end(JSON.stringify({ results: jobs.map((j, i) => ({ id: j.id, score: i === jobs.length - 1 ? 100 : 0, cosine: 0.4, shared: ['kotlin'], missing: ['docker'] })) }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  process.env.NLP_SERVICE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.NLP_TIMEOUT_MS = '300';
});
after(async () => { delete process.env.NLP_SERVICE_URL; fake.close(); await stop(); });

test('semanticRank returns a map, caches by resume+version, and sends the token', async () => {
  __reset(); hits = 0; mode = 'ok';
  const jobs = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
  const a = await semanticRank('resume text', jobs, 'v1');
  assert.equal(a.get(2).score, 100);
  await semanticRank('resume text', jobs, 'v1');
  assert.equal(hits, 1, 'second call served from cache');
  await semanticRank('resume text', jobs, 'v2');
  assert.equal(hits, 2, 'new job version bypasses cache');
});

test('timeouts and errors return null, and repeated failure opens the breaker', async () => {
  __reset(); hits = 0; mode = 'slow';
  assert.equal(await semanticRank('r1', [{ id: 1, text: 'x' }], 'a'), null);
  mode = 'fail';
  assert.equal(await semanticRank('r2', [{ id: 1, text: 'x' }], 'b'), null);
  assert.equal(await semanticRank('r3', [{ id: 1, text: 'x' }], 'c'), null);
  const before = hits;
  assert.equal(await semanticRank('r4', [{ id: 1, text: 'x' }], 'd'), null);
  assert.equal(hits, before, 'breaker is open: no request was sent');
  assert.ok(nlpStatus().failures >= 3);
});

test('recommended jobs blend the semantic score and survive the sidecar being down', async () => {
  __reset(); mode = 'ok';
  const admin = await login('admin@test.local', 'Admin@12345');
  const emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: admin });
  const st = await register('STUDENT');
  const sk = (await api('GET', '/skills?q=Kotlin', { token: st.accessToken })).body;
  const skillId = (sk.items || sk)[0].id;
  for (const title of ['Sem Job One', 'Sem Job Two']) {
    assert.equal((await api('POST', '/employer/jobs', { token: emp.accessToken, body: { title, description: 'desc for semantic test', type: 'INTERNSHIP', location: 'X', remote: false, skills: [{ skillId, weight: 2 }] } })).status, 201);
  }
  await api('POST', '/resumes', { token: st.accessToken, form: pdfForm(undefined, { consent: 'true' }) });
  const ok = await api('GET', '/jobs/recommended', { token: st.accessToken });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.items.some((j) => j.match.semantic), 'semantic details attached');
  mode = 'fail'; __reset();
  // a new posting changes the job-set version, so the cached semantic scores no longer apply
  await api('POST', '/employer/jobs', { token: emp.accessToken, body: { title: 'Sem Job Three', description: 'third description for semantic test', type: 'INTERNSHIP', location: 'X', remote: false, skills: [{ skillId, weight: 2 }] } });
  const down = await api('GET', '/jobs/recommended', { token: st.accessToken });
  assert.equal(down.status, 200);
  assert.ok(down.body.items.length >= 2);
  assert.ok(down.body.items.every((j) => !j.match.semantic));
});
