import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, getOrigin } from './helpers.js';
import { passwordProblem } from '../src/security.js';

before(start);
after(stop);

test('weak passwords are rejected, strong ones accepted', async () => {
  assert.ok(passwordProblem('12345678'));
  assert.ok(passwordProblem('onlyletters'));
  assert.equal(passwordProblem('Passw0rd!x'), null);
  const r = await api('POST', '/auth/register', { body: { email: `weak${Date.now()}@example.test`, password: 'abcdefgh', role: 'STUDENT', fullName: 'W' } });
  assert.equal(r.status, 400);
});

test('account locks after repeated wrong passwords, even with the right one afterwards', async () => {
  const s = await register('STUDENT');
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/auth/login', { body: { email: s.email, password: 'Wrong-pass1' } });
    assert.equal(r.status, 401);
  }
  const locked = await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
});

test('successful login clears the failure counter', async () => {
  const s = await register('STUDENT');
  for (let i = 0; i < 3; i++) await api('POST', '/auth/login', { body: { email: s.email, password: 'Wrong-pass1' } });
  assert.equal((await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } })).status, 200);
  for (let i = 0; i < 3; i++) await api('POST', '/auth/login', { body: { email: s.email, password: 'Wrong-pass1' } });
  assert.equal((await api('POST', '/auth/login', { body: { email: s.email, password: 'Passw0rd!x' } })).status, 200);
});

test('cross-origin POST to auth endpoints is refused', async () => {
  const r = await fetch(`${getOrigin()}/api/auth/logout`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  const ok = await fetch(`${getOrigin()}/api/auth/logout`, { method: 'POST', headers: { Origin: getOrigin() } });
  assert.equal(ok.status, 200);
});

test('API responses are not cacheable and set hardening headers', async () => {
  const r = await fetch(`${getOrigin()}/api/health`);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('permissions-policy') || '', /camera=\(\)/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('every API route except the public allowlist requires a token', async () => {
  const PUBLIC = new Set(['GET /api/health', 'GET /api/platform/stats', 'GET /api/health/live', 'GET /api/health/ready', 'GET /api/email/unsubscribe', 'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/session', 'POST /api/auth/logout', 'POST /api/auth/refresh']);
  const { createApp } = await import('../src/app.js');
  const routes = [];
  const walk = (stack, prefix = '') => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) routes.push([m.toUpperCase(), prefix + l.route.path]);
      else if (l.name === 'router' && l.handle.stack) {
        const m = l.regexp.source.match(/^\^\\\/((?:[\w-]+(?:\\\/)?)*)/);
        walk(l.handle.stack, prefix + (m ? `/${m[1].replace(/\\\//g, '/')}` : ''));
      }
    }
  };
  walk(createApp()._router.stack);
  const open = [];
  for (const [m, p] of routes) {
    const path = p.replace(/\/+/g, '/').replace(/:\w+/g, '1');
    if (!path.startsWith('/api')) continue;
    if (PUBLIC.has(`${m} ${path}`)) continue;
    const r = await fetch(`${getOrigin()}${path}`, { method: m });
    if (![401, 404, 410].includes(r.status)) open.push(`${m} ${path} -> ${r.status}`);
  }
  assert.ok(routes.length > 50, `expected to enumerate routes, got ${routes.length}`);
  assert.deepEqual(open, []);
});
