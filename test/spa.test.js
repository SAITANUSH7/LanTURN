import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, getOrigin } from './helpers.js';

before(start);
after(stop);

test('SPA serves built React frontend for /', async () => {
  const res = await fetch(`${getOrigin()}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('<div id="root">'), 'Should contain React root mount element');
  assert.ok(html.includes('LanTURN'), 'Should contain LanTURN title/brand in head or manifest');
});

test('SPA fallback routes client-side paths to index.html', async () => {
  const res = await fetch(`${getOrigin()}/networking`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('<div id="root">'), 'Client route /networking should fall back to SPA index.html');
});

test('API routes are preserved and not intercepted by SPA fallback', async () => {
  const health = await api('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  const unknownApi = await api('GET', '/unknown-route');
  assert.equal(unknownApi.status, 404);
  assert.equal(unknownApi.body?.error?.code, 'NOT_FOUND');
});
