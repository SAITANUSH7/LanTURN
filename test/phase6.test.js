import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, pdfForm, RESUME_LINES } from './helpers.js';
import { seedTaxonomy, seedAdmin } from '../src/seed.js';
import { db } from '../src/db.js';

before(start);
after(stop);

test('Mock Interview Studio — start session, generate questions, submit answers, evaluate feedback', async () => {
  seedTaxonomy();
  seedAdmin();

  const student = await register('STUDENT');

  // 1. Start mock interview
  const startRes = await api('POST', '/interviews/start', {
    token: student.accessToken,
    body: {
      roleTitle: 'Full Stack Engineer',
      skills: ['JavaScript', 'React', 'Node.js', 'System Design'],
    },
  });

  assert.equal(startRes.status, 201);
  const interview = startRes.body;
  assert.ok(interview.id, 'Session should have an ID');
  assert.equal(interview.roleTitle, 'Full Stack Engineer');
  assert.equal(interview.status, 'IN_PROGRESS');
  assert.ok(Array.isArray(interview.questions), 'Questions should be an array');
  assert.equal(interview.questions.length, 3, 'Should generate 3 structured questions');

  // Verify question categories
  const kinds = interview.questions.map((q) => q.kind);
  assert.ok(kinds.includes('system_design'), 'Includes system design question');
  assert.ok(kinds.includes('technical'), 'Includes technical question');
  assert.ok(kinds.includes('behavioral'), 'Includes behavioral question');

  // 2. Fetch session detail by ID
  const detailRes = await api('GET', `/interviews/${interview.id}`, { token: student.accessToken });
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.id, interview.id);
  assert.equal(detailRes.body.status, 'IN_PROGRESS');

  // 3. Submit answers for evaluation
  const answers = [
    'I would design a distributed message queue using partitioning, replication, and consumer groups to ensure high throughput and fault tolerance.',
    'React virtual DOM minimizes direct DOM manipulation by computing diffs in memory and applying batched updates efficiently.',
    'When deadlines conflict, I prioritize tasks using the impact-effort matrix, communicate with stakeholders early, and deliver MVP iteratively.',
  ];

  const submitRes = await api('POST', `/interviews/${interview.id}/submit`, {
    token: student.accessToken,
    body: { answers },
  });

  assert.equal(submitRes.status, 200);
  const evaluated = submitRes.body;
  assert.equal(evaluated.status, 'COMPLETED');
  assert.ok(typeof evaluated.overallScore === 'number' && evaluated.overallScore >= 0 && evaluated.overallScore <= 100);
  assert.ok(evaluated.feedback, 'Evaluation feedback should be present');
  assert.ok(evaluated.feedback.readinessLevel, 'Readiness level should be computed');
  assert.ok(evaluated.feedback.summary, 'Summary should be provided');
  assert.ok(Array.isArray(evaluated.feedback.evaluations), 'Evaluations should be an array');
  assert.equal(evaluated.feedback.evaluations.length, 3);
  assert.ok(evaluated.feedback.evaluations[0].strengths.length > 0);
  assert.ok(evaluated.feedback.evaluations[0].improvements.length > 0);

  // 4. Submitting again to completed session should fail
  const duplicateSubmit = await api('POST', `/interviews/${interview.id}/submit`, {
    token: student.accessToken,
    body: { answers },
  });
  assert.equal(duplicateSubmit.status, 400);

  // 5. List interviews history
  const listRes = await api('GET', '/interviews', { token: student.accessToken });
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.items));
  const found = listRes.body.items.find((i) => i.id === interview.id);
  assert.ok(found);
  assert.equal(found.status, 'COMPLETED');
  assert.equal(found.overallScore, evaluated.overallScore);
});

test('Employer Candidate Shortlist Recommendations — intelligent scoring and ranking', async () => {
  seedTaxonomy();
  seedAdmin();

  // Create & verify employer
  const emp = await register('EMPLOYER');
  const adminToken = await login('admin@test.local', 'Admin@12345');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: adminToken });

  // Post a job requiring React & Node
  const reactSkill = (await api('GET', '/skills?q=React', { token: emp.accessToken })).body.items[0];
  const nodeSkill = (await api('GET', '/skills?q=Node', { token: emp.accessToken })).body.items[0];

  const jobRes = await api('POST', '/employer/jobs', {
    token: emp.accessToken,
    body: {
      title: 'Senior Frontend Architect',
      description: 'Lead our web platform development.',
      type: 'FULL_TIME',
      location: 'Bengaluru',
      remote: true,
      compensation: '25 LPA',
      skills: [
        { skillId: reactSkill.id, weight: 3 },
        { skillId: nodeSkill.id, weight: 2 },
      ],
    },
  });
  assert.equal(jobRes.status, 201);
  const jobId = jobRes.body.id;

  // Student 1: applies with resume and has high skills & verified medal
  const student1 = await register('STUDENT');
  await api('POST', '/me/skills', {
    token: student1.accessToken,
    body: { skillId: reactSkill.id, proficiency: 'ADVANCED' },
  });
  await api('POST', '/me/skills', {
    token: student1.accessToken,
    body: { skillId: nodeSkill.id, proficiency: 'ADVANCED' },
  });

  // Insert verified medal and Career DNA for student 1
  const testId = Number(db.prepare("INSERT INTO skill_tests (user_id, skill, tier, status, questions, source) VALUES (?, 'React', 3, 'DONE', '[]', 'rules')").run(student1.user.id).lastInsertRowid);
  db.prepare("INSERT INTO skill_medals (user_id, test_id, skill, medal, correct, feedback, source) VALUES (?, ?, 'React', 'GOLD', 5, '[]', 'rules')").run(student1.user.id, testId);
  db.prepare("INSERT INTO career_dna (user_id, archetype, summary, dimensions, strengths, source) VALUES (?, 'System Architect', 'Strong architecture focus', '[]', '[]', 'rules')").run(student1.user.id);

  const up1 = await api('POST', '/resumes', { token: student1.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
  await api('POST', `/jobs/${jobId}/apply`, {
    token: student1.accessToken,
    body: { resumeId: up1.body.id, coverNote: 'Strong architect profile.' },
  });

  // Student 2: applies with resume but fewer skills
  const student2 = await register('STUDENT');
  const up2 = await api('POST', '/resumes', { token: student2.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
  await api('POST', `/jobs/${jobId}/apply`, {
    token: student2.accessToken,
    body: { resumeId: up2.body.id, coverNote: 'Interested in frontend.' },
  });

  // Employer queries candidate recommendations
  const recRes = await api('GET', `/employer/jobs/${jobId}/recommendations`, { token: emp.accessToken });
  assert.equal(recRes.status, 200);
  assert.equal(recRes.body.jobId, jobId);
  assert.ok(Array.isArray(recRes.body.recommendations));
  assert.equal(recRes.body.recommendations.length, 2);

  // Recommendations should be sorted by compositeScore descending
  const [topCand, secondCand] = recRes.body.recommendations;
  assert.ok(topCand.compositeScore >= secondCand.compositeScore, 'Candidates should be ranked by composite score');
  assert.equal(topCand.studentId, student1.user.id, 'Student 1 should rank higher due to skills, medal, and DNA');
  assert.equal(topCand.medalsCount, 1);
  assert.equal(topCand.archetype, 'System Architect');
  assert.ok(topCand.recommendationReason.includes('medal') || topCand.recommendationReason.includes('match') || topCand.recommendationReason.includes('archetype'));

  // Unauthorized access checks
  const studentForbidden = await api('GET', `/employer/jobs/${jobId}/recommendations`, { token: student1.accessToken });
  assert.equal(studentForbidden.status, 403);

  const anotherEmp = await register('EMPLOYER');
  const otherEmpJob = await api('GET', `/employer/jobs/${jobId}/recommendations`, { token: anotherEmp.accessToken });
  assert.equal(otherEmpJob.status, 404, 'Employer cannot access recommendations for another employer job');
});

test('Admin Placement Analytics — comprehensive metrics and skill demand insights', async () => {
  seedTaxonomy();
  seedAdmin();

  const adminToken = await login('admin@test.local', 'Admin@12345');

  // Fetch admin placement analytics
  const analyticsRes = await api('GET', '/admin/analytics', { token: adminToken });
  assert.equal(analyticsRes.status, 200);

  const { metrics, inDemandSkills, topStudentSkills } = analyticsRes.body;
  assert.ok(metrics, 'Metrics object must be returned');
  assert.ok(typeof metrics.totalStudents === 'number');
  assert.ok(typeof metrics.totalEmployers === 'number');
  assert.ok(typeof metrics.totalJobs === 'number');
  assert.ok(typeof metrics.openJobs === 'number');
  assert.ok(typeof metrics.totalApplications === 'number');
  assert.ok(typeof metrics.placementRate === 'number');
  assert.ok(typeof metrics.avgMatchScore === 'number');

  assert.ok(Array.isArray(inDemandSkills), 'In-demand skills should be an array');
  assert.ok(Array.isArray(topStudentSkills), 'Top student skills should be an array');

  // Non-admin access should be forbidden
  const student = await register('STUDENT');
  const forbiddenRes = await api('GET', '/admin/analytics', { token: student.accessToken });
  assert.equal(forbiddenRes.status, 403);
});
