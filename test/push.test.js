import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { start, stop, api, register } from './helpers.js';
import { __setPushSender } from '../src/push.js';
import { notify } from '../src/notify.js';
import { drain } from '../src/queue.js';
import { db } from '../src/db.js';

before(start);
after(async () => { __setPushSender(null); delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; await stop(); });

const sub = (n = 1) => ({ endpoint: `https://push.example.test/send/${n}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: 'BP'.padEnd(87, 'x'), auth: 'a'.repeat(22) } });

test('push is off and refuses subscriptions until VAPID keys are configured', async () => {
  const st = await register('STUDENT');
  const k = (await api('GET', '/push/key', { token: st.accessToken })).body;
  assert.equal(k.enabled, false);
  assert.equal((await api('POST', '/push/subscribe', { token: st.accessToken, body: sub() })).status, 400);
  assert.equal((await api('GET', '/push/key')).status, 401);
});

test('subscribe validates input, is per user, and unsubscribe removes the device', async () => {
  const keys = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  const st = await register('STUDENT'); const other = await register('STUDENT');
  const k = (await api('GET', '/push/key', { token: st.accessToken })).body;
  assert.equal(k.enabled, true); assert.equal(k.publicKey, keys.publicKey); assert.equal(k.subscribed, false);
  assert.equal((await api('POST', '/push/subscribe', { token: st.accessToken, body: { endpoint: 'http://insecure.test/x', keys: sub().keys } })).status, 400);
  assert.equal((await api('POST', '/push/subscribe', { token: st.accessToken, body: { endpoint: sub().endpoint, keys: { p256dh: 'x', auth: 'y' } } })).status, 400);
  const s = sub();
  assert.equal((await api('POST', '/push/subscribe', { token: st.accessToken, body: s })).status, 201);
  assert.equal((await api('GET', '/push/key', { token: st.accessToken })).body.subscribed, true);
  // someone else cannot remove it
  await api('POST', '/push/unsubscribe', { token: other.accessToken, body: { endpoint: s.endpoint } });
  assert.equal((await api('GET', '/push/key', { token: st.accessToken })).body.subscribed, true);
  assert.equal((await api('POST', '/push/unsubscribe', { token: st.accessToken, body: { endpoint: s.endpoint } })).body.subscribed, false);
  // device limit
  for (let i = 0; i < 10; i++) assert.equal((await api('POST', '/push/subscribe', { token: st.accessToken, body: sub(i) })).status, 201);
  assert.equal((await api('POST', '/push/subscribe', { token: st.accessToken, body: sub(99) })).status, 400);
});

test('notify sends a push for the right types only, drops dead subscriptions, retries transient errors', async () => {
  const keys = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  const st = await register('STUDENT');
  const live = sub(1); const dead = sub(2);
  await api('POST', '/push/subscribe', { token: st.accessToken, body: live });
  await api('POST', '/push/subscribe', { token: st.accessToken, body: dead });
  const sent = [];
  __setPushSender(async (s, payload, opts) => {
    if (s.endpoint === dead.endpoint) { const e = new Error('gone'); e.statusCode = 410; throw e; }
    sent.push({ s, payload: JSON.parse(payload), opts });
  });
  notify(st.user.id, 'message_received', 'New message', 'Can you start in January?', '#/student/applications');
  notify(st.user.id, 'direct_message', 'chat noise', 'x', '');
  notify(st.user.id, 'job_match', 'strong match', 'x', '');
  await drain();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].payload, { title: 'New message', body: 'Can you start in January?', link: '#/student/applications' });
  assert.equal(sent[0].opts.vapidDetails.publicKey, keys.publicKey);
  const left = db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ?').all(st.user.id).map((r) => r.endpoint);
  assert.deepEqual(left, [live.endpoint]);
  // a transient failure is retried by the queue rather than dropping the subscription
  let calls = 0; __setPushSender(async () => { calls++; throw Object.assign(new Error('busy'), { statusCode: 503 }); });
  notify(st.user.id, 'application_status', 'Shortlisted', 'x', '');
  await drain();
  assert.ok(calls >= 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?').get(st.user.id).n, 1);
});

test('team members get their own pushes when the owner is notified', async () => {
  const keys = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  const owner = await register('EMPLOYER');
  const inv = await api('POST', '/employer/team/invites', { token: owner.accessToken, body: { email: `pm${Date.now()}@example.test` } });
  const join = await api('POST', '/auth/join', { body: { token: new URL(inv.body.link).hash.split('token=')[1], password: 'Str0ng!Passw0rd#1', name: 'PM' } });
  assert.equal(join.status, 201);
  await api('POST', '/push/subscribe', { token: join.body.accessToken, body: sub(7) });
  const sent = []; __setPushSender(async (s, p) => { sent.push(JSON.parse(p)); });
  notify(owner.user.id, 'application_received', 'New applicant', 'Asha applied', '#/employer');
  await drain();
  assert.equal(sent.length, 1);
});
