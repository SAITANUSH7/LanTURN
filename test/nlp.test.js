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
      if (req.url.endsWith('/v1/classify')) return res.end(JSON.stringify({ model_version: 1, results: [{ id: 'backend', prob: 0.5 }] }));
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

test('auto-setup stores the ML second opinion when the sidecar answers, and works without it', async () => {
  const realFetch = globalThis.fetch;
  const { __setNlpFetch, __resetNlpCaches } = await import('../src/nlp.js');
  __reset(); __resetNlpCaches();
  __setNlpFetch(async (url, opts) => {
    if (String(url).endsWith('/v1/classify')) return new Response(JSON.stringify({ model_version: 7, results: [{ id: 'frontend', prob: 0.61 }, { id: 'fullstack', prob: 0.2 }] }), { status: 200 });
    return realFetch(url, opts);
  });
  const st = await register('STUDENT');
  const up = await api('POST', '/resumes', { token: st.accessToken, form: pdfForm(undefined, { consent: 'true' }) });
  assert.equal(up.status, 201);
  assert.equal(up.body.setup.ml.modelVersion, 7);
  assert.equal(up.body.setup.ml.top[0].id, 'frontend');
  assert.equal((await api('GET', '/career/setup', { token: st.accessToken })).body.setup.ml.top[0].prob, 0.61, 'persisted');
  __setNlpFetch(async () => { throw new Error('down'); });
  __reset();
  const again = await api('POST', '/career/auto-setup', { token: st.accessToken });
  assert.equal(again.status, 200);
  assert.ok(again.body.setup.direction, 'rules result is unaffected by the sidecar being down');
  __setNlpFetch(null);
});

test('the Python training corpus is in sync with the Career AIsle domains', async () => {
  const fs = await import('node:fs');
  const { CAREER_DOMAINS } = await import('../src/data/careerRoadmaps.js');
  const exported = JSON.parse(fs.readFileSync(new URL('../services/nlp/data/domains.json', import.meta.url), 'utf8'));
  assert.deepEqual(exported.map((d) => d.id), CAREER_DOMAINS.map((d) => d.id), 'run: node scripts/export-domains.mjs');
  assert.equal(exported.reduce((a, d) => a + d.topics.length, 0), CAREER_DOMAINS.reduce((a, d) => a + d.stages.reduce((b, s) => b + s.topics.length, 0), 0), 'run: node scripts/export-domains.mjs');
});
