/* RotaFlow Pro — service worker (app shell offline) */
const CACHE_NAME = 'rotaflow-shell-v90.fc06c08f0f';
const RUNTIME_CACHE = 'rotaflow-runtime-v1';
const IMAGE_CACHE = 'rotaflow-images-v1';
const API_CACHE = 'rotaflow-api-v1';

/* Shell gerado por `npm run build` (build/). Fontes/ícones são locais: o app abre offline sem CDN. */
const PRECACHE = [
  './',
  './index.html',
  './sw.js',
  './firebase-config.js',
  './build/app.css',
  './build/app.js',
  './build/fonts/fa-solid-900.subset.woff2',
  './build/fonts/fa-brands-400.subset.woff2'
];

// TTL dos caches em milissegundos
const CACHE_TTL = {
  runtime: 24 * 60 * 60 * 1000, // 24 horas
  images: 7 * 24 * 60 * 60 * 1000, // 7 dias
  api: 5 * 60 * 1000 // 5 minutos
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Remove caches antigos mas mantém os caches runtime/images/api atuais
      const validCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE, API_CACHE];
      return Promise.all(
        keys.filter((k) => !validCaches.includes(k)).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: verifica se cache está expirado
function isCacheExpired(response, ttl) {
  if (!response) return true;
  const cachedTime = response.headers.get('sw-cache-time');
  if (!cachedTime) return false; // Cache antigo sem timestamp, mantém
  return Date.now() - parseInt(cachedTime) > ttl;
}

// Helper: adiciona timestamp ao response
function addCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cache-time', Date.now().toString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

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

  // Imagens: cache-first com TTL longo
  if (req.destination === 'image' || /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(req).then(cached => {
          if (cached && !isCacheExpired(cached, CACHE_TTL.images)) {
            return cached;
          }
          return fetch(req).then(res => {
            if (res && res.ok) {
              cache.put(req, addCacheTimestamp(res.clone()));
            }
            return res;
          }).catch(() => cached || Promise.reject('offline'));
        })
      )
    );
    return;
  }

  // APIs Firebase/Firestore: network-first com cache curto
  if (/firestore|googleapis|firebase/.test(url.hostname)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            caches.open(API_CACHE).then(cache => {
              cache.put(req, addCacheTimestamp(res.clone()));
            });
          }
          return res;
        })
        .catch(() =>
          caches.open(API_CACHE).then(cache =>
            cache.match(req).then(cached => {
              if (cached && !isCacheExpired(cached, CACHE_TTL.api)) {
                return cached;
              }
              return Promise.reject('offline and cache expired');
            })
          )
        )
    );
    return;
  }

  // Fontes e assets estáticos: cache-first (longa duração)
  if (sameOrigin && /\.(woff2?|ttf|eot|css|js)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        return cached || fetch(req).then(res => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  // CDN externos: cache-first com runtime cache
  if (/gstatic|cloudflare|jsdelivr|unpkg/.test(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(cached => {
          if (cached && !isCacheExpired(cached, CACHE_TTL.runtime)) {
            return cached;
          }
          return fetch(req).then(res => {
            if (res && res.ok) {
              cache.put(req, addCacheTimestamp(res.clone()));
            }
            return res;
          }).catch(() => cached || Promise.reject('offline'));
        })
      )
    );
    return;
  }

  // Fallback: network-first
  event.respondWith(fetch(req));
});
