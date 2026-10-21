/* RotaFlow Pro — service worker (app shell offline) */
const CACHE_NAME = 'rotaflow-shell-v91.935c984e66';
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
  './build/chunks/app.js',
  './build/fonts/fa-solid-900.subset.woff2',
  './build/fonts/fa-brands-400.subset.woff2'
];

/* JS do app que vai para o precache (além do PRECACHE acima): o grafo de boot inteiro +
   as telas que o motorista usa sem rede (backup, histórico, edição, perfil, sugestões,
   agenda). Preenchido por `npm run build` a partir do metafile do esbuild
   (lib/sw-manifest.js) — não editar à mão.
   Sem a parte do boot, "instalar e abrir offline" quebrava no próprio boot; sem as telas,
   o primeiro uso na rua falhava no import(). Plugins nativos ficam de fora de propósito. */
const PRECACHE_JS = [
  './build/chunks/agenda-route-CV2PDAIO.js',
  './build/chunks/app.js',
  './build/chunks/backup-ui-SP3SB7LU.js',
  './build/chunks/chunk-2DJRFQWG.js',
  './build/chunks/chunk-2ZLV5RPF.js',
  './build/chunks/chunk-32BRZWF4.js',
  './build/chunks/chunk-4VEU6F5P.js',
  './build/chunks/chunk-5H3YXSQH.js',
  './build/chunks/chunk-5O6JUYTR.js',
  './build/chunks/chunk-AM7GZWVJ.js',
  './build/chunks/chunk-B2WXWQPA.js',
  './build/chunks/chunk-BT54XGX5.js',
  './build/chunks/chunk-DIKJWGPI.js',
  './build/chunks/chunk-FKTRBSTE.js',
  './build/chunks/chunk-FVHPOIYF.js',
  './build/chunks/chunk-GK6NHKGD.js',
  './build/chunks/chunk-GVM2HX4K.js',
  './build/chunks/chunk-HIHKWFG7.js',
  './build/chunks/chunk-KJRLPQGI.js',
  './build/chunks/chunk-L243JO4Y.js',
  './build/chunks/chunk-MRZ7II3V.js',
  './build/chunks/chunk-QXBMFZ2D.js',
  './build/chunks/chunk-TKPLL3WH.js',
  './build/chunks/chunk-VKXBX6VR.js',
  './build/chunks/chunk-XOUKIOFE.js',
  './build/chunks/chunk-YWSOG3PW.js',
  './build/chunks/edit-modals-HQGOK2AI.js',
  './build/chunks/filters-ui-KZARUUC2.js',
  './build/chunks/history-GBCJKUO2.js',
  './build/chunks/name-suggestions-NRA3RCBS.js',
  './build/chunks/profile-VSHMOLSY.js'
];

// TTL dos caches em milissegundos
const CACHE_TTL = {
  runtime: 24 * 60 * 60 * 1000, // 24 horas
  images: 7 * 24 * 60 * 60 * 1000, // 7 dias
  api: 5 * 60 * 1000 // 5 minutos
};

/**
 * Precacha o JS do app tolerando falha individual: um add() que falha não pode
 * derrubar o install (o `cache.addAll` do PRECACHE é atômico de propósito; estes não).
 */
function precacheJs(cache) {
  return Promise.allSettled(
    PRECACHE_JS.map((url) =>
      cache.match(url).then((ja) => ja || cache.add(url))
    )
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).then(() => precacheJs(cache)))
      .then(() => self.skipWaiting())
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
