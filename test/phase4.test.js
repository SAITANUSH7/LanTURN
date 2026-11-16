import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, getOrigin } from './helpers.js';
import { seedTaxonomy, seedAdmin, seedDemo } from '../src/seed.js';
import { db } from '../src/db.js';
import en from '../frontend/src/i18n/translations/en.js';
import hi from '../frontend/src/i18n/translations/hi.js';
import te from '../frontend/src/i18n/translations/te.js';

before(start);
after(stop);

test('PWA manifest and service worker are served cleanly', async () => {
  // Test manifest
  const manifestRes = await fetch(`${getOrigin()}/manifest.webmanifest`);
  assert.equal(manifestRes.status, 200);
  const manifest = await manifestRes.json();
  assert.equal(manifest.short_name, 'LanTURN');
  assert.ok(manifest.icons.length >= 2);
  assert.equal(manifest.display, 'standalone');

  // Test service worker script
  const swRes = await fetch(`${getOrigin()}/sw.js`);
  assert.equal(swRes.status, 200);
  const swText = await swRes.text();
  assert.ok(swText.includes('workbox') || swText.includes('precache') || swText.includes('caches.open'));
});

test('Demo seeder populates full-stack LanTURN 3.0 dataset', async () => {
  seedTaxonomy();
  seedAdmin();
  seedDemo();

  // Verify all 13 core tables are populated with realistic data
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
    postLikes: db.prepare('SELECT count(*) as c FROM post_likes').get().c,
    postComments: db.prepare('SELECT count(*) as c FROM post_comments').get().c,
    directMessages: db.prepare('SELECT count(*) as c FROM direct_messages').get().c,
    endorsements: db.prepare('SELECT count(*) as c FROM skill_endorsements').get().c,
  };

  assert.ok(counts.users >= 5, 'Should have demo users');
  assert.ok(counts.jobs >= 5, 'Should have demo jobs');
  assert.ok(counts.applications >= 3, 'Should have demo applications');
  assert.ok(counts.careerDna >= 2, 'Should have Career DNA archetypes');
  assert.ok(counts.skillMedals >= 4, 'Should have verified skill medals');
  assert.ok(counts.careerRoadmaps >= 3, 'Should have enrolled career roadmaps');
  assert.ok(counts.roadmapProgress >= 10, 'Should have tracked roadmap progress');
  assert.ok(counts.connections >= 3, 'Should have demo connections');
  assert.ok(counts.posts >= 3, 'Should have demo activity posts');
  assert.ok(counts.postLikes >= 4, 'Should have demo likes');
  assert.ok(counts.postComments >= 2, 'Should have demo comments');
  assert.ok(counts.directMessages >= 2, 'Should have direct message thread');
  assert.ok(counts.endorsements >= 3, 'Should have peer skill endorsements');
});

test('Multilingual i18n translation coverage across all supported languages', async () => {
  const languages = [
    { code: 'en', bundle: en },
    { code: 'hi', bundle: hi },
    { code: 'te', bundle: te },
  ];

  for (const { code, bundle } of languages) {
    assert.ok(bundle.nav, `Missing nav bundle in ${code}`);
    assert.ok(bundle.nav.dashboard, `Missing nav.dashboard in ${code}`);
    assert.ok(bundle.nav.jobs, `Missing nav.jobs in ${code}`);
    assert.ok(bundle.nav.networking, `Missing nav.networking in ${code}`);
    assert.ok(bundle.nav.careerAisle, `Missing nav.careerAisle in ${code}`);
    assert.ok(bundle.nav.aiAssistant, `Missing nav.aiAssistant in ${code}`);
    assert.ok(bundle.login.signIn, `Missing login.signIn in ${code}`);
  }
});
