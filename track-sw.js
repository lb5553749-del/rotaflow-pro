/* Service worker do rastreio — push + aviso persistente em segundo plano (v-live) */
const TRACK_ICON = '/track-icon-192.png';
const TRACK_BADGE = '/track-badge-96.png';
const TRACK_BANNER = '/track-notify-banner.png';
const TRACK_SOUND = '/track-notify.wav?v=campainha';
const PROJECT_ID = 'rotaflow-83610';
const API_KEY = 'AIzaSyBBOgiKX7-uYxwNuTxgExcbdkl2wNGWKbk';
const WATCH_CACHE = 'rf-track-watch';
const WATCH_URL = '/rf-watch-token';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openTrackUrl(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url && client.url.includes('/r/') && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  });
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDistance(km) {
  if (km == null || !isFinite(km)) return null;
  if (km < 1) return 'cerca de ' + Math.max(10, Math.round(km * 1000)) + ' m';
  return 'cerca de ' + km.toFixed(1).replace('.', ',') + ' km';
}

function liveCopy(data) {
  const dest = data && typeof data.destLat === 'number' ? { lat: data.destLat, lng: data.destLng } : null;
  const driver = data && typeof data.driverLat === 'number' ? { lat: data.driverLat, lng: data.driverLng } : null;
  const dist = dest && driver ? formatDistance(haversineKm(driver, dest)) : null;
  const status = data && data.status;
  if (status === 'entregue') {
    return { title: 'Sua encomenda foi entregue', body: 'O motorista confirmou a entrega.', kind: 'delivered' };
  }
  if (status === 'falhou' && data.failReason === 'ausente') {
    return { title: 'Cliente ausente', body: 'O motorista passou e não havia ninguém para receber.', kind: 'absent' };
  }
  if (status === 'falhou' || status === 'encerrado') {
    return { title: 'Rastreio encerrado', body: 'Esta entrega não está mais a caminho.', kind: 'done' };
  }
  if (dist) {
    return { title: 'Sua entrega a caminho', body: 'O motorista está a ' + dist + '.', kind: 'live' };
  }
  return { title: 'Rastreio ativo', body: 'Aguardando a localização do motorista.', kind: 'live' };
}

function showTrackNotification(data) {
  const url = data.url || '/';
  const kind = data.kind || (/delivered|absent/.test(String(data.tag || '')) ? 'alert' : 'live');
  const alert = kind === 'near' || kind === 'delivered' || kind === 'absent' || kind === 'alert';
  return self.registration.showNotification(data.title || 'Rastreio RotaFlow', {
    body: data.body || 'Acompanhe sua entrega.',
    tag: data.tag || 'rf-live',
    icon: data.icon || TRACK_ICON,
    badge: data.badge || TRACK_BADGE,
    image: alert ? (data.image || TRACK_BANNER) : undefined,
    silent: !alert,
    renotify: true,
    requireInteraction: alert,
    timestamp: Date.now(),
    vibrate: alert ? [220, 80, 220, 80, 360] : undefined,
    sound: alert ? (data.sound || TRACK_SOUND) : undefined,
    data: { url, kind },
    actions: [
      { action: 'open', title: data.actionTitle || (alert ? 'Abrir' : 'Ver no mapa') }
    ]
  });
}

async function hasVisibleClient() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return list.some((client) => client.visibilityState === 'visible');
}

async function rememberToken(token) {
  if (!token) return;
  const cache = await caches.open(WATCH_CACHE);
  await cache.put(WATCH_URL, new Response(token));
}

async function rememberedToken() {
  try {
    const cache = await caches.open(WATCH_CACHE);
    const res = await cache.match(WATCH_URL);
    return res ? (await res.text()).trim() : '';
  } catch (e) {
    return '';
  }
}

function numField(fields, name) {
  const node = fields && fields[name];
  if (!node) return null;
  if (node.doubleValue != null) return Number(node.doubleValue);
  if (node.integerValue != null) return Number(node.integerValue);
  return null;
}

function strField(fields, name) {
  const node = fields && fields[name];
  return node && node.stringValue != null ? String(node.stringValue) : '';
}

async function fetchTrack(token) {
  if (!token) return null;
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID
    + '/databases/(default)/documents/tracks/' + token + '?key=' + API_KEY;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  const fields = json.fields || {};
  return {
    destLat: numField(fields, 'destLat'),
    destLng: numField(fields, 'destLng'),
    driverLat: numField(fields, 'driverLat'),
    driverLng: numField(fields, 'driverLng'),
    status: strField(fields, 'status'),
    failReason: strField(fields, 'failReason'),
    sequentialId: strField(fields, 'sequentialId')
  };
}

async function pinLive(token, data) {
  const copy = liveCopy(data || {});
  const host = self.location.origin;
  return showTrackNotification({
    title: copy.title,
    body: copy.body,
    kind: copy.kind,
    tag: (copy.kind === 'delivered' ? 'rf-delivered-' : copy.kind === 'absent' ? 'rf-absent-' : 'rf-live-') + token,
    url: host + '/r/' + token,
    actionTitle: copy.kind === 'live' ? 'Ver no mapa' : 'Abrir'
  });
}

async function refreshLive(token) {
  const id = token || await rememberedToken();
  if (!id) return;
  const data = await fetchTrack(id);
  if (!data) return;
  await pinLive(id, data);
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {
      title: 'Sua entrega está chegando',
      body: 'O motorista está a cerca de 100 m.',
      tag: 'rf-near',
      kind: 'near',
      url: '/'
    };
    try {
      if (event.data) data = Object.assign(data, event.data.json());
    } catch (e) {}
    if (data.url && /\/r\/([a-f0-9]{32})/i.test(data.url)) {
      await rememberToken(RegExp.$1.toLowerCase());
    }
    const kind = data.kind || (/near/.test(String(data.tag || '')) ? 'near'
      : /delivered/.test(String(data.tag || '')) ? 'delivered'
      : /absent/.test(String(data.tag || '')) ? 'absent'
      : 'live');
    data.kind = kind;
    if (kind === 'live' && await hasVisibleClient()) return;
    await showTrackNotification(data);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(openTrackUrl(url));
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  event.waitUntil((async () => {
    if (msg.token) await rememberToken(msg.token);
    if (msg.type === 'pin-live' && msg.token) {
      await pinLive(msg.token, msg.data || {});
      return;
    }
    if (msg.type === 'refresh-live') {
      await refreshLive(msg.token);
    }
  })());
});

self.addEventListener('periodicsync', (event) => {
  if (String(event.tag || '').indexOf('rf-track') === 0) {
    event.waitUntil(refreshLive());
  }
});
