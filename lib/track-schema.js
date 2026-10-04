'use strict';

/**
 * Single contract for Firestore tracks/{token}.
 * Shared by the driver app, track.html, track-sw.js and (as documentation)
 * firestore.rules isValidTrack() / affectedKeys().
 */

const TRACK_TOKEN_RE = /^[a-f0-9]{32}$/i;

const TRACK_STATUSES = Object.freeze(['active', 'entregue', 'falhou', 'encerrado']);

const TRACK_FAIL_REASONS = Object.freeze(['', 'ausente', 'endereco-errado', 'recusou']);

/** Fields allowed on create — keep in sync with firestore.rules isValidTrack(). */
const TRACK_FIELD_KEYS = Object.freeze([
  'destLat', 'destLng', 'destName', 'sequentialId', 'status',
  'motorista', 'driverLat', 'driverLng', 'accuracy',
  'updatedAt', 'nearNotified', 'deliveredNotified', 'absentNotified', 'failReason',
  'etaSeconds', 'stopsAhead'
]);

/** Fields allowed on update — keep in sync with firestore.rules affectedKeys(). */
const TRACK_UPDATE_KEYS = Object.freeze([
  'driverLat', 'driverLng', 'accuracy', 'updatedAt',
  'status', 'nearNotified', 'deliveredNotified', 'absentNotified',
  'failReason', 'destLat', 'destLng',
  'destName', 'motorista', 'sequentialId',
  'etaSeconds', 'stopsAhead'
]);

const TRACK_NEAR_METERS = 100;
const TRACK_NEAR_KM = TRACK_NEAR_METERS / 1000;
const TRACK_PUBLISH_MIN_MS = 4000;
const TRACK_PUBLISH_MIN_KM = 0.02;
const TRACK_ETA_MAX_SECONDS = 172800;

function isValidTrackToken(token) {
  return typeof token === 'string' && TRACK_TOKEN_RE.test(token.trim());
}

/** 16 bytes de entropia, hex minúsculo. O `crypto` entra por parâmetro para o teste não depender de aleatoriedade. */
function newTrackToken(cryptoImpl) {
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeTrackToken(token) {
  if (!isValidTrackToken(token)) return '';
  return String(token).trim().toLowerCase();
}

/** Read the 32-hex token from ?t= or /r/<token>. */
function readTrackTokenFromLocation(loc) {
  const search = (loc && loc.search) || '';
  const pathname = (loc && loc.pathname) || '';
  try {
    const q = new URLSearchParams(search).get('t');
    if (q && isValidTrackToken(q)) return normalizeTrackToken(q);
  } catch (_) {}
  const m = String(pathname).match(/\/r\/([a-f0-9]{32})/i);
  return m ? m[1].toLowerCase() : '';
}

function publicFirstName(name, fallback) {
  const n = String(name || '').trim().split(/\s+/)[0] || '';
  return (n || fallback || 'Cliente').slice(0, 60);
}

function trackStatusFor(delivery) {
  if (!delivery) return 'encerrado';
  if (delivery.status === 'entregue') return 'entregue';
  if (delivery.status === 'falhou') return 'falhou';
  if (delivery.status === 'pendente' || delivery.status === 'em-rota') return 'active';
  return 'encerrado';
}

function stripTrackEtaFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload };
  delete next.etaSeconds;
  delete next.stopsAhead;
  return next;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function haversineKm(a, b) {
  if (!a || !b) return NaN;
  return haversineDistance(a.lat, a.lng, b.lat, b.lng);
}

function formatDistance(km) {
  if (km == null || !isFinite(km)) return '—';
  if (km < 1) return Math.max(10, Math.round(km * 1000)) + ' m';
  return km.toFixed(1).replace('.', ',') + ' km';
}

function formatDistanceApprox(km) {
  const core = formatDistance(km);
  if (core === '—') return null;
  return 'cerca de ' + core;
}

function formatKm(meters) {
  return (meters / 1000).toFixed(1).replace('.', ',') + ' km';
}

/** Driver-app toast: 12 min / 1h05. */
function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/** Public track page: empty on invalid, at least 1 min. */
function formatClientDuration(seconds) {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '';
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
}

function isWithinNearKm(delivery, pos, nearKm = TRACK_NEAR_KM) {
  if (!delivery || !pos) return false;
  if (typeof delivery.lat !== 'number' || typeof delivery.lng !== 'number') return false;
  return haversineDistance(pos.lat, pos.lng, delivery.lat, delivery.lng) <= nearKm;
}

function shouldPublishTrack(pos, lastPos, lastAt, now, opts) {
  const minMs = (opts && opts.minMs) || TRACK_PUBLISH_MIN_MS;
  const minKm = (opts && opts.minKm) || TRACK_PUBLISH_MIN_KM;
  if (!lastPos) return true;
  if (now - lastAt >= minMs) return true;
  const moved = haversineDistance(lastPos.lat, lastPos.lng, pos.lat, pos.lng);
  return moved >= minKm;
}

function stopsAheadOf(delivery, pending) {
  if (!delivery) return 0;
  const idx = (pending || []).findIndex((d) => d.id === delivery.id);
  return idx >= 0 ? idx : 0;
}

/**
 * @param {object} delivery
 * @param {{ status?: string, pos?: { lat: number, lng: number } }|null} extras
 * @param {{
 *   motorista?: string,
 *   pendingStops?: object[],
 *   estimateStopEta?: Function,
 *   startPoint?: { lat: number, lng: number }|null,
 *   gpsAccuracyMeters?: number,
 *   now?: number
 * }} [ctx]
 * @returns {object}
 */
function buildTrackPayload(delivery, extras, ctx) {
  const context = ctx || {};
  const status = extras && extras.status ? extras.status : trackStatusFor(delivery);
  const payload = {
    destLat: Number(delivery.lat),
    destLng: Number(delivery.lng),
    destName: publicFirstName(delivery.nome, 'Cliente'),
    sequentialId: String(delivery.sequentialId || '').slice(0, 16),
    status,
    motorista: publicFirstName(context.motorista, 'Motorista'),
    updatedAt: typeof context.now === 'number' ? context.now : Date.now(),
    nearNotified: !!delivery.nearNotified,
    deliveredNotified: !!delivery.deliveredNotified,
    absentNotified: !!delivery.absentNotified,
    failReason: (status === 'falhou' && ['ausente', 'endereco-errado', 'recusou'].includes(delivery.failReason))
      ? delivery.failReason
      : '',
    etaSeconds: 0,
    stopsAhead: 0
  };
  if (status === 'active') {
    payload.stopsAhead = stopsAheadOf(delivery, context.pendingStops || []);
    const eta = typeof context.estimateStopEta === 'function'
      ? context.estimateStopEta(delivery)
      : null;
    if (eta && typeof eta.seconds === 'number' && eta.seconds >= 0) {
      payload.etaSeconds = Math.min(TRACK_ETA_MAX_SECONDS, Math.round(eta.seconds));
    }
  }
  const pos = extras && extras.pos ? extras.pos : context.startPoint;
  if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
    payload.driverLat = Number(pos.lat);
    payload.driverLng = Number(pos.lng);
    payload.accuracy = typeof context.gpsAccuracyMeters === 'number' ? context.gpsAccuracyMeters : 0;
  }
  return payload;
}

function isFiniteCoord(n, min, max) {
  return typeof n === 'number' && isFinite(n) && n >= min && n <= max;
}

/** JS mirror of firestore.rules isValidTrack — used by tests, not by security rules. */
function isValidTrack(data) {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.some((k) => TRACK_FIELD_KEYS.indexOf(k) === -1)) return false;
  if (!isFiniteCoord(data.destLat, -90, 90) || !isFiniteCoord(data.destLng, -180, 180)) return false;
  if (TRACK_STATUSES.indexOf(data.status) === -1) return false;
  if (typeof data.updatedAt !== 'number') return false;
  if (typeof data.destName !== 'string' || data.destName.length >= 80) return false;
  if (typeof data.sequentialId !== 'string' || data.sequentialId.length >= 20) return false;
  if (typeof data.motorista !== 'string' || data.motorista.length >= 80) return false;
  if ('driverLat' in data && !isFiniteCoord(data.driverLat, -90, 90)) return false;
  if ('driverLng' in data && !isFiniteCoord(data.driverLng, -180, 180)) return false;
  if ('accuracy' in data && typeof data.accuracy !== 'number') return false;
  if ('nearNotified' in data && typeof data.nearNotified !== 'boolean') return false;
  if ('deliveredNotified' in data && typeof data.deliveredNotified !== 'boolean') return false;
  if ('absentNotified' in data && typeof data.absentNotified !== 'boolean') return false;
  if ('failReason' in data && TRACK_FAIL_REASONS.indexOf(data.failReason) === -1) return false;
  if ('etaSeconds' in data && !(typeof data.etaSeconds === 'number' && data.etaSeconds >= 0 && data.etaSeconds <= TRACK_ETA_MAX_SECONDS)) {
    return false;
  }
  if ('stopsAhead' in data && !(typeof data.stopsAhead === 'number' && data.stopsAhead >= 0 && data.stopsAhead <= 500)) {
    return false;
  }
  return true;
}

module.exports = {
  TRACK_TOKEN_RE,
  TRACK_STATUSES,
  TRACK_FAIL_REASONS,
  TRACK_FIELD_KEYS,
  TRACK_UPDATE_KEYS,
  TRACK_NEAR_METERS,
  TRACK_NEAR_KM,
  TRACK_PUBLISH_MIN_MS,
  TRACK_PUBLISH_MIN_KM,
  TRACK_ETA_MAX_SECONDS,
  isValidTrackToken,
  newTrackToken,
  normalizeTrackToken,
  readTrackTokenFromLocation,
  publicFirstName,
  trackStatusFor,
  stripTrackEtaFields,
  haversineDistance,
  haversineKm,
  formatDistance,
  formatDistanceApprox,
  formatKm,
  formatDuration,
  formatClientDuration,
  isWithinNearKm,
  shouldPublishTrack,
  stopsAheadOf,
  buildTrackPayload,
  isValidTrack
};
