// App-shell cache. API calls are never cached (they carry personal data); offline shows the cached shell.
const V = 'lanturn-v1';
const SHELL = ['/', '/index.html', '/css/tokens.css', '/css/base.css', '/css/components.css', '/css/app.css', '/js/main.js', '/js/api.js', '/js/ui.js', '/js/i18n.js', '/js/charts.js', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html'))));
});
