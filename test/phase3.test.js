import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin, pdfForm, makePdf, RESUME_LINES } from './helpers.js';

before(start);
after(stop);

test('Career AIsle domains catalog and detail', async () => {
  const s = await register('STUDENT');

  // List domains
  const list = await api('GET', '/roadmaps/domains', { token: s.accessToken });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.domains));
  assert.ok(list.body.domains.length >= 10, 'Should have rich set of domains');

  const frontend = list.body.domains.find((d) => d.id === 'frontend');
  assert.ok(frontend);
  assert.equal(frontend.stagesCount, 5);

  // Single domain detail
  const detail = await api('GET', '/roadmaps/domains/frontend', { token: s.accessToken });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.domain.id, 'frontend');
  assert.equal(detail.body.domain.stages.length, 5);
  assert.ok(detail.body.domain.stages[0].topics.length > 0);
  assert.ok(detail.body.domain.stages[0].resources.length > 0);
  assert.ok(detail.body.domain.stages[0].project.title);
});

test('Career Roadmap enrollment, progress tracking and batch sync', async () => {
  const s = await register('STUDENT');

  // 1. Initial enrolled should be empty
  let mine = await api('GET', '/roadmaps/me', { token: s.accessToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.items.length, 0);

  // 2. Enroll in 'backend'
  const enroll = await api('POST', '/roadmaps/me/enroll', { token: s.accessToken, body: { domainId: 'backend' } });
  assert.equal(enroll.status, 201);
  assert.equal(enroll.body.domainId, 'backend');
  const roadmapId = enroll.body.id;
  assert.ok(roadmapId);

  // 3. Verify enrolled with 0% progress
  mine = await api('GET', '/roadmaps/me', { token: s.accessToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.items.length, 1);
  assert.equal(mine.body.items[0].completedCount, 0);
  assert.equal(mine.body.items[0].progressPercent, 0);

  // 4. Toggle topic completion (Stage 0, Topic 0)
  const toggle = await api('PATCH', `/roadmaps/me/${roadmapId}/progress`, {
    token: s.accessToken,
    body: { stageIndex: 0, topicIndex: 0, completed: true },
  });
  assert.equal(toggle.status, 200);
  assert.equal(toggle.body.completedCount, 1);
  assert.ok(toggle.body.progressPercent > 0);

  // 5. Batch-sync matched topics
  const sync = await api('POST', '/roadmaps/sync-resume-progress', {
    token: s.accessToken,
    body: { roadmapId, topicKeys: ['0-1', '0-2', '1-0'] },
  });
  assert.equal(sync.status, 200);
  assert.equal(sync.body.synced, 3);

  // 6. Verify total completed
  mine = await api('GET', '/roadmaps/me', { token: s.accessToken });
  assert.equal(mine.body.items[0].completedCount, 4);

  // 7. Untoggle a topic
  const untoggle = await api('PATCH', `/roadmaps/me/${roadmapId}/progress`, {
    token: s.accessToken,
    body: { stageIndex: 0, topicIndex: 0, completed: false },
  });
  assert.equal(untoggle.status, 200);
  assert.equal(untoggle.body.completedCount, 3);

  // 8. Unenroll
  const unenroll = await api('DELETE', `/roadmaps/me/${roadmapId}`, { token: s.accessToken });
  assert.equal(unenroll.status, 200);
  assert.equal(unenroll.body.ok, true);

  mine = await api('GET', '/roadmaps/me', { token: s.accessToken });
  assert.equal(mine.body.items.length, 0);
});

test('Student public profile and employer recruitment pipeline', async () => {
  const s = await register('STUDENT');
  const emp = await register('EMPLOYER');

  // Fill in student profile
  await api('PUT', '/students/me/profile', {
    token: s.accessToken,
    body: {
      fullName: 'Aravind Swaminathan',
      college: 'IIT Madras',
      degree: 'B.Tech',
      branch: 'Computer Science',
      graduationYear: 2026,
      location: 'Chennai',
      bio: 'Fullstack developer passionate about AI and systems.',
      preferredTypes: ['FULL_TIME'],
      preferredLocations: ['Chennai', 'Bengaluru'],
    },
  });

  // Fetch public profile as employer
  const pub = await api('GET', `/students/${s.user.id}/public`, { token: emp.accessToken });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.personal.name, 'Aravind Swaminathan');
  assert.equal(pub.body.academic.college, 'IIT Madras');

  // Admin approves employer
  const adminToken = await login('admin@test.local', 'Admin@12345');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: adminToken });

  // Post a job and apply
  const skillsRes = await api('GET', '/skills?q=React', { token: emp.accessToken });
  const reactSkillId = skillsRes.body.items[0].id;
  const jobRes = await api('POST', '/employer/jobs', {
    token: emp.accessToken,
    body: {
      title: 'Frontend Engineer',
      description: 'Join our team to build next-generation interfaces.',
      type: 'FULL_TIME',
      location: 'Bengaluru',
      remote: true,
      compensation: '18 LPA',
      skills: [{ skillId: reactSkillId, weight: 3 }],
    },
  });
  assert.equal(jobRes.status, 201);
  const jobId = jobRes.body.id;

  // Upload resume for student
  const up = await api('POST', '/resumes', { token: s.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
  assert.equal(up.status, 201);
  const resumeId = up.body.id;

  // Student applies
  const applyRes = await api('POST', `/jobs/${jobId}/apply`, {
    token: s.accessToken,
    body: { resumeId, coverNote: 'Excited about this opportunity!' },
  });
  assert.equal(applyRes.status, 201);
  const appId = applyRes.body.id;

  // Employer reviews candidate list
  const candList = await api('GET', `/employer/jobs/${jobId}/candidates`, { token: emp.accessToken });
  assert.equal(candList.status, 200);
  assert.equal(candList.body.items.length, 1);
  assert.equal(candList.body.items[0].applicationId, appId);

  // Employer moves candidate status with lowercase / synonym
  const toShortlist = await api('PATCH', `/employer/applications/${appId}/status`, {
    token: emp.accessToken,
    body: { status: 'shortlisted' },
  });
  assert.equal(toShortlist.status, 200);
  assert.equal(toShortlist.body.status, 'SHORTLISTED');

  const toInterview = await api('PATCH', `/employer/applications/${appId}/status`, {
    token: emp.accessToken,
    body: { status: 'interview' },
  });
  assert.equal(toInterview.status, 200);
  assert.equal(toInterview.body.status, 'INTERVIEW');

  const toOffer = await api('PATCH', `/employer/applications/${appId}/status`, {
    token: emp.accessToken,
    body: { status: 'hired' },
  });
  assert.equal(toOffer.status, 200);
  assert.equal(toOffer.body.status, 'OFFERED');
});

test('Realtime SSE stream connection handshake', async () => {
  const s = await register('STUDENT');
  const controller = new AbortController();

  const res = await fetch(`${getOrigin()}/api/realtime/stream`, {
    headers: { Authorization: `Bearer ${s.accessToken}` },
    signal: controller.signal,
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const { value } = await reader.read();
  const chunk = decoder.decode(value);

  assert.ok(chunk.includes('event: connected'));
  assert.ok(chunk.includes(`"userId":${s.user.id}`));

  controller.abort();
});
