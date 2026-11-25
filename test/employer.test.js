import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, pdfForm, RESUME_LINES } from './helpers.js';
import { __setFetch } from '../src/ai/providers.js';
import { __reset } from '../src/ai/breaker.js';

before(start);
after(async () => { __setFetch(null); delete process.env.NVIDIA_API_KEY; await stop(); });

async function setup(n = 2) {
  const emp = await register('EMPLOYER');
  const admin = await login('admin@test.local', 'Admin@12345');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: admin });
  const sk = await api('GET', '/skills?q=React', { token: emp.accessToken });
  const reactId = sk.body.items[0].id;
  const job = await api('POST', '/employer/jobs', { token: emp.accessToken, body: { title: 'Frontend Engineer', description: 'Build interfaces with React for our product.', type: 'FULL_TIME', location: 'Pune', remote: true, compensation: '10 LPA', skills: [{ skillId: reactId, weight: 3 }] } });
  assert.equal(job.status, 201);
  const apps = [];
  for (let i = 0; i < n; i++) {
    const st = await register('STUDENT');
    const up = await api('POST', '/resumes', { token: st.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
    const ap = await api('POST', `/jobs/${job.body.id}/apply`, { token: st.accessToken, body: { resumeId: up.body.id, coverNote: 'hi' } });
    assert.equal(ap.status, 201);
    apps.push({ st, id: ap.body.id });
  }
  return { emp, jobId: job.body.id, apps };
}

test('ranking returns candidates with a rules-based why, sorted by composite', async () => {
  const { emp, jobId, apps } = await setup(2);
  const r = await api('GET', `/employer/jobs/${jobId}/ranking`, { token: emp.accessToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 2);
  const it = r.body.items[0];
  assert.ok(it.why && it.whySource === 'rules');
  assert.ok(r.body.items[0].composite >= r.body.items[1].composite);
  assert.ok(apps.some((a) => a.id === it.applicationId));
  const other = await register('EMPLOYER');
  assert.equal((await api('GET', `/employer/jobs/${jobId}/ranking`, { token: other.accessToken })).status, 404);
});

test('explain: no LLM keeps rules; with LLM it phrases from facts and never gets names', async () => {
  const { emp, jobId } = await setup(2);
  const none = await api('POST', `/employer/jobs/${jobId}/ranking/explain`, { token: emp.accessToken });
  assert.equal(none.body.source, 'rules');

  process.env.NVIDIA_API_KEY = 'nvapi-test'; __reset();
  let prompt = '';
  __setFetch(async (url, init) => {
    prompt = String(JSON.parse(init.body).messages.map((m) => m.content).join('\n'));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ candidate: 1, why: 'Solid React match with a strong resume.', concern: 'Limited depth' }] }) } }] }), { status: 200 });
  });
  const r = await api('POST', `/employer/jobs/${jobId}/ranking/explain`, { token: emp.accessToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'llm');
  assert.equal(r.body.items[0].why, 'Solid React match with a strong resume.');
  assert.equal(r.body.items[0].whySource, 'llm');
  for (const c of r.body.items) assert.ok(!prompt.includes(c.name), 'candidate name leaked to LLM');
  __setFetch(async () => new Response('boom', { status: 500 }));
  __reset();
  const f = await api('POST', `/employer/jobs/${jobId}/ranking/explain`, { token: emp.accessToken });
  assert.equal(f.body.source, 'rules');
  delete process.env.NVIDIA_API_KEY; __setFetch(null); __reset();
});

test('skill suggestions: from description, validated input', async () => {
  const emp = await register('EMPLOYER');
  const r = await api('POST', '/employer/skills/suggest', { token: emp.accessToken, body: { title: 'React Developer', description: 'We use React and Node.js with PostgreSQL daily.' } });
  assert.equal(r.status, 200);
  const names = r.body.items.map((s) => s.name.toLowerCase());
  assert.ok(names.includes('react'));
  assert.ok(r.body.items.every((s) => s.skillId && s.reason));
  const ex = await api('POST', '/employer/skills/suggest', { token: emp.accessToken, body: { title: 'React Developer', description: 'React', exclude: [r.body.items.find((s) => s.name.toLowerCase() === 'react').skillId] } });
  assert.ok(!ex.body.items.some((s) => s.name.toLowerCase() === 'react'));
  assert.equal((await api('POST', '/employer/skills/suggest', { token: emp.accessToken, body: { title: 5 } })).status, 400);
  const st = await register('STUDENT');
  assert.equal((await api('POST', '/employer/skills/suggest', { token: st.accessToken, body: {} })).status, 403);
});

test('bulk status: valid moves, invalid transitions reported, ownership enforced, student notified', async () => {
  const { emp, apps } = await setup(2);
  const ids = apps.map((a) => a.id);
  const ok = await api('POST', '/employer/applications/bulk-status', { token: emp.accessToken, body: { ids, status: 'SHORTLISTED' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.changed, 2);
  const bad = await api('POST', '/employer/applications/bulk-status', { token: emp.accessToken, body: { ids, status: 'OFFERED' } });
  assert.equal(bad.body.failed, 2);
  assert.match(bad.body.results[0].error, /Cannot move/);
  const n = await api('GET', '/notifications', { token: apps[0].st.accessToken });
  assert.ok(JSON.stringify(n.body).includes('shortlisted'));
  const other = await register('EMPLOYER');
  const x = await api('POST', '/employer/applications/bulk-status', { token: other.accessToken, body: { ids, status: 'REJECTED' } });
  assert.equal(x.body.changed, 0);
  assert.equal((await api('POST', '/employer/applications/bulk-status', { token: emp.accessToken, body: { ids: [], status: 'REJECTED' } })).status, 400);
});

test('strong match alerts the employer', async () => {
  const { emp } = await setup(1);
  const n = await api('GET', '/notifications', { token: emp.accessToken });
  const text = JSON.stringify(n.body);
  assert.ok(text.includes('application_received'));
});

test('dashboard returns a status funnel and a zero-filled 14-day applicant series', async () => {
  const { emp } = await setup(2);
  const d = (await api('GET', '/employer/dashboard', { token: emp.accessToken })).body;
  assert.equal(d.funnel.APPLIED, 2);
  assert.equal(Object.values(d.funnel).reduce((a, b) => a + b, 0), d.applicants);
  assert.equal(d.daily.length, 14);
  assert.equal(d.daily.reduce((n, x) => n + x.count, 0), 2);
  assert.equal(d.daily.at(-1).count, 2);
});

test('dashboard attention counts applicants still waiting for a first look', async () => {
  const { emp } = await setup(2);
  const d = (await api('GET', '/employer/dashboard', { token: emp.accessToken })).body;
  assert.equal(d.attention.waiting, 2);
  assert.equal(d.attention.stale, 0);
  assert.ok(Array.isArray(d.attention.closingSoon));
  const list = (await api('GET', '/employer/jobs', { token: emp.accessToken })).body.items[0];
  assert.equal(list.awaitingReview, 2);
});

test('closed jobs can be reopened, but not past their apply-by date', async () => {
  const { emp, jobId } = await setup(0);
  await api('POST', `/employer/jobs/${jobId}/close`, { token: emp.accessToken });
  const re = await api('POST', `/employer/jobs/${jobId}/reopen`, { token: emp.accessToken });
  assert.equal(re.status, 200);
  assert.equal(re.body.status, 'OPEN');
  const past = await api('POST', '/employer/jobs', { token: emp.accessToken, body: { title: 'Old role', description: 'A role with a date in the past.', type: 'INTERNSHIP', deadline: '2020-01-01', skills: [{ skillId: 1, weight: 2 }] } });
  assert.equal(past.status, 400);
  const other = await register('EMPLOYER');
  assert.ok([403, 404].includes((await api('POST', `/employer/jobs/${jobId}/reopen`, { token: other.accessToken })).status));
});

test('private note and rating are saved, validated, owner-only and hidden from students', async () => {
  const { emp, apps } = await setup(2);
  const id = apps[0].id;
  const put = await api('PUT', `/employer/applications/${id}/note`, { token: emp.accessToken, body: { note: 'Strong portfolio', rating: 4 } });
  assert.equal(put.status, 200);
  const one = (await api('GET', `/employer/applications/${id}`, { token: emp.accessToken })).body;
  assert.equal(one.note, 'Strong portfolio');
  assert.equal(one.rating, 4);
  assert.equal(one.neighbours.total, 2);
  assert.equal((await api('PUT', `/employer/applications/${id}/note`, { token: emp.accessToken, body: { note: 'x', rating: 9 } })).status, 400);
  const other = await register('EMPLOYER');
  assert.equal((await api('PUT', `/employer/applications/${id}/note`, { token: other.accessToken, body: { note: 'x' } })).status, 404);
  const mine = await api('GET', '/applications', { token: apps[0].st.accessToken });
  assert.ok(!JSON.stringify(mine.body).includes('Strong portfolio'));
});

test('candidate CSV export contains rows, escapes formulas and is owner-only', async () => {
  const { emp, jobId, apps } = await setup(2);
  await api('PUT', `/employer/applications/${apps[0].id}/note`, { token: emp.accessToken, body: { note: '=HYPERLINK("x"),bad', rating: 5 } });
  const r = await api('GET', `/employer/jobs/${jobId}/candidates.csv`, { token: emp.accessToken });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const lines = r.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(r.text.includes(`"'=HYPERLINK(""x""),bad"`));
  const other = await register('EMPLOYER');
  assert.equal((await api('GET', `/employer/jobs/${jobId}/candidates.csv`, { token: other.accessToken })).status, 404);
});

test('a rejected candidate can be reconsidered back to the shortlist, and the student is told', async () => {
  const { emp, apps } = await setup(1);
  const id = apps[0].id;
  assert.equal((await api('PATCH', `/employer/applications/${id}/status`, { token: emp.accessToken, body: { status: 'REJECTED' } })).status, 200);
  const d = (await api('GET', `/employer/applications/${id}`, { token: emp.accessToken })).body;
  assert.deepEqual(d.allowedTransitions, ['SHORTLISTED']);
  assert.equal((await api('PATCH', `/employer/applications/${id}/status`, { token: emp.accessToken, body: { status: 'APPLIED' } })).status, 409);
  const back = await api('PATCH', `/employer/applications/${id}/status`, { token: emp.accessToken, body: { status: 'SHORTLISTED' } });
  assert.equal(back.status, 200);
  assert.deepEqual(back.body.allowedTransitions, ['INTERVIEW', 'REJECTED']);
  const n = await api('GET', '/notifications', { token: apps[0].st.accessToken });
  assert.ok(JSON.stringify(n.body).includes('reconsidered'));
  // students still cannot withdraw a rejected application
  await api('PATCH', `/employer/applications/${id}/status`, { token: emp.accessToken, body: { status: 'REJECTED' } });
  assert.equal((await api('POST', `/applications/${id}/withdraw`, { token: apps[0].st.accessToken })).status, 409);
});

const inDays = (d, h = 10) => { const t = new Date(Date.now() + d * 86400000); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };

test('interviews: schedule moves SHORTLISTED to INTERVIEW, student is notified, ICS works, cancel and rejection clear it', async () => {
  const { emp, apps } = await setup(1);
  const id = apps[0].id; const st = apps[0].st.accessToken;
  const body = { startsAt: inDays(3), durationMin: 45, mode: 'VIDEO', location: 'https://meet.example.test/abc', note: 'Bring your laptop' };
  // must be shortlisted first
  assert.equal((await api('POST', `/employer/applications/${id}/interviews`, { token: emp.accessToken, body })).status, 409);
  await api('PATCH', `/employer/applications/${id}/status`, { token: emp.accessToken, body: { status: 'SHORTLISTED' } });
  assert.equal((await api('POST', `/employer/applications/${id}/interviews`, { token: emp.accessToken, body: { ...body, startsAt: inDays(-1) } })).status, 400);
  assert.equal((await api('POST', `/employer/applications/${id}/interviews`, { token: emp.accessToken, body: { ...body, location: '' } })).status, 400);
  const ok = await api('POST', `/employer/applications/${id}/interviews`, { token: emp.accessToken, body });
  assert.equal(ok.status, 201);
  const d = (await api('GET', `/employer/applications/${id}`, { token: emp.accessToken })).body;
  assert.equal(d.status, 'INTERVIEW');
  assert.equal(d.interviews.length, 1);
  const mine = (await api('GET', '/applications', { token: st })).body.items[0];
  assert.equal(mine.interviews[0].status, 'SCHEDULED');
  assert.ok(JSON.stringify((await api('GET', '/notifications', { token: st })).body).includes('interview_scheduled'));
  const ics = await api('GET', `/interviews/${ok.body.interview.id}/ics`, { token: st });
  assert.equal(ics.status, 200);
  assert.match(ics.text, /BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z[\s\S]*END:VCALENDAR/);
  const stranger = await register('STUDENT');
  assert.equal((await api('GET', `/interviews/${ok.body.interview.id}/ics`, { token: stranger.accessToken })).status, 404);
  const c = await api('POST', `/employer/applications/${id}/interviews/${ok.body.interview.id}/cancel`, { token: emp.accessToken });
  assert.equal(c.body.interviews[0].status, 'CANCELLED');
  await api('POST', `/employer/applications/${id}/interviews`, { token: emp.accessToken, body });
  await api('PATCH', `/employer/applications/${id}/status`, { token: emp.accessToken, body: { status: 'REJECTED' } });
  const after = (await api('GET', `/employer/applications/${id}`, { token: emp.accessToken })).body;
  assert.ok(after.interviews.every((x) => x.status === 'CANCELLED'));
});

test('messages: employer writes first, student can then reply, strangers are blocked, no messages after withdrawal', async () => {
  const { emp, apps } = await setup(1);
  const id = apps[0].id; const st = apps[0].st.accessToken;
  assert.equal((await api('POST', `/applications/${id}/messages`, { token: st, body: { body: 'hello?' } })).status, 403);
  assert.equal((await api('POST', `/applications/${id}/messages`, { token: emp.accessToken, body: { body: '   ' } })).status, 400);
  const sent = await api('POST', `/applications/${id}/messages`, { token: emp.accessToken, body: { body: 'Can you start in January?' } });
  assert.equal(sent.status, 201);
  const reply = await api('POST', `/applications/${id}/messages`, { token: st, body: { body: 'Yes, I can.' } });
  assert.equal(reply.status, 201);
  const thread = (await api('GET', `/applications/${id}/messages`, { token: st })).body;
  assert.deepEqual(thread.items.map((m) => m.from), ['EMPLOYER', 'STUDENT']);
  assert.equal(thread.you, 'STUDENT');
  assert.ok(JSON.stringify((await api('GET', '/notifications', { token: emp.accessToken })).body).includes('replied'));
  const other = await register('EMPLOYER'); const stranger = await register('STUDENT');
  assert.equal((await api('GET', `/applications/${id}/messages`, { token: other.accessToken })).status, 404);
  assert.equal((await api('GET', `/applications/${id}/messages`, { token: stranger.accessToken })).status, 404);
  await api('POST', `/applications/${id}/withdraw`, { token: st });
  assert.equal((await api('POST', `/applications/${id}/messages`, { token: emp.accessToken, body: { body: 'late' } })).status, 409);
});
