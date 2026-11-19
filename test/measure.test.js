import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login } from './helpers.js';
import { auc, precisionAtK } from '../src/ai/measure.js';
import { __setNlpFetch, __resetNlpCaches } from '../src/nlp.js';

before(start);
after(async () => { __setNlpFetch(null); __resetNlpCaches(); delete process.env.NLP_SERVICE_URL; await stop(); });

test('auc and precision@k math', () => {
  const perfect = [{ y: 1, score: 90 }, { y: 1, score: 80 }, { y: 0, score: 40 }, { y: 0, score: 30 }];
  assert.equal(auc(perfect), 1);
  assert.equal(auc(perfect.map((r) => ({ ...r, score: 50 }))), 0.5);
  assert.equal(auc(perfect.map((r) => ({ ...r, y: 1 - r.y }))), 0);
  assert.equal(auc([{ y: 1, score: 1 }]), null);
  assert.equal(precisionAtK(perfect, 2), 1);
  assert.equal(precisionAtK(perfect, 4), 0.5);
});

test('measure endpoint: admin only, reports insufficient data honestly', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const st = await register('STUDENT');
  assert.equal((await api('GET', '/admin/ml/measure', { token: st.accessToken })).status, 403);
  const r = await api('GET', '/admin/ml/measure', { token: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.enoughData, false);
  assert.match(r.body.note, /Not enough/);
  assert.ok('auc' in r.body.matchScore);
});

test('feedback: consent by submitting, validated, withdrawable, skills-only retrain extras', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const st = await register('STUDENT');
  const f0 = await api('GET', '/career/feedback', { token: st.accessToken });
  assert.equal(f0.body.consent, false);
  assert.ok(f0.body.domains.length > 10);
  assert.equal((await api('PUT', '/career/feedback', { token: st.accessToken, body: { domain: 'nope' } })).status, 400);
  const sk = await api('GET', '/skills?q=a', { token: st.accessToken });
  const ids = sk.body.items.slice(0, 4).map((x) => x.id);
  await api('PUT', '/students/me/skills', { token: st.accessToken, body: { skillIds: ids } });
  const ok = await api('PUT', '/career/feedback', { token: st.accessToken, body: { domain: f0.body.domains[0].id } });
  assert.equal(ok.status, 200); assert.equal(ok.body.consent, true);

  process.env.NLP_SERVICE_URL = 'http://nlp.test';
  let sent = null;
  __setNlpFetch(async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ added: sent.extra.length, meta: { version: 2 } }), { status: 200 }); });
  const r = await api('POST', '/admin/ml/retrain', { token: admin, body: { includeFeedback: true } });
  assert.equal(r.status, 200);
  assert.ok(r.body.feedbackUsed >= 1);
  const mine = sent.extra.find((e) => e.label === f0.body.domains[0].id);
  assert.ok(mine && !/@/.test(mine.text), 'no contact data in training text');

  const w = await api('DELETE', '/career/feedback', { token: st.accessToken });
  assert.equal(w.body.consent, false);
  sent = null;
  await api('POST', '/admin/ml/retrain', { token: admin, body: { includeFeedback: true } });
  assert.ok(!sent.extra.some((e) => e.text === mine.text), 'withdrawn data is not used');
});
