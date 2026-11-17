import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, pdfForm } from './helpers.js';
import { extractProfile } from '../src/ai/profileExtract.js';
import { guideFor } from '../src/ai/prep.js';
import { __setJobsFetch, liveSources } from '../src/jobsExternal.js';

before(start);
after(stop);

test('extractProfile reads college, degree, branch and graduation year', () => {
  const p = extractProfile('Jane Roe\njane@x.com\nEducation\nB.Tech in Computer Science and Engineering, Example Institute of Technology, Hyderabad 2022 - 2026 (Expected)\nSkills\nPython');
  assert.equal(p.graduationYear, 2026);
  assert.match(p.degree, /B\.?Tech/i);
  assert.match(p.college, /Institute of Technology/);
});

test('guideFor returns curated links and a youtube search backup', () => {
  const g = guideFor('React');
  assert.ok(g.steps.length >= 3);
  const urls = g.steps.flatMap((s) => s.links.map((l) => l.url));
  assert.ok(urls.some((u) => u.includes('youtube.com')));
  assert.ok(urls.every((u) => u.startsWith('https://')));
});

test('resume upload auto-sets profile, skills and a roadmap', async () => {
  const s = await register('STUDENT');
  const empty = await api('GET', '/career/setup', { token: s.accessToken });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.setup, null);
  const up = await api('POST', '/resumes', { token: s.accessToken, form: pdfForm(undefined, { consent: 'true' }) });
  assert.equal(up.status, 201, up.text);
  assert.ok(up.body.setup, 'setup returned with upload');
  assert.ok(up.body.setup.skills.length > 3);
  assert.ok(up.body.setup.direction);
  const rm = await api('GET', '/career/roadmap', { token: s.accessToken });
  assert.equal(rm.status, 200);
  assert.ok(rm.body.stages.length >= 3);
  assert.ok(rm.body.stages[0].topics[0].guide.steps.length > 0);
  const t = rm.body.stages[0].topics.find((x) => !x.done);
  if (t) {
    const m = await api('POST', '/career/topic', { token: s.accessToken, body: { domain: rm.body.domain.id, stage: 0, topic: t.index, done: true } });
    assert.equal(m.status, 200);
    const again = await api('GET', '/career/roadmap', { token: s.accessToken });
    assert.equal(again.body.stages[0].topics[t.index].done, true);
  }
});

test('live jobs use the adapter when a key is set, else campus jobs', async () => {
  const s = await register('STUDENT');
  const off = await api('POST', '/jobs/external-search', { token: s.accessToken, body: { keywords: 'react' } });
  assert.equal(off.status, 200);
  assert.equal(off.body.source, 'campus');
  assert.ok(Array.isArray(liveSources()));
  __setJobsFetch(null);
});
