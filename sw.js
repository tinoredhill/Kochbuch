'use strict';
const C = 'kochbuch-v3';
const F = ['./', 'index.html', 'style.css', 'store.js', 'icons.js', 'app.js', 'fonts/cormorant-garamond-latin-500-normal.woff2', 'fonts/cormorant-garamond-latin-600-normal.woff2', 'manifest.webmanifest', 'rezepte/rezepte.json',
  'icons/app-icon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' }))))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (/\/rezepte\/[^/]+\.json$/.test(new URL(req.url).pathname)) {
    // Rezepte: zuerst Netz (damit neue Rezepte ankommen), sonst Zwischenspeicher
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(req, cl)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // App-Dateien: sofort aus dem Zwischenspeicher, im Hintergrund auffrischen
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(req, cl)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
