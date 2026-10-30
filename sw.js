// Ohne Netz: Dateien zwischenspeichern (die Daten liegen im Gerät, nicht hier)
const CACHE = 'c-3';
const FILES = ['./', 'index.html', 'core.js', 'list.js', 'manifest.webmanifest', 'icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// zuerst das Netz (neue Version), ohne Netz aus dem Zwischenspeicher
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
