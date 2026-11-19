import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, pdfForm } from './helpers.js';
import { __setFetch } from '../src/ai/providers.js';
import { __setNlpFetch, __resetNlpCaches } from '../src/nlp.js';
import { __reset } from '../src/ai/breaker.js';
import { drain } from '../src/queue.js';
import { fuseDeterministic } from '../src/ai/fusion.js';

before(start);
after(async () => { __setFetch(null); __setNlpFetch(null); delete process.env.NLP_SERVICE_URL; delete process.env.NVIDIA_API_KEY; await stop(); });

const ev = (rulesId, mlTop) => ({
  rules: { direction: { id: rulesId, title: rulesId, fitPercent: 58, topicsCovered: '14/24' }, alternatives: [{ id: 'backend', title: 'backend', fitPercent: 40 }], skills: ['React', 'Node.js'], nextActions: ['Learn Docker'], resumeScore: 70 },
  ml: { classifier: mlTop ? { modelVersion: 1, top: mlTop.map(([id, p]) => ({ id, title: id, probability: p })) } : null, jobs: [{ title: 'Dev Intern', company: 'X', skillMatchPercent: 80, missingSkills: ['Docker'], textRelevance: { score: 60, sharedTerms: ['react'], missingTerms: ['docker'] } }] },
});

test('deterministic fusion: agree, partial, disagree and rules-only', () => {
  const agree = fuseDeterministic(ev('fullstack', [['fullstack', 0.4], ['backend', 0.2]]));
  assert.equal(agree.agreement, 'agree'); assert.equal(agree.confidence, 'high');
  const partial = fuseDeterministic(ev('fullstack', [['frontend', 0.4], ['fullstack', 0.2]]));
  assert.equal(partial.agreement, 'partial'); assert.equal(partial.confidence, 'medium');
  const dis = fuseDeterministic(ev('fullstack', [['devops', 0.5], ['cloud', 0.2]]));
  assert.equal(dis.agreement, 'disagree'); assert.equal(dis.confidence, 'low');
  assert.match(dis.reasoning, /devops/);
  const none = fuseDeterministic(ev('fullstack', null));
  assert.equal(none.agreement, 'rules-only'); assert.equal(none.sources.ml, false);
  assert.equal(none.topJobs[0].title, 'Dev Intern');
});

test('no LLM: upload returns an instant rules+ML verdict', async () => {
  const st = await register('STUDENT');
  const up = await api('POST', '/resumes', { token: st.accessToken, form: pdfForm(undefined, { consent: 'true' }) });
  assert.equal(up.status, 201);
  assert.ok(up.body.setup.verdict.direction);
  assert.equal(up.body.setup.verdict.sources.llm, false);
  assert.ok(!up.body.setup.verdict.pending);
});

test('ML evidence is sent to the LLM, which concludes; the result is validated and stored', async () => {
  process.env.NLP_SERVICE_URL = 'http://nlp.test';
  process.env.NVIDIA_API_KEY = 'k-nvidia';
  __reset(); __resetNlpCaches();
  __setNlpFetch(async (url) => {
    if (String(url).endsWith('/v1/classify')) return new Response(JSON.stringify({ model_version: 3, results: [{ id: 'frontend', prob: 0.55 }, { id: 'fullstack', prob: 0.2 }] }), { status: 200 });
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  });
  let seen = null; let mode = 'good';
  __setFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((m) => m.content).join('\n');
    if (!/decision layer/.test(body.messages[0].content)) return new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 });
    seen = prompt;
    const data = JSON.parse(prompt.match(/<data>\n([\s\S]*)\n<\/data>/)[1]);
    const pick = mode === 'good' ? 'frontend' : 'made-up-path';
    const content = JSON.stringify({ directionId: pick, confidence: 'medium', agreement: 'partial', headline: 'Frontend leaning', reasoning: 'ML reads frontend; rules see full stack coverage.', strengths: ['React'], gaps: ['Docker'], nextSteps: ['Ship one UI project'], topJobs: [{ title: data.evidence.ml.jobs[0]?.title || 'x', why: 'Matches your React work.' }, { title: 'Invented Job', why: 'nope' }] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  try {
    const st = await register('STUDENT');
    const up = await api('POST', '/resumes', { token: st.accessToken, form: pdfForm(undefined, { consent: 'true' }) });
    assert.equal(up.body.setup.verdict.pending, true, 'instant verdict now, LLM upgrade queued');
    assert.equal(up.body.setup.verdict.sources.llm, false);
    await drain(); await drain();
    const v = (await api('GET', '/career/setup', { token: st.accessToken })).body.setup.verdict;
    assert.equal(v.sources.llm, true);
    assert.equal(v.directionId, 'frontend');
    assert.equal(v.agreement, 'partial');
    assert.ok(v.topJobs.every((j) => j.title !== 'Invented Job'), 'jobs not in the evidence are dropped');
    // the LLM really received the ML output alongside the rules output
    assert.match(seen, /"probability":0\.55/);
    assert.match(seen, /candidateDirections/);
    assert.match(seen, /"fitPercent"/);

    // an LLM that invents a direction is rejected: deterministic fusion stays
    mode = 'bad';
    const again = await api('POST', '/career/verdict', { token: st.accessToken });
    assert.equal(again.status, 200);
    assert.equal(again.body.verdict.sources.llm, false);
    assert.match(again.body.verdict.llmSkipped, /not in the evidence/);
  } finally { __setFetch(null); __setNlpFetch(null); delete process.env.NLP_SERVICE_URL; delete process.env.NVIDIA_API_KEY; }
});
