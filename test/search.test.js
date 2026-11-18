import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login } from './helpers.js';
import { searchAvailable, searchStatus, stopSearch } from '../src/searchEngine.js';

before(start);
after(async () => { stopSearch(); await stop(); });
const skip = searchAvailable() ? false : 'lanturn-search not built (node native/build.mjs)';

async function setup() {
  const admin = await login('admin@test.local', 'Admin@12345');
  const emp = await register('EMPLOYER');
  await api('POST', `/admin/employers/${emp.user.id}/approve`, { token: admin });
  const st = await register('STUDENT');
  const sk = (await api('GET', '/skills?q=Kotlin', { token: st.accessToken })).body;
  const skillId = (sk.items || sk)[0].id;
  const mk = (title, description, location = 'Hyderabad') => api('POST', '/employer/jobs', { token: emp.accessToken, body: { title, description, type: 'INTERNSHIP', location, remote: false, skills: [{ skillId, weight: 2 }] } });
  return { emp, st, mk };
}

test('ranked, prefix-matching job search from the native engine', { skip }, async () => {
  const { st, mk } = await setup();
  await mk('Zorblax Platform Engineer', 'Build zorblax services in Go.');
  await mk('Backend Developer', 'You will touch zorblax once in a while, mostly APIs and databases.');
  await mk('Zorblaxian Designer', 'Design things.', 'Pune');
  const r = await api('GET', '/jobs?q=zorblax', { token: st.accessToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.ranked, true, 'served by the native engine');
  assert.equal(r.body.total, 3);
  assert.equal(r.body.items[0].title, 'Zorblax Platform Engineer', 'title match ranks above a body mention');
  const pune = await api('GET', '/jobs?q=zorblax&location=pune', { token: st.accessToken });
  assert.deepEqual(pune.body.items.map((j) => j.title), ['Zorblaxian Designer']);
  assert.ok(searchStatus().queries >= 1);
});

test('new and closed jobs show up in search immediately (index follows the data version)', { skip }, async () => {
  const { emp, st, mk } = await setup();
  const j = await mk('Quuxnaut Wrangler', 'Wrangle quuxnauts.');
  assert.ok((await api('GET', '/jobs?q=quuxnaut', { token: st.accessToken })).body.items.some((x) => x.title === 'Quuxnaut Wrangler'));
  await api('POST', `/employer/jobs/${j.body.id}/close`, { token: emp.accessToken });
  assert.equal((await api('GET', '/jobs?q=quuxnaut', { token: st.accessToken })).body.items.length, 0);
});

test('queries the engine cannot match still find substrings via the SQL fallback', async () => {
  const { st, mk } = await setup();
  await mk('Supercalifragilistic Intern', 'Substring only.');
  const r = await api('GET', '/jobs?q=calif', { token: st.accessToken });
  assert.ok(r.body.items.some((x) => x.title === 'Supercalifragilistic Intern'));
});

test('engine survives being killed mid-run', { skip }, async () => {
  const { st, mk } = await setup();
  await mk('Phoenixword Role', 'Rises again from the ashes.');
  await api('GET', '/jobs?q=phoenixword', { token: st.accessToken });
  stopSearch();
  await new Promise((r) => setTimeout(r, 500));
  const again = await api('GET', '/jobs?q=phoenixword', { token: st.accessToken });
  assert.equal(again.status, 200);
  assert.ok(again.body.items.some((x) => x.title === 'Phoenixword Role'));
});
