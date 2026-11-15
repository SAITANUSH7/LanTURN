import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, pdfForm, RESUME_LINES } from './helpers.js';
import { seedTaxonomy, seedAdmin } from '../src/seed.js';

before(start);
after(stop);

test('Job Bookmarks & Saved Jobs — save, retrieve, and remove saved jobs', async () => {
  seedTaxonomy();
  seedAdmin();

  const emp = await register('EMPLOYER');
  const adminToken = await login('admin@test.local', 'Admin@12345');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: adminToken });

  const skillsRes = await api('GET', '/skills?q=React', { token: emp.accessToken });
  const reactSkill = skillsRes.body.items[0];

  const jobRes = await api('POST', '/employer/jobs', {
    token: emp.accessToken,
    body: {
      title: 'Full Stack Web Developer',
      description: 'Build enterprise platforms.',
      type: 'FULL_TIME',
      location: 'Pune',
      remote: true,
      compensation: '16 LPA',
      skills: [{ skillId: reactSkill.id, weight: 3 }],
    },
  });
  assert.equal(jobRes.status, 201);
  const jobId = jobRes.body.id;

  const student = await register('STUDENT');

  // Initially not saved
  const initialJob = await api('GET', `/jobs/${jobId}`, { token: student.accessToken });
  assert.equal(initialJob.status, 200);
  assert.equal(initialJob.body.isSaved, false);

  // 1. Save job
  const saveRes = await api('POST', `/jobs/${jobId}/save`, { token: student.accessToken });
  assert.equal(saveRes.status, 201);
  assert.equal(saveRes.body.isSaved, true);

  // Re-verify in job detail
  const savedJobDetail = await api('GET', `/jobs/${jobId}`, { token: student.accessToken });
  assert.equal(savedJobDetail.body.isSaved, true);

  // 2. Retrieve saved jobs list
  const savedList = await api('GET', '/jobs/saved', { token: student.accessToken });
  assert.equal(savedList.status, 200);
  assert.ok(Array.isArray(savedList.body.items));
  const found = savedList.body.items.find((j) => j.id === jobId);
  assert.ok(found);
  assert.equal(found.isSaved, true);

  // 3. Remove saved job
  const unsaveRes = await api('DELETE', `/jobs/${jobId}/save`, { token: student.accessToken });
  assert.equal(unsaveRes.status, 200);
  assert.equal(unsaveRes.body.isSaved, false);

  // Re-verify job detail
  const unsavedDetail = await api('GET', `/jobs/${jobId}`, { token: student.accessToken });
  assert.equal(unsavedDetail.body.isSaved, false);
});

test('Resume ATS Keyword Scanner & Tailoring Assistant', async () => {
  seedTaxonomy();
  seedAdmin();

  const student = await register('STUDENT');

  // Upload resume
  const upRes = await api('POST', '/resumes', {
    token: student.accessToken,
    form: pdfForm(RESUME_LINES, { consent: 'true' }),
  });
  assert.equal(upRes.status, 201);
  const resumeId = upRes.body.id;

  // Run ATS Tailor against target requirements
  const tailorRes = await api('POST', `/resumes/${resumeId}/tailor`, {
    token: student.accessToken,
    body: {
      title: 'DevOps & Site Reliability Engineer',
      description: 'Manage cloud clusters and CI/CD pipelines with Kubernetes and Terraform.',
      skills: ['Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Python', 'AWS'],
    },
  });

  assert.equal(tailorRes.status, 200);
  const tailor = tailorRes.body;
  assert.equal(tailor.resumeId, resumeId);
  assert.equal(tailor.targetRole, 'DevOps & Site Reliability Engineer');
  assert.ok(typeof tailor.atsScore === 'number' && tailor.atsScore >= 0 && tailor.atsScore <= 100);
  assert.ok(Array.isArray(tailor.matchedKeywords));
  assert.ok(Array.isArray(tailor.missingKeywords));
  assert.ok(typeof tailor.readabilityFeedback === 'string');
  assert.ok(Array.isArray(tailor.bulletSuggestions) && tailor.bulletSuggestions.length >= 2);
});

test('Campus Placement Drives & Event Calendar', async () => {
  seedTaxonomy();
  seedAdmin();

  const emp = await register('EMPLOYER');
  const adminToken = await login('admin@test.local', 'Admin@12345');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: adminToken });

  const student = await register('STUDENT');

  // 1. Student attempting to create drive should be forbidden
  const forbiddenCreate = await api('POST', '/drives', {
    token: student.accessToken,
    body: {
      companyName: 'Acme Corp',
      title: 'Annual Placement Drive 2026',
      driveDate: '2026-12-15',
    },
  });
  assert.equal(forbiddenCreate.status, 403);

  // 2. Employer creates placement drive
  const createRes = await api('POST', '/drives', {
    token: emp.accessToken,
    body: {
      companyName: 'Google Cloud Innovations',
      title: 'Campus Placement & Internship Drive',
      description: 'Hiring software engineers and technical solutions consultants.',
      driveDate: '2026-12-20',
      venue: 'Main Campus Auditorium & Online Coding Test',
      eligibility: 'B.Tech / M.Tech CS/IT (Min. 7.0 CGPA)',
      packageDetails: '18 - 24 LPA + Benefits',
    },
  });

  assert.equal(createRes.status, 201);
  const drive = createRes.body;
  assert.ok(drive.id);
  assert.equal(drive.companyName, 'Google Cloud Innovations');
  assert.equal(drive.status, 'UPCOMING');

  // 3. List drives
  const listRes = await api('GET', '/drives', { token: student.accessToken });
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.items));
  const foundDrive = listRes.body.items.find((d) => d.id === drive.id);
  assert.ok(foundDrive);
  assert.equal(foundDrive.isRegistered, false);

  // 4. Student registers for drive
  const regRes = await api('POST', `/drives/${drive.id}/register`, { token: student.accessToken });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.isRegistered, true);
  assert.equal(regRes.body.status, 'REGISTERED');

  // Duplicate registration should conflict
  const duplicateReg = await api('POST', `/drives/${drive.id}/register`, { token: student.accessToken });
  assert.equal(duplicateReg.status, 409);

  // 5. Student views registered drives
  const myDrives = await api('GET', '/drives/my/registrations', { token: student.accessToken });
  assert.equal(myDrives.status, 200);
  assert.ok(Array.isArray(myDrives.body.items));
  assert.equal(myDrives.body.items.length, 1);
  assert.equal(myDrives.body.items[0].id, drive.id);

  // 6. Student cancels registration
  const cancelRes = await api('DELETE', `/drives/${drive.id}/register`, { token: student.accessToken });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.isRegistered, false);
});
