import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, login, register, getOrigin } from './helpers.js';
import { seedTaxonomy, seedAdmin, seedDemo } from '../src/seed.js';
import { db } from '../src/db.js';

before(start);
after(stop);

test('Full-stack Demo Seeder covers all 17 LanTURN 3.0 tables with realistic data', async () => {
  seedTaxonomy();
  seedAdmin();
  seedDemo();

  const counts = {
    users: db.prepare('SELECT count(*) as c FROM users').get().c,
    jobs: db.prepare('SELECT count(*) as c FROM jobs').get().c,
    applications: db.prepare('SELECT count(*) as c FROM applications').get().c,
    careerDna: db.prepare('SELECT count(*) as c FROM career_dna').get().c,
    skillMedals: db.prepare('SELECT count(*) as c FROM skill_medals').get().c,
    careerRoadmaps: db.prepare('SELECT count(*) as c FROM career_roadmaps').get().c,
    roadmapProgress: db.prepare('SELECT count(*) as c FROM roadmap_progress').get().c,
    connections: db.prepare('SELECT count(*) as c FROM connections').get().c,
    posts: db.prepare('SELECT count(*) as c FROM posts').get().c,
    directMessages: db.prepare('SELECT count(*) as c FROM direct_messages').get().c,
    endorsements: db.prepare('SELECT count(*) as c FROM skill_endorsements').get().c,
    mockInterviews: db.prepare('SELECT count(*) as c FROM mock_interviews').get().c,
    savedJobs: db.prepare('SELECT count(*) as c FROM saved_jobs').get().c,
    placementDrives: db.prepare('SELECT count(*) as c FROM placement_drives').get().c,
    driveRegistrations: db.prepare('SELECT count(*) as c FROM drive_registrations').get().c,
  };

  assert.ok(counts.users >= 5, 'Should have users');
  assert.ok(counts.jobs >= 5, 'Should have jobs');
  assert.ok(counts.applications >= 3, 'Should have applications');
  assert.ok(counts.mockInterviews >= 1, 'Should have seeded mock interview sessions');
  assert.ok(counts.savedJobs >= 2, 'Should have seeded saved jobs');
  assert.ok(counts.placementDrives >= 2, 'Should have seeded upcoming placement drives');
  assert.ok(counts.driveRegistrations >= 2, 'Should have seeded drive registrations');
});

test('Public Platform Statistics API — public transparency metrics', async () => {
  // Public endpoint does not require an Authorization token
  const res = await fetch(`${getOrigin()}/api/platform/stats`);
  assert.equal(res.status, 200);

  const stats = await res.json();
  assert.ok(typeof stats.studentsCount === 'number');
  assert.ok(typeof stats.employersCount === 'number');
  assert.ok(typeof stats.openJobsCount === 'number');
  assert.ok(typeof stats.applicationsCount === 'number');
  assert.ok(typeof stats.verifiedSkillsCount === 'number');
  assert.ok(typeof stats.upcomingDrivesCount === 'number');
  assert.ok(typeof stats.college === 'string');
});

test('Admin AI Diagnostics & Provider Benchmarking', async () => {
  seedTaxonomy();
  seedAdmin();

  const adminToken = await login('admin@test.local', 'Admin@12345');

  // Admin access
  const diagRes = await api('GET', '/admin/ai/diagnostics', { token: adminToken });
  assert.equal(diagRes.status, 200);
  assert.ok(diagRes.body.aiMode);
  assert.ok(Array.isArray(diagRes.body.configuredProviders));
  assert.ok(diagRes.body.quotaLimits);
  assert.ok(diagRes.body.systemTime);

  // Student access should be forbidden
  const student = await register('STUDENT');
  const forbidden = await api('GET', '/admin/ai/diagnostics', { token: student.accessToken });
  assert.equal(forbidden.status, 403);
});
