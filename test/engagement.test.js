// The two-sided engagement layer: shared inbox, saved searches with alerts, reply-time stats, live stream tickets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin, pdfForm, RESUME_LINES } from './helpers.js';
import { runSavedSearchAlerts } from '../src/routes/engagement.js';
import { __clearReplyCache } from '../src/replyStats.js';

let emp; let student; let other; let jobId; let appId; let reactSkill;

before(async () => {
  await start();
  const adminToken = await login('admin@test.local', 'Admin@12345');

  emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: adminToken });
  reactSkill = (await api('GET', '/skills?q=React', { token: emp.accessToken })).body.items[0];
  const job = await api('POST', '/employer/jobs', {
    token: emp.accessToken,
    body: { title: 'Frontend Engineer', description: 'React and design systems.', type: 'FULL_TIME', location: 'Remote', remote: true, skills: [{ skillId: reactSkill.id, weight: 3 }] },
  });
  assert.equal(job.status, 201);
  jobId = job.body.id;

  student = await register('STUDENT');
  await api('PUT', '/students/me/skills', { token: student.accessToken, body: { skillIds: [reactSkill.id] } });
  const resume = await api('POST', '/resumes', { token: student.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
  assert.equal(resume.status, 201, JSON.stringify(resume.body));
  const applied = await api('POST', `/jobs/${jobId}/apply`, { token: student.accessToken, body: { resumeId: resume.body.id, coverNote: 'Hi' } });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  appId = applied.body.id;

  other = await register('STUDENT');
  const otherResume = await api('POST', '/resumes', { token: other.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
  await api('POST', `/jobs/${jobId}/apply`, { token: other.accessToken, body: { resumeId: otherResume.body.id, coverNote: 'Also hi' } });
});

after(stop);

test('an employer message lands in the student inbox with an unread count', async () => {
  const empty = await api('GET', '/messages/threads', { token: student.accessToken });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.items.length, 0, 'no thread until somebody writes');
  assert.equal(empty.body.unread, 0);

  const sent = await api('POST', `/applications/${appId}/messages`, { token: emp.accessToken, body: { body: 'Thanks for applying - are you free Thursday?' } });
  assert.equal(sent.status, 201);

  const inbox = await api('GET', '/messages/threads', { token: student.accessToken });
  assert.equal(inbox.body.unread, 1);
  assert.equal(inbox.body.items.length, 1);
  const t = inbox.body.items[0];
  assert.equal(t.applicationId, appId);
  assert.equal(t.you, 'STUDENT');
  assert.equal(t.with, 'Company ' + emp.email.match(/(\d+)/)[1], 'the employer name, not the student');
  assert.match(t.last.body, /Thursday/);
  assert.equal(t.last.from, 'EMPLOYER');

  const count = await api('GET', '/messages/unread', { token: student.accessToken });
  assert.equal(count.body.unread, 1);
});

test('opening a thread marks it read, and the reply shows up on the other side', async () => {
  const thread = await api('GET', `/applications/${appId}/messages`, { token: student.accessToken });
  assert.equal(thread.status, 200);
  assert.equal(thread.body.you, 'STUDENT');
  assert.equal(thread.body.canReply, true, 'a student may reply once the employer wrote first');

  const after = await api('GET', '/messages/unread', { token: student.accessToken });
  assert.equal(after.body.unread, 0, 'reading the thread clears the badge');

  const reply = await api('POST', `/applications/${appId}/messages`, { token: student.accessToken, body: { body: 'Thursday works.' } });
  assert.equal(reply.status, 201);

  await api('POST', `/applications/${appId}/messages`, { token: emp.accessToken, body: { body: 'Great - invite sent.' } });

  const empInbox = await api('GET', '/messages/threads', { token: emp.accessToken });
  assert.equal(empInbox.body.unread, 1, 'only the candidate reply is unread - your own messages never count');
  assert.equal(empInbox.body.items[0].you, 'EMPLOYER');
  assert.match(empInbox.body.items[0].last.body, /invite sent/, 'the newest message wins the preview');
});

test('a student cannot open a thread with an employer who never wrote', async () => {
  const theirs = (await api('GET', '/applications', { token: other.accessToken })).body.items[0];
  const res = await api('POST', `/applications/${theirs.id}/messages`, { token: other.accessToken, body: { body: 'Hello?' } });
  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /EMPLOYER_MUST_START/, 'the error says why, not just 403');

  const inbox = await api('GET', '/messages/threads', { token: other.accessToken });
  assert.equal(inbox.body.items.length, 0);
});

test('someone else\'s thread is a 404, and read-marking is guarded the same way', async () => {
  const read = await api('POST', `/messages/threads/${appId}/read`, { token: other.accessToken });
  assert.equal(read.status, 404);
  const peek = await api('GET', `/applications/${appId}/messages`, { token: other.accessToken });
  assert.equal(peek.status, 404);
});

test('an interview appears inside the thread as a system entry', async () => {
  await api('PATCH', `/employer/applications/${appId}/status`, { token: emp.accessToken, body: { status: 'SHORTLISTED' } });
  const when = new Date(Date.now() + 3 * 86400000).toISOString();
  const booked = await api('POST', `/employer/applications/${appId}/interviews`, {
    token: emp.accessToken,
    body: { startsAt: when, durationMin: 45, mode: 'VIDEO', location: 'https://meet.example/x', note: 'Bring a portfolio' },
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));

  const thread = await api('GET', `/applications/${appId}/messages`, { token: student.accessToken });
  const sys = thread.body.items.filter((m) => m.from === 'SYSTEM');
  assert.equal(sys.length, 1);
  assert.equal(sys[0].kind, 'interview');
  assert.match(sys[0].body, /Interview scheduled/);
  assert.match(sys[0].body, /Video call/);
  assert.ok(thread.body.items.some((m) => m.from === 'EMPLOYER'), 'real messages are still there');

  const inbox = await api('GET', '/messages/threads', { token: student.accessToken });
  assert.equal(inbox.body.items[0].upcomingInterviews, 1, 'the inbox shows that something is scheduled');
});

test('saved searches: create, dedupe, list with match counts, preview, delete', async () => {
  const none = await api('POST', '/student/saved-searches', { token: student.accessToken, body: { minMatch: 80 } });
  assert.equal(none.status, 400, 'a search with no filters would match everything');

  const made = await api('POST', '/student/saved-searches', {
    token: student.accessToken,
    body: { name: 'Remote React', q: 'React', remote: true, minMatch: 60 },
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.search.name, 'Remote React');
  assert.ok(made.body.search.matches >= 1, 'the new job already matches');

  const again = await api('POST', '/student/saved-searches', { token: student.accessToken, body: { q: 'React', remote: true, minMatch: 60 } });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.search.id, made.body.search.id, 'the same filters never create a second row');

  const list = await api('GET', '/student/saved-searches', { token: student.accessToken });
  assert.equal(list.body.items.length, 1);
  assert.ok(list.body.items[0].label.includes('React'));

  const preview = await api('GET', `/student/saved-searches/${made.body.search.id}/matches`, { token: student.accessToken });
  assert.equal(preview.status, 200);
  assert.ok(preview.body.total >= 1);
  assert.equal(preview.body.items[0].id, jobId);

  const gone = await api('DELETE', `/student/saved-searches/${made.body.search.id}`, { token: student.accessToken });
  assert.equal(gone.status, 200);
  assert.equal((await api('GET', '/student/saved-searches', { token: student.accessToken })).body.items.length, 0);
});

test('a new job alerts the students whose saved search it satisfies - exactly once', async () => {
  const watcher = await register('STUDENT');
  await api('PUT', '/students/me/skills', { token: watcher.accessToken, body: { skillIds: [reactSkill.id] } });
  const saved = await api('POST', '/student/saved-searches', {
    token: watcher.accessToken,
    body: { name: 'Backend', q: 'Backend', type: 'FULL_TIME', minMatch: 50 },
  });
  assert.equal(saved.status, 201);

  const job = await api('POST', '/employer/jobs', {
    token: emp.accessToken,
    body: { title: 'Backend Engineer', description: 'React-adjacent platform work.', type: 'FULL_TIME', location: 'Remote', remote: true, skills: [{ skillId: reactSkill.id, weight: 3 }] },
  });
  assert.equal(job.status, 201);

  const first = runSavedSearchAlerts(job.body.id);
  assert.ok(first.alerted >= 1, JSON.stringify(first));

  const inbox = await api('GET', '/notifications', { token: watcher.accessToken });
  const alerts = inbox.body.items.filter((n) => n.type === 'saved_search_alert');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /match for "Backend/, 'the alert names the search that matched');
  assert.match(alerts[0].link, new RegExp(`#/student/jobs/${job.body.id}`));

  const second = runSavedSearchAlerts(job.body.id);
  assert.equal(second.alerted, 0, 'a retried task must not notify twice');
  const after = await api('GET', '/notifications', { token: watcher.accessToken });
  assert.equal(after.body.items.filter((n) => n.type === 'saved_search_alert').length, 1);
});

test('reply time is measured from real threads and shown to both sides', async () => {
  __clearReplyCache();
  const res = await api('GET', '/employer/response-time', { token: emp.accessToken });
  assert.equal(res.status, 200);
  assert.ok(res.body.replies >= 1, 'the employer replied in this suite');
  assert.ok(res.body.medianHours != null && res.body.medianHours >= 0);

  const denied = await api('GET', '/employer/response-time', { token: student.accessToken });
  assert.equal(denied.status, 403);

  const detail = await api('GET', `/applications/${appId}`, { token: student.accessToken });
  assert.match(detail.body.employerReply || '', /replies/);
});

test('the live stream accepts a single-use ticket, because EventSource cannot send a token', async () => {
  const t = await api('POST', '/realtime/ticket', { token: student.accessToken });
  assert.equal(t.status, 200);
  assert.ok(t.body.ticket);

  const ctrl = new AbortController();
  const stream = await fetch(`${getOrigin()}/api/realtime/stream?ticket=${encodeURIComponent(t.body.ticket)}`, { signal: ctrl.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') || '', /text\/event-stream/);
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: connected/);
  ctrl.abort();

  const replay = await fetch(`${getOrigin()}/api/realtime/stream?ticket=${encodeURIComponent(t.body.ticket)}`);
  assert.equal(replay.status, 401, 'a ticket is single-use');
  await replay.body?.cancel();

  const anonymous = await fetch(`${getOrigin()}/api/realtime/stream`);
  assert.equal(anonymous.status, 401);
  await anonymous.body?.cancel();
});
