import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, pdfForm, RESUME_LINES } from './helpers.js';
import { seedTaxonomy, seedAdmin, seedDemo } from '../src/seed.js';
import { db } from '../src/db.js';

before(start);
after(stop);

test('Admin Platform Operations — analytics summary, job moderation & verification', async () => {
  seedTaxonomy();
  seedAdmin();

  const adminToken = await login('admin@test.local', 'Admin@12345');

  // Register an employer and post a job
  const emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: adminToken });

  const skillsRes = await api('GET', '/skills?q=React', { token: emp.accessToken });
  const reactSkill = skillsRes.body.items[0];

  const jobRes = await api('POST', '/employer/jobs', {
    token: emp.accessToken,
    body: {
      title: 'Cloud Systems Engineer',
      description: 'Design resilient microservices.',
      type: 'FULL_TIME',
      location: 'Hyderabad',
      remote: true,
      compensation: '22 LPA',
      skills: [{ skillId: reactSkill.id, weight: 3 }],
    },
  });
  assert.equal(jobRes.status, 201);
  const jobId = jobRes.body.id;

  // 1. GET /api/admin/analytics/summary
  const summaryRes = await api('GET', '/admin/analytics/summary', { token: adminToken });
  assert.equal(summaryRes.status, 200);
  const summary = summaryRes.body;
  assert.ok(typeof summary.users === 'number');
  assert.ok(typeof summary.activeJobs === 'number');
  assert.ok(typeof summary.applications === 'number');
  assert.ok(typeof summary.verifiedJobs === 'number');
  assert.ok(typeof summary.hired === 'number');
  assert.ok(typeof summary.placementRate === 'number');

  // 2. GET /api/admin/jobs
  const jobsRes = await api('GET', '/admin/jobs', { token: adminToken });
  assert.equal(jobsRes.status, 200);
  assert.ok(Array.isArray(jobsRes.body.items));
  const foundJob = jobsRes.body.items.find((j) => j.jobId === jobId);
  assert.ok(foundJob);
  assert.equal(foundJob.title, 'Cloud Systems Engineer');
  assert.equal(foundJob.verifiedByAdmin, false);

  // 3. PATCH /api/admin/jobs/:id/verify
  const verifyRes = await api('PATCH', `/admin/jobs/${jobId}/verify`, { token: adminToken });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.verifiedByAdmin, true);

  // Re-verify in jobs list
  const recheckJobs = await api('GET', '/admin/jobs', { token: adminToken });
  const verifiedJob = recheckJobs.body.items.find((j) => j.jobId === jobId);
  assert.equal(verifiedJob.verifiedByAdmin, true);

  // 4. PATCH /api/admin/jobs/:id/status
  const statusRes = await api('PATCH', `/admin/jobs/${jobId}/status`, {
    token: adminToken,
    body: { status: 'paused' },
  });
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.rawStatus, 'CLOSED');

  // Reactivate
  const reactivateRes = await api('PATCH', `/admin/jobs/${jobId}/status`, {
    token: adminToken,
    body: { status: 'active' },
  });
  assert.equal(reactivateRes.status, 200);
  assert.equal(reactivateRes.body.rawStatus, 'OPEN');
});

test('Admin User Management — user listing, account moderation & role management', async () => {
  seedTaxonomy();
  seedAdmin();

  const adminToken = await login('admin@test.local', 'Admin@12345');
  const student = await register('STUDENT');

  // 1. GET /api/admin/users
  const usersRes = await api('GET', '/admin/users', { token: adminToken });
  assert.equal(usersRes.status, 200);
  assert.ok(Array.isArray(usersRes.body.items));
  const foundStudent = usersRes.body.items.find((u) => u.uid === student.user.id);
  assert.ok(foundStudent);
  assert.equal(foundStudent.role, 'student');
  assert.equal(foundStudent.status, 'active');

  // 2. PATCH /api/admin/users/:id/status (moderate to disabled)
  const disableRes = await api('PATCH', `/admin/users/${student.user.id}/status`, {
    token: adminToken,
    body: { status: 'disabled' },
  });
  assert.equal(disableRes.status, 200);
  assert.equal(disableRes.body.status, 'disabled');

  // Verify in users list
  const disabledList = await api('GET', '/admin/users?status=disabled', { token: adminToken });
  const inDisabled = disabledList.body.items.find((u) => u.uid === student.user.id);
  assert.ok(inDisabled);
  assert.equal(inDisabled.status, 'disabled');

  // A disabled account is actually disabled: its existing access token stops working immediately...
  assert.equal((await api('GET', '/me', { token: student.accessToken })).status, 401);
  // ...and it cannot sign in again while disabled.
  assert.equal((await api('POST', '/auth/login', { body: { email: student.email, password: 'Passw0rd!x' } })).status, 401);

  // Restore to active
  const enableRes = await api('PATCH', `/admin/users/${student.user.id}/status`, {
    token: adminToken,
    body: { status: 'active' },
  });
  assert.equal(enableRes.status, 200);
  assert.equal(enableRes.body.status, 'active');

  // 3. Unauthorized access check: Students cannot access admin routes (fresh token: the old one was revoked)
  const fresh = (await api('POST', '/auth/login', { body: { email: student.email, password: 'Passw0rd!x' } })).body;
  const studentForbidden = await api('GET', '/admin/users', { token: fresh.accessToken });
  assert.equal(studentForbidden.status, 403);
});

test('Skill Arena 2.0 — proctoring telemetry & campus leaderboard', async () => {
  seedTaxonomy();
  seedAdmin();

  const student1 = await register('STUDENT');
  const student2 = await register('STUDENT');

  // Award medals to student 1 (Gold in React)
  const test1 = Number(db.prepare("INSERT INTO skill_tests (user_id, skill, tier, status, questions, source) VALUES (?, 'React', 3, 'DONE', '[]', 'rules')").run(student1.user.id).lastInsertRowid);
  db.prepare("INSERT INTO skill_medals (user_id, test_id, skill, medal, correct, feedback, source) VALUES (?, ?, 'React', 'GOLD', 3, '[]', 'rules')").run(student1.user.id, test1);

  // Award medals to student 2 (Silver in Python)
  const test2 = Number(db.prepare("INSERT INTO skill_tests (user_id, skill, tier, status, questions, source) VALUES (?, 'Python', 2, 'DONE', '[]', 'rules')").run(student2.user.id).lastInsertRowid);
  db.prepare("INSERT INTO skill_medals (user_id, test_id, skill, medal, correct, feedback, source) VALUES (?, ?, 'Python', 'SILVER', 2, '[]', 'rules')").run(student2.user.id, test2);

  // Test Skill Arena with proctoring telemetry
  const genTest = await api('POST', '/arena/tests', {
    token: student1.accessToken,
    body: { skill: 'JavaScript', selfRating: 2 },
  });
  assert.equal(genTest.status, 201);
  const newTestId = genTest.body.id;

  const submitWithTelemetry = await api('POST', `/arena/tests/${newTestId}/submit`, {
    token: student1.accessToken,
    body: {
      answers: [
        'JavaScript is a dynamic, single-threaded interpreted language used for asynchronous event-driven client and server applications.',
        'I built a real-time collaborative whiteboard using Node.js, WebSockets, and HTML5 Canvas with room broadcast.',
        'Common pitfalls include unhandled promise rejections and memory leaks from uncleared intervals or closures.',
      ],
      telemetry: {
        tabSwitches: 0,
        pasteEvents: 0,
        timeTakenSeconds: 42,
      },
    },
  });
  assert.equal(submitWithTelemetry.status, 201);
  assert.ok(submitWithTelemetry.body.medal);

  // GET /api/arena/leaderboard
  const lbRes = await api('GET', '/arena/leaderboard', { token: student1.accessToken });
  assert.equal(lbRes.status, 200);
  assert.ok(Array.isArray(lbRes.body.leaderboard));
  assert.ok(lbRes.body.leaderboard.length >= 2);

  // Student 1 should rank higher due to Gold medal (100+ pts) vs Student 2 Silver (70 pts)
  const topRank = lbRes.body.leaderboard[0];
  assert.equal(topRank.userId, student1.user.id);
  assert.ok(topRank.points >= 100);
  assert.ok(topRank.topSkills.includes('React'));
});
