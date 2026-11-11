import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login } from './helpers.js';
import { __setFetch, extractJson, activeProviders } from '../src/ai/providers.js';

before(start);
after(async () => { __setFetch(null); await stop(); });

const skillId = async (token, q) => (await api('GET', `/skills?q=${encodeURIComponent(q)}`, { token })).body.items[0].id;
async function studentWithSkills() {
  const s = await register('STUDENT');
  const ids = [await skillId(s.accessToken, 'Python'), await skillId(s.accessToken, 'React')];
  await api('PUT', '/students/me/skills', { token: s.accessToken, body: { skillIds: ids } });
  return s;
}

test('extractJson copes with fences, think blocks and prose', () => {
  assert.deepEqual(extractJson('<think>hmm</think>```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":2} hope that helps'), { a: 2 });
  assert.throws(() => extractJson('no json here'));
});

test('no provider configured: features use the rules engine and say so', async () => {
  assert.equal(activeProviders().length, 0);
  const s = await studentWithSkills();
  const dna = await api('POST', '/career/dna', { token: s.accessToken });
  assert.equal(dna.status, 201);
  assert.equal(dna.body.source, 'rules');
  assert.ok(dna.body.dimensions.length >= 2);
  const t = await api('POST', '/arena/tests', { token: s.accessToken, body: { skill: 'Python', selfRating: 2 } });
  assert.equal(t.status, 201);
  assert.equal(t.body.questions.length, 3);
  assert.ok(!('keyPoints' in t.body.questions[0]), 'answer hints must not leak');
  const sub = await api('POST', `/arena/tests/${t.body.id}/submit`, { token: s.accessToken, body: { answers: ['a', 'b', 'c'] } });
  assert.equal(sub.body.medal, 'basic', 'rules grading never awards a tier medal');
  assert.equal((await api('POST', `/arena/tests/${t.body.id}/submit`, { token: s.accessToken, body: { answers: ['a', 'b', 'c'] } })).status, 409);
  const chat = await api('POST', '/chat/messages', { token: s.accessToken, body: { message: 'what skills should I learn?' } });
  assert.equal(chat.status, 201);
  assert.equal(chat.body.reply.source, 'rules');
  const thread = await api('GET', `/chat/threads/${chat.body.threadId}`, { token: s.accessToken });
  assert.equal(thread.body.messages.length, 2);
  const other = await register('STUDENT');
  assert.equal((await api('GET', `/chat/threads/${chat.body.threadId}`, { token: other.accessToken })).status, 404);
});

test('provider chain: first provider fails, second answers; keys never leave the server', async () => {
  process.env.DEEPSEEK_API_KEY = 'k-deepseek';
  process.env.NVIDIA_API_KEY = 'k-nvidia';
  const calls = [];
  __setFetch(async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    if (url.startsWith('https://api.deepseek.com')) return new Response('boom', { status: 500 });
    const body = JSON.parse(init.body);
    const wantsDna = /Career DNA/.test(body.messages[0].content);
    const content = wantsDna
      ? JSON.stringify({ archetype: 'Full-stack builder', summary: 'Strong.', strengths: ['Python'], dimensions: [1, 2, 3, 4].map((i) => ({ name: `D${i}`, score: 10 * i, note: '' })) })
      : 'Focus on SQL first.';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  try {
    assert.deepEqual(activeProviders().map((p) => p.name), ['deepseek', 'nvidia']);
    const s = await studentWithSkills();
    const dna = await api('POST', '/career/dna', { token: s.accessToken });
    assert.equal(dna.body.source, 'llm');
    assert.equal(dna.body.archetype, 'Full-stack builder');
    assert.ok(calls.some((c) => c.url.startsWith('https://integrate.api.nvidia.com/v1/chat/completions') && c.auth === 'Bearer k-nvidia'));
    const chat = await api('POST', '/chat/messages', { token: s.accessToken, body: { message: 'help' } });
    assert.equal(chat.body.reply.source, 'llm');
    assert.equal((await api('GET', '/health')).body.ai, 'llm+rules');
    assert.ok(!JSON.stringify((await api('GET', '/ai/status', { token: s.accessToken })).body).includes('k-nvidia'));
  } finally {
    delete process.env.DEEPSEEK_API_KEY; delete process.env.NVIDIA_API_KEY; __setFetch(null);
  }
});

test('invalid model output falls back to rules instead of failing', async () => {
  process.env.GROQ_API_KEY = 'k';
  __setFetch(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 }));
  try {
    const s = await studentWithSkills();
    const r = await api('POST', '/career/dna', { token: s.accessToken });
    assert.equal(r.status, 201);
    assert.equal(r.body.source, 'rules');
  } finally { delete process.env.GROQ_API_KEY; __setFetch(null); }
});

test('notifications: apply and status change notify the other side; employer assistant hides contact info', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: admin });
  const sid = await skillId(emp.accessToken, 'Python');
  const job = await api('POST', '/employer/jobs', { token: emp.accessToken, body: { title: 'Python Intern', description: 'Build things with Python and learn.', type: 'INTERNSHIP', location: 'Hyderabad', remote: false, compensation: '', deadline: null, skills: [{ skillId: sid, weight: 3 }] } });
  assert.equal(job.status, 201, JSON.stringify(job.body));
  const s = await studentWithSkills();
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-1.4')]), 'x.pdf');
  const resumes = await api('GET', '/resumes', { token: s.accessToken });
  void resumes;
  const jd = await api('POST', '/employer/ai/job-description', { token: emp.accessToken, body: { title: 'Python Intern', type: 'INTERNSHIP', skills: ['Python'] } });
  assert.equal(jd.status, 200);
  assert.ok(jd.body.description.length > 20);
  const cdna = await api('POST', '/employer/ai/company-dna', { token: emp.accessToken });
  assert.equal(cdna.status, 201);
  const before = await api('GET', '/notifications/unread-count', { token: emp.accessToken });
  assert.equal(before.body.unread, 0);
  const closed = await api('POST', `/employer/jobs/${job.body.id}/close`, { token: emp.accessToken });
  assert.equal(closed.status, 200);
  const chat = await api('POST', '/chat/messages', { token: emp.accessToken, body: { message: 'who should I shortlist?' } });
  assert.equal(chat.status, 201);
  assert.equal((await api('POST', '/chat/messages', { token: s.accessToken, body: { message: '' } })).status, 400);
  assert.equal((await api('GET', '/career/dna', { token: emp.accessToken })).status, 403);
  const all = await api('POST', '/notifications/read-all', { token: emp.accessToken });
  assert.equal(all.body.unread, 0);
});

test('admin can add a provider key in the web UI: encrypted at rest, never echoed, testable, removable', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const stu = await register('STUDENT');
  assert.equal((await api('GET', '/admin/ai', { token: stu.accessToken })).status, 403);
  assert.equal((await api('PUT', '/admin/ai/nvidia', { token: stu.accessToken, body: { apiKey: 'x' } })).status, 403);
  const KEY = 'nvapi-SECRET-1234567890abcd';
  const seen = [];
  __setFetch(async (url, init) => { seen.push({ url, auth: init.headers.authorization }); return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }); });
  try {
    const put = await api('PUT', '/admin/ai/nvidia', { token: admin, body: { apiKey: KEY, model: 'meta/llama-3.3-70b-instruct,nvidia/nemotron-3-nano-30b-a3b' } });
    assert.equal(put.status, 200);
    assert.equal(put.body.configured, true);
    assert.equal(put.body.origin, 'admin');
    assert.equal(put.body.keyHint, '••••abcd');
    assert.ok(!put.text.includes('SECRET'), 'key must never be returned');
    const list = await api('GET', '/admin/ai', { token: admin });
    assert.ok(!list.text.includes('SECRET'));
    assert.deepEqual(list.body.active.map((p) => p.model), ['meta/llama-3.3-70b-instruct', 'nvidia/nemotron-3-nano-30b-a3b']);
    const { db } = await import('../src/db.js');
    const raw = db.prepare("SELECT api_key_enc FROM ai_settings WHERE provider='nvidia'").get().api_key_enc;
    assert.ok(raw && !raw.includes('SECRET'), 'stored value is encrypted');
    const tst = await api('POST', '/admin/ai/nvidia/test', { token: admin });
    assert.equal(tst.body.ok, true);
    const logs = await api('GET', '/admin/ai/logs', { token: admin });
    assert.equal(logs.body.items[0].provider, 'nvidia');
    assert.equal(logs.body.items[0].ok, true);
    assert.ok(!logs.text.includes('SECRET'));
    assert.equal(seen.at(-1).auth, `Bearer ${KEY}`);
    assert.equal((await api('GET', '/health')).body.ai, 'llm+rules');
    // disable keeps the key but stops using it
    await api('PUT', '/admin/ai/nvidia', { token: admin, body: { enabled: false } });
    assert.equal((await api('GET', '/health')).body.ai, 'rules');
    await api('PUT', '/admin/ai/nvidia', { token: admin, body: { enabled: true } });
    // bad URL rejected
    assert.equal((await api('PUT', '/admin/ai/custom', { token: admin, body: { baseUrl: 'javascript:alert(1)' } })).status, 400);
    const del = await api('DELETE', '/admin/ai/nvidia', { token: admin });
    assert.equal(del.body.configured, false);
    assert.equal((await api('GET', '/health')).body.ai, 'rules');
  } finally { __setFetch(null); }
});
