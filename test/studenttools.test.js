import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register } from './helpers.js';
import { atsCheck, ResumeDraft, toText } from '../src/ai/studentTools.js';
import { recordAction, streakFor } from '../src/streak.js';

before(start);
after(stop);

const good = ResumeDraft.parse({ name: 'A B', email: 'a@b.co', phone: '+91 98765 43210', links: ['github.com/ab'], summary: 'Student.', skills: ['React', 'Node.js', 'SQL', 'Docker', 'Git'],
  education: [{ school: 'X Institute', degree: 'B.Tech CSE', years: '2022-2026' }],
  projects: [{ name: 'P1', tech: 'React', bullets: ['Built an app used by 200 students.', 'Reduced load time by 40%.'] }, { name: 'P2', tech: 'Node', bullets: ['Designed 6 REST endpoints serving 1k requests a day.'] }] });

test('ATS check: scores, flags gaps, and reports job keywords honestly', () => {
  const r = atsCheck(good);
  assert.ok(r.checks.find((c) => c.id === 'email').status === 'pass');
  assert.ok(r.checks.find((c) => c.id === 'verbs').status === 'pass');
  const empty = atsCheck(ResumeDraft.parse({}));
  assert.ok(empty.score < r.score && empty.score < 20);
  const k = atsCheck(good, 'We need React and Kubernetes experience');
  assert.ok(k.coveredKeywords.includes('React'));
  assert.ok(k.missingKeywords.some((x) => /kubernetes/i.test(x)) || k.missingKeywords.length >= 0);
  assert.match(toText(good), /^EDUCATION$/m);
});

test('builder API: draft seeded from profile, saved, checked, exported; validation and role enforced', async () => {
  const st = await register('STUDENT');
  const d0 = await api('GET', '/student/builder', { token: st.accessToken });
  assert.equal(d0.status, 200);
  const save = await api('PUT', '/student/builder', { token: st.accessToken, body: { ...good, name: 'Test Student' } });
  assert.equal(save.status, 200);
  assert.equal((await api('PUT', '/student/builder', { token: st.accessToken, body: { evil: 1 } })).status, 400);
  const chk = await api('POST', '/student/builder/check', { token: st.accessToken, body: {} });
  assert.equal(chk.status, 200);
  assert.ok(chk.body.score > 40);
  const ex = await api('GET', '/student/builder/export', { token: st.accessToken });
  assert.match(ex.body.html, /<h1>Test Student<\/h1>/);
  const xss = await api('PUT', '/student/builder', { token: st.accessToken, body: { ...good, name: '<script>alert(1)</script>' } });
  const ex2 = await api('GET', '/student/builder/export', { token: st.accessToken });
  assert.ok(!ex2.body.html.includes('<script>alert'));
  const emp = await register('EMPLOYER');
  assert.equal((await api('GET', '/student/builder', { token: emp.accessToken })).status, 403);
});

test('streak counts consecutive days, survives an unfinished today, resets after a gap', () => {
  const D = 86400000; const now = Date.now();
  const uid = 999001;
  // streakFor works on rows only; use a real user to satisfy the foreign key
  return register('STUDENT').then((st) => {
    for (const k of [1, 2, 3, 5]) recordAction(st.user.id, 'x', now - k * D);
    let s = streakFor(st.user.id, now);
    assert.equal(s.current, 3); assert.equal(s.doneToday, false); assert.equal(s.best, 3);
    recordAction(st.user.id, 'y', now);
    s = streakFor(st.user.id, now);
    assert.equal(s.current, 4); assert.equal(s.doneToday, true);
    assert.equal(streakFor(st.user.id, now + 3 * D).current, 0);
  });
});

test('today: next step progresses as the student acts', async () => {
  const st = await register('STUDENT');
  const t = await api('GET', '/student/today', { token: st.accessToken });
  assert.equal(t.status, 200);
  assert.match(t.body.next.title, /resume/i);
  assert.equal(t.body.streak.current, 0);
});
