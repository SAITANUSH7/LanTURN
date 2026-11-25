/**
 * Regression tests for the security and data-integrity fixes. Every test here failed (or could not be written at all)
 * before the fix it names, which is the point: these are the behaviours a reviewer could not trust from reading the
 * old code alone.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin, pdfForm, RESUME_LINES } from './helpers.js';

before(start);
after(stop);

const admin = () => login('admin@test.local', 'Admin@12345');

test('a disabled account is locked out immediately, and an admin can hand the keys back', async () => {
  const s = await register('STUDENT');
  const a = await admin();

  assert.equal((await api('GET', '/me', { token: s.accessToken })).status, 200);
  assert.equal((await api('PATCH', `/admin/users/${s.user.id}/status`, { token: a, body: { status: 'disabled' } })).status, 200);
  assert.equal((await api('GET', '/me', { token: s.accessToken })).status, 401, 'existing token must stop working');
  assert.equal((await api('GET', '/jobs', { token: s.accessToken })).status, 401, 'every route must reject it');
  const denied = await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } });
  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, 'INVALID_CREDENTIALS', 'no free account-existence check');
  assert.equal(denied.body.accessToken, undefined);

  assert.equal((await api('PATCH', `/admin/users/${s.user.id}/status`, { token: a, body: { status: 'active' } })).status, 200);
  const back = await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } });
  assert.equal(back.status, 200);
});

test('five bad passwords lock the account, and the lock is scoped so it cannot be used to freeze someone out forever', async () => {
  const s = await register('STUDENT');
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/auth/login', { body: { email: s.email, password: 'wrong-password' } });
    assert.equal(r.status, 401);
  }
  const locked = await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } });
  assert.equal(locked.status, 429);
  assert.ok(locked.body.error.details.retryAfterSec > 0);

  // An admin unlock clears the counter, so a targeting attack cannot deny the real owner for 15 minutes at a time.
  const a = await admin();
  assert.equal((await api('POST', `/admin/users/${s.user.id}/unlock`, { token: a })).status, 200);
  const ok = await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } });
  assert.equal(ok.status, 200);
});

test('forgot/reset password never leaks whether an email exists, and ends old sessions', async () => {
  const s = await register('STUDENT');
  const unknown = await api('POST', '/auth/forgot-password', { body: { email: 'nobody@example.test' } });
  const known = await api('POST', '/auth/forgot-password', { body: { email: s.email } });
  assert.equal(unknown.status, 200);
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body, 'byte-for-byte the same answer either way');

  assert.equal((await api('GET', '/me', { token: s.accessToken })).status, 200, 'old session alive until the reset');
  // The link is delivered by email (or the server log), so mint the same token the route would have sent.
  const { createPasswordReset } = await import('../src/auth.js');
  const { token } = createPasswordReset(s.user.id);
  const reset = await api('POST', '/auth/reset-password', { body: { token, password: 'Brand-New-Passw0rd' } });
  assert.equal(reset.status, 200, reset.text);
  // The old password and every old access token are dead.
  assert.equal((await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } })).status, 401);
  assert.equal((await api('GET', '/me', { token: s.accessToken })).status, 401);
  assert.equal((await api('POST', '/auth/login', { body: { email: s.email, password: 'Brand-New-Passw0rd' } })).status, 200);
  // A reset token is single-use.
  assert.equal((await api('POST', '/auth/reset-password', { body: { token, password: 'Another-Passw0rd' } })).status, 400);
});

test('role changes leave a usable account: profiles exist, tokens rotate, employers start pending', async () => {
  const a = await admin();
  const s = await register('STUDENT');
  const r = await api('PATCH', `/admin/users/${s.user.id}/role`, { token: a, body: { role: 'EMPLOYER' } });
  assert.equal(r.status, 200, r.text);
  // The old access token belongs to a STUDENT: it must not carry the new role.
  assert.equal((await api('GET', '/me', { token: s.accessToken })).status, 401);

  const fresh = await login(s.email, 'Passw0rd!x');
  const me = await api('GET', '/me', { token: fresh });
  assert.equal(me.body.user.role, 'EMPLOYER');
  // No dangling foreign key: the company endpoint is readable instead of exploding with a 500.
  const company = await api('GET', '/employers/me/company', { token: fresh });
  assert.equal(company.status, 200, company.text);
  // And an ex-student cannot advertise jobs until an admin verifies them.
  const job = await api('POST', '/employer/jobs', {
    token: fresh,
    body: { title: 'Backend Intern', description: 'Build things with Node.js and SQL for a semester.', type: 'INTERNSHIP', location: 'Hyderabad', remote: false, compensation: '20k/mo', skills: [] },
  });
  assert.ok([403, 400].includes(job.status), `expected a refusal, got ${job.status}`);
});

test('feed, connections and messages never expose an email address', async () => {
  const a = await register('STUDENT', { fullName: 'Ada Lovelace' });
  const b = await register('STUDENT', { fullName: 'Grace Hopper' });
  const post = await api('POST', '/networking/posts', { token: a.accessToken, body: { content: 'Looking for a study group for DBMS on Saturday mornings.' } });
  assert.equal(post.status, 201, post.text);
  const feed = await api('GET', '/networking/feed', { token: b.accessToken });
  assert.equal(feed.status, 200);
  assert.ok(!feed.text.includes(a.email), 'feed must not contain an email address');
  assert.ok(!feed.text.includes(b.email));

  const conn = await api('POST', `/networking/connect/${a.user.id}`, { token: b.accessToken, body: {} });
  assert.ok([200, 201, 204].includes(conn.status), conn.text);
  const list = await api('GET', '/networking/connections', { token: b.accessToken });
  assert.equal(list.status, 200);
  assert.ok(!list.text.includes(a.email));

  const dm = await api('POST', `/messages/${a.user.id}`, { token: b.accessToken, body: { content: 'Saturday works for me — shall we say the library?' } });
  assert.ok([200, 201].includes(dm.status), dm.text);
  const thread = await api('GET', `/messages/${a.user.id}`, { token: b.accessToken });
  assert.ok(!thread.text.includes(a.email));
});

test('a message to someone who does not exist is a 404, not a database error', async () => {
  const s = await register('STUDENT');
  const r = await api('POST', '/messages/999999', { token: s.accessToken, body: { content: 'hello?' } });
  assert.equal(r.status, 404);
  const self = await api('POST', `/messages/${s.user.id}`, { token: s.accessToken, body: { content: 'hello?' } });
  assert.equal(self.status, 400);
});

test('uploaded files belong to someone: certificates are private, avatars are not', async () => {
  const owner = await register('STUDENT');
  const other = await register('STUDENT');

  const signed = await api('POST', '/uploads/sign', { token: owner.accessToken, body: { kind: 'certificate', mimeType: 'image/png', sizeBytes: 68 } });
  assert.equal(signed.status, 200, signed.text);
  const key = signed.body.objectPath;

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f6a0000000049454e44ae426082', 'hex');
  const put = await fetch(`${getOrigin()}${signed.body.uploadUrl}`, { method: 'PUT', headers: { Authorization: `Bearer ${owner.accessToken}`, 'Content-Type': 'application/octet-stream' }, body: png });
  assert.equal(put.status, 200);

  // A different signed-in user cannot claim someone else's bytes.
  const steal = await api('POST', '/uploads/commit', { token: other.accessToken, body: { kind: 'certificate', objectPath: key } });
  assert.equal(steal.status, 404);
  // Nor can they read the file directly: no session-free access to a certificate.
  assert.equal((await fetch(`${getOrigin()}/api/uploads/file/${key}`)).status, 404);
  assert.equal((await fetch(`${getOrigin()}/api/uploads/file/${key}`, { headers: { Authorization: `Bearer ${other.accessToken}` } })).status, 404);
  // The owner can, and gets a signed link that works without a header (for <img> and downloads).
  const own = await api('POST', '/uploads/commit', { token: owner.accessToken, body: { kind: 'certificate', objectPath: key } });
  assert.equal(own.status, 200, own.text);
  assert.match(own.body.url, /\?e=\d+&t=/);
  const viaSigned = await fetch(`${getOrigin()}${own.body.url}`);
  assert.equal(viaSigned.status, 200);
  assert.equal(viaSigned.headers.get('x-content-type-options'), 'nosniff');
  // A tampered signature is refused.
  assert.notEqual((await fetch(`${getOrigin()}${own.body.url.replace(/t=./, 't=A')}`)).status, 200);
});

test('a resume cannot be uploaded on someone else\'s behalf, and deleting it removes the bytes', async () => {
  const s = await register('STUDENT');
  const a = await admin();
  const asAdmin = await api('POST', '/uploads/sign', { token: a, body: { kind: 'resume', mimeType: 'application/pdf', sizeBytes: 1000 } });
  assert.equal(asAdmin.status, 403);

  const up = await api('POST', '/resumes', { token: s.accessToken, form: pdfForm(RESUME_LINES, { consent: 'true' }) });
  assert.equal(up.status, 201, up.text);
  assert.equal((await api('GET', `/resumes/${up.body.id}/file`, { token: s.accessToken })).status, 200);
  assert.equal((await api('DELETE', `/resumes/${up.body.id}`, { token: s.accessToken })).status, 200);
  assert.equal((await api('GET', `/resumes/${up.body.id}/file`, { token: s.accessToken })).status, 404);
});

test('exports and self-deletion work for any signed-in account', async () => {
  const s = await register('STUDENT', { fullName: 'Export Me' });
  const exp = await api('GET', '/me/export', { token: s.accessToken });
  assert.equal(exp.status, 200);
  assert.equal(exp.body.account.email, s.email);
  assert.ok(Array.isArray(exp.body.resumes));

  const wrong = await api('DELETE', '/me', { token: s.accessToken, body: { password: 'nope', confirm: 'DELETE' } });
  assert.equal(wrong.status, 401);
  const ok = await api('DELETE', '/me', { token: s.accessToken, body: { password: 'Passw0rd!x', confirm: 'DELETE' } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } })).status, 401);
});

test('placement drives have a lifecycle, a registrant list, and refuse a past date', async () => {
  const emp = await register('EMPLOYER', { companyName: 'Lifecycle Labs' });
  const a = await admin();
  await api('PATCH', `/admin/users/${emp.user.id}/status`, { token: a, body: { status: 'active' } });
  await api('PATCH', `/admin/users/${emp.user.id}/verify`, { token: a, body: { status: 'verified' } });
  const e = await login(emp.email, 'Passw0rd!x');

  const past = await api('POST', '/drives', {
    token: e,
    body: { companyName: 'Lifecycle Labs', title: 'Fresher hiring 2020', description: 'A past drive used to be registrable.', driveDate: '2020-03-01', venue: 'Main auditorium', eligibility: 'CSE 2020', packageDetails: '6 LPA' },
  });
  assert.equal(past.status, 201, past.text);

  const s = await register('STUDENT');
  const reg = await api('POST', `/drives/${past.body.id}/register`, { token: s.accessToken, body: {} });
  assert.equal(reg.status, 400);

  const live = await api('POST', '/drives', {
    token: e,
    body: { companyName: 'Lifecycle Labs', title: 'Summer internship drive', description: 'Two rounds plus an HR conversation.', driveDate: '2099-06-15', venue: 'Block C', eligibility: 'All branches', packageDetails: '35k/mo' },
  });
  assert.equal(live.status, 201, live.text);
  assert.equal((await api('POST', `/drives/${live.body.id}/register`, { token: s.accessToken, body: {} })).status, 201);

  const list = await api('GET', `/drives/${live.body.id}/registrations`, { token: e });
  assert.equal(list.status, 200, list.text);
  assert.equal(list.body.counts.REGISTERED, 1);
  const regId = list.body.items[0].id;
  assert.equal((await api('PATCH', `/drives/${live.body.id}/registrations/${regId}`, { token: e, body: { status: 'SHORTLISTED' } })).status, 200);

  // Status only moves forward along the real flow.
  assert.equal((await api('PATCH', `/drives/${live.body.id}`, { token: e, body: { status: 'COMPLETED' } })).status, 409);
  assert.equal((await api('PATCH', `/drives/${live.body.id}`, { token: e, body: { status: 'ONGOING' } })).status, 200);
  assert.equal((await api('PATCH', `/drives/${live.body.id}`, { token: e, body: { status: 'COMPLETED' } })).status, 200);
  assert.equal((await api('POST', `/drives/${live.body.id}/register`, { token: (await register('STUDENT')).accessToken, body: {} })).status, 400);

  // Another student cannot read the registrant list.
  assert.equal((await api('GET', `/drives/${live.body.id}/registrations`, { token: s.accessToken })).status, 403);
});
