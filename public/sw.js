// App-shell cache. API calls are never cached (they carry personal data); offline shows the cached shell.
const V = 'lanturn-v12';
const SHELL = ['/', '/index.html', '/css/lanturn.css', '/js/fx.js', '/js/main.js', '/js/api.js', '/js/ui.js', '/js/i18n.js', '/js/charts.js', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html'))));
});

// Web Push: show the alert, then open the linked page when it is tapped.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || 'LanTURN', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { link: typeof d.link === 'string' ? d.link : '' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || '';
  const url = '/' + (/^#\//.test(link) ? link : '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((w) => new URL(w.url).origin === location.origin);
    if (c) { c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  }));
});
