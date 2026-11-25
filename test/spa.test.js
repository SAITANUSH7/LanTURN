import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, getOrigin } from './helpers.js';
import http from 'node:http';
import { config } from '../src/config.js';
const skip = !config.useReact && 'set USE_REACT=1 and build frontend/ to test the React UI';

before(start);
after(stop);

test('default UI is the vanilla app', async () => {
  const html = await (await fetch(`${getOrigin()}/`)).text();
  assert.ok(config.useReact || html.includes('/js/main.js'));
});

test('SPA serves built React frontend for /', { skip }, async () => {
  const res = await fetch(`${getOrigin()}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('<div id="root">'), 'Should contain React root mount element');
  assert.ok(html.includes('LanTURN'), 'Should contain LanTURN title/brand in head or manifest');
});

test('SPA fallback routes client-side paths to index.html', { skip }, async () => {
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

// A deploy that nobody can see is a broken deploy. These assets have no hash in their filenames, so they must be
// revalidated on every load; this was found the hard way, when the redesign shipped and reviewers kept seeing the
// previous stylesheet out of their browser cache.
test('stylesheets and scripts are revalidated, never served from a long-lived cache', async () => {
  for (const path of ['/css/lanturn.css', '/js/main.js', '/js/polish.js']) {
    const res = await fetch(getOrigin() + path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('cache-control'), 'max-age=0, must-revalidate', `${path} must revalidate`);
    assert.ok(res.headers.get('etag'), `${path} needs an ETag so revalidation is a cheap 304`);
  }
});

test('revalidation is answered with 304 when nothing changed', async () => {
  // Raw http, not fetch: undici (Node's fetch) does not surface 304s for conditional GETs the way a browser does.
  const head = (headers = {}) => new Promise((resolve, reject) => {
    http.get(`${getOrigin()}/css/lanturn.css`, { headers }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, etag: res.headers.etag });
    }).on('error', reject);
  });
  const first = await head();
  assert.equal(first.status, 200);
  const again = await head({ 'If-None-Match': first.etag });
  assert.equal(again.status, 304, 'a repeat visit costs no body');
});

test('the shipped stylesheet is the current design, not an older layer', async () => {
  const css = await (await fetch(`${getOrigin()}/css/lanturn.css`)).text();
  for (const marker of ['prism-breathe', '.lp-window', "data-theme='light'", '.chart__col']) {
    assert.ok(css.includes(marker), `stylesheet is missing ${marker}`);
  }
});

test('health reports which build is answering, so a stale deploy is visible in one request', async () => {
  const health = await (await fetch(`${getOrigin()}/api/health`)).json();
  assert.equal(health.status, 'ok');
  assert.match(health.build, /^(dev|[0-9a-f]{7})$/);
});
