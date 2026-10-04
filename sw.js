/* RotaFlow Pro — service worker (app shell offline) */
const CACHE_NAME = 'rotaflow-shell-v90';
/* Shell gerado por `npm run build` (build/). Fontes/ícones são locais: o app abre offline sem CDN. */
const PRECACHE = [
  './',
  './index.html',
  './sw.js',
  './firebase-config.js',
  './build/app.css',
  './build/app.js',
  './build/fonts/inter-latin.woff2',
  './build/fonts/inter-latin-ext.woff2',
  './build/fonts/fa-solid-900.subset.woff2',
  './build/fonts/fa-brands-400.subset.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Página pública de rastreio: sempre rede (não misturar com o app do motorista)
  if (sameOrigin && (url.pathname.endsWith('/track.html') || url.pathname.startsWith('/r/'))) {
    event.respondWith(
      fetch(req).catch(() => caches.match('./track.html'))
    );
    return;
  }

  // App shell: network-first, fallback cache (sempre abre offline)
  if (sameOrigin && (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // CDN / APIs: cache-first quando possível; se falhar, tenta rede
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok && (sameOrigin || /gstatic|googleapis|firebase|gstatic\.com|cloudflare|jsdelivr|unpkg/.test(url.hostname))) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
