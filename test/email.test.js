import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin } from './helpers.js';
import { __setEmailFetch, renderEmail, unsubToken, checkUnsubToken } from '../src/email.js';
import { notify } from '../src/notify.js';
import { drain } from '../src/queue.js';
import { __reset } from '../src/ai/breaker.js';
import { db } from '../src/db.js';

before(start);
after(async () => { __setEmailFetch(null); delete process.env.EMAIL_API_KEY; delete process.env.EMAIL_FROM; await stop(); });

test('email is off without configuration', async () => {
  const st = await register('STUDENT');
  let calls = 0; __setEmailFetch(async () => { calls++; return new Response('{}', { status: 200 }); });
  notify(st.user.id, 'application_status', 'Application shortlisted', 'x', '#/student/applications');
  await drain();
  assert.equal(calls, 0);
});

test('configured: status change sends one email through the queue, with escaping and unsubscribe', async () => {
  process.env.EMAIL_API_KEY = 're_test'; process.env.EMAIL_FROM = 'LanTURN <no-reply@example.com>'; process.env.PUBLIC_URL = 'https://app.example.com'; __reset();
  const st = await register('STUDENT');
  const sent = [];
  __setEmailFetch(async (url, init) => { sent.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); });
  notify(st.user.id, 'application_status', 'Moved to <b>Interview</b>', 'Acme moved you on.', '#/student/applications');
  notify(st.user.id, 'direct_message', 'Chat noise', 'hi', '');
  await drain();
  assert.equal(sent.length, 1, 'only the emailable type is sent');
  assert.equal(sent[0].auth, 'Bearer re_test');
  assert.deepEqual(sent[0].body.to, [st.user.email]);
  assert.ok(!sent[0].body.html.includes('<b>Interview'), 'html is escaped');
  assert.match(sent[0].body.text, /\/api\/email\/unsubscribe\?u=\d+&t=[0-9a-f]{32}/);
  assert.ok(sent[0].body.headers['List-Unsubscribe']);
});

test('opt-out via settings and via the unsubscribe link; bad token rejected', async () => {
  const st = await register('STUDENT');
  let n = 0; __setEmailFetch(async () => { n++; return new Response('{}', { status: 200 }); });
  assert.equal((await api('GET', '/email-prefs', { token: st.accessToken })).body.enabled, true);
  assert.equal((await api('PUT', '/email-prefs', { token: st.accessToken, body: { enabled: 'no' } })).status, 400);
  await api('PUT', '/email-prefs', { token: st.accessToken, body: { enabled: false } });
  notify(st.user.id, 'application_status', 'A', 'b', ''); await drain();
  assert.equal(n, 0);
  await api('PUT', '/email-prefs', { token: st.accessToken, body: { enabled: true } });
  assert.equal((await fetch(`${getOrigin()}/api/email/unsubscribe?u=${st.user.id}&t=deadbeef`)).status, 400);
  const ok = await fetch(`${getOrigin()}/api/email/unsubscribe?u=${st.user.id}&t=${unsubToken(st.user.id)}`);
  assert.equal(ok.status, 200);
  assert.equal((await api('GET', '/email-prefs', { token: st.accessToken })).body.enabled, false);
  assert.ok(!checkUnsubToken(st.user.id + 1, unsubToken(st.user.id)));
});

test('provider failure retries via the queue and is logged; job alerts are capped per day', async () => {
  const st = await register('STUDENT');
  __reset();
  let fail = true; let n = 0;
  __setEmailFetch(async () => { n++; return fail ? new Response('no', { status: 500 }) : new Response('{}', { status: 200 }); });
  notify(st.user.id, 'application_status', 'Retry me', 'b', '');
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM email_log WHERE user_id = ? AND status = 'failed'").get(st.user.id).n, 1);
  db.prepare("UPDATE tasks SET run_at = datetime('now','-1 minute') WHERE type = 'email.send' AND status = 'QUEUED'").run();
  fail = false; __reset(); await drain();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM email_log WHERE user_id = ? AND status = 'sent'").get(st.user.id).n, 1);
  n = 0;
  for (let i = 0; i < 5; i++) { notify(st.user.id, 'job_match', `Job ${i}`, 'b', `#/student/jobs/${i}`); await drain(); }
  assert.equal(n, 3, 'at most 3 job alert emails a day');
});
