'use strict';
const C = 'kochbuch-v9';
const F = ['./', 'index.html', 'style.css', 'firebase-config.js', 'store.js', 'icons.js', 'vorrat-kern.js', 'vorrat.js', 'app.js', 'fonts/cormorant-garamond-latin-500-normal.woff2', 'fonts/cormorant-garamond-latin-600-normal.woff2', 'manifest.webmanifest', 'rezepte/rezepte.json',
  'icons/v7/apple-touch-icon-180.png', 'icons/v7/favicon-32.png', 'icons/v7/favicon-16.png', 'icons/v7/icon-192.png', 'icons/v7/icon-512.png', 'icons/v7/icon-maskable-512.png'];
// v9: Vorrat-Abteilungen, Menü-Fix; v8: Vorrat (vorrat.js, vorrat-kern.js); Strichcode-Erkennung (vendor/barcode, ~1 MB) wird erst beim ersten Scannen geladen und dann zwischengespeichert
// v7: neue Version übernimmt sofort (kein Warten auf «Aktualisieren»); die offene Seite lädt dann einmal neu (siehe app.js, controllerchange)
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (/\/rezepte\/[^/]+\.json$|\/firebase-config\.js$/.test(new URL(req.url).pathname)) {
    // Rezepte und Firebase-Konfiguration: zuerst Netz (damit Neues sofort ankommt), sonst Zwischenspeicher
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
