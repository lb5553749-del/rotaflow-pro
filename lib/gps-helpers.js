'use strict';

/**
 * Pure GPS / BackgroundGps helpers. No DOM / Capacitor / Geolocation APIs.
 */

const { isWithinNearKm } = require('./track-schema.js');

const GPS_PREF_KEY = 'rotaflow_gps';

/**
 * Quantas paradas à frente recebem a posição do motorista a cada fix do GPS.
 * Sem limite, um cliente 8 paradas atrás recebe o carro se movendo (e o
 * "motorista está próximo") enquanto o motorista ainda está no início da rota —
 * além de 1 escrita no Firestore por parada por fix.
 */
const TRACK_PUBLISH_LIMIT = 3;

/**
 * @param {Storage|null|undefined} storage
 * @returns {boolean}
 */
function readGpsEnabledPref(storage) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || typeof s.getItem !== 'function') return true;
    return s.getItem(GPS_PREF_KEY) !== '0';
  } catch (_) {
    return true;
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @param {boolean} enabled
 */
function writeGpsEnabledPref(storage, enabled) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || typeof s.setItem !== 'function') return;
    s.setItem(GPS_PREF_KEY, enabled ? '1' : '0');
  } catch (_) {}
}

/**
 * @param {object|null|undefined} p GeolocationPosition-like
 * @returns {{ lat: number, lng: number, accuracy: number|null }|null}
 */
function coordsFromPosition(p) {
  if (!p || !p.coords) return null;
  const lat = p.coords.latitude;
  const lng = p.coords.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accuracy = typeof p.coords.accuracy === 'number' ? p.coords.accuracy : null;
  return { lat, lng, accuracy };
}

/**
 * @param {number|null|undefined} meters
 * @param {number} [min]
 */
function gpsAccuracyCircleRadius(meters, min = 25) {
  const n = typeof meters === 'number' && Number.isFinite(meters) ? meters : 0;
  return Math.max(n, min);
}

/**
 * @param {{ isSecureContext?: boolean, hasGeolocation?: boolean }} [ctx]
 */
function canUseWebGeolocation(ctx) {
  const secure = ctx && ctx.isSecureContext !== undefined ? !!ctx.isSecureContext : true;
  const hasGeo = ctx && ctx.hasGeolocation !== undefined ? !!ctx.hasGeolocation : true;
  return secure && hasGeo;
}

/**
 * @param {{ isNative?: boolean, hasNativeGeo?: boolean }} [ctx]
 */
function canUseNativeGeolocation(ctx) {
  return !!(ctx && ctx.isNative && ctx.hasNativeGeo);
}

/**
 * Targets for BackgroundGps.updateTargets / start.
 * @param {Array<{ trackToken?: string, routeOrder?: number, lat?: number, lng?: number, nearNotified?: boolean, status?: string }>} deliveries
 * @param {(d: object) => boolean} isActiveStop
 * @returns {{ token: string, lat: number, lng: number, routeOrder: number, nearNotified: boolean }[]}
 */
function buildActiveTrackTargets(deliveries, isActiveStop) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  const active = typeof isActiveStop === 'function' ? isActiveStop : () => true;
  return list
    .filter((d) => d && d.trackToken && active(d)
      && typeof d.lat === 'number' && typeof d.lng === 'number')
    .map((d) => ({
      token: d.trackToken,
      lat: d.lat,
      lng: d.lng,
      routeOrder: typeof d.routeOrder === 'number' ? d.routeOrder : Number.MAX_SAFE_INTEGER,
      nearNotified: !!d.nearNotified
    }));
}

/**
 * Normalize BackgroundGps `location` event into a GeolocationPosition-like object.
 * @param {{ latitude?: number, longitude?: number, accuracy?: number }|null|undefined} loc
 */
function positionFromBackgroundLocation(loc) {
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
  return {
    coords: {
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: typeof loc.accuracy === 'number' ? loc.accuracy : 0
    }
  };
}

/** Meters below which consecutive fixes count as stationary (battery adaptive). */
const GPS_STATIONARY_METERS = 18;
/** Consecutive stationary samples before entering low-power watch. */
const GPS_STATIONARY_SAMPLES = 3;

/**
 * Approximate distance in meters (haversine, Earth radius 6371000).
 * @param {{ lat: number, lng: number }|null|undefined} a
 * @param {{ lat: number, lng: number }|null|undefined} b
 * @returns {number}
 */
function metersBetweenCoords(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @param {{ lat: number, lng: number }|null|undefined} prev
 * @param {{ lat: number, lng: number }|null|undefined} next
 * @param {number} [thresholdM]
 * @returns {boolean}
 */
function isGpsStationary(prev, next, thresholdM = GPS_STATIONARY_METERS) {
  if (!prev || !next) return false;
  return metersBetweenCoords(prev, next) < thresholdM;
}

/**
 * Web / Capacitor Geolocation.watchPosition options for adaptive battery mode.
 * Native BackgroundGps interval stays fixed in Java (see docs note) — this only
 * tunes the JS-side watch when the WebView is foregrounded.
 * @param {{ stationary?: boolean }} [state]
 * @returns {{ enableHighAccuracy: boolean, maximumAge: number, timeout: number }}
 */
function adaptiveWatchOptions(state) {
  if (state && state.stationary) {
    return { enableHighAccuracy: false, maximumAge: 45000, timeout: 25000 };
  }
  return { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 };
}

/**
 * Suggested BackgroundGps intervalMs if a future native bridge exposes it.
 * Documented only — do not assume Java service reads this yet.
 * @param {{ stationary?: boolean }} [state]
 * @returns {number}
 */
function suggestedBackgroundIntervalMs(state) {
  return state && state.stationary ? 12000 : 4000;
}

/**
 * @param {number} stationaryStreak
 * @param {boolean} justMoved
 * @returns {{ stationary: boolean, streak: number }}
 */
function nextStationaryState(stationaryStreak, justMoved) {
  if (justMoved) return { stationary: false, streak: 0 };
  const streak = (Number(stationaryStreak) || 0) + 1;
  return {
    streak,
    stationary: streak >= GPS_STATIONARY_SAMPLES
  };
}

/**
 * Próximas paradas ativas com rastreio — quem recebe a posição a cada fix.
 *
 * A ordem vem do `routeOrder` gravado na otimização da rota; sem rota otimizada
 * vale a ordem da lista. Quem já está dentro do raio de proximidade entra mesmo
 * além do limite, senão a notificação de "chegando" se perderia.
 * @param {Array<{ trackToken?: string, routeOrder?: number, lat?: number, lng?: number }>} deliveries
 * @param {(d: object) => boolean} isActiveStop
 * @param {{ lat: number, lng: number }|null|undefined} [pos]
 * @param {number} [limit]
 * @returns {object[]}
 */
function nextActiveTrackTargets(deliveries, isActiveStop, pos, limit = TRACK_PUBLISH_LIMIT) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  const active = typeof isActiveStop === 'function' ? isActiveStop : () => true;
  const tracked = list.filter((d) => d && d.trackToken && active(d));
  const ordered = tracked.slice().sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
  if (!pos) return ordered.slice(0, limit);

  const picked = new Map();
  for (const d of ordered.slice(0, limit)) picked.set(d.id, d);
  for (const d of ordered) {
    if (isWithinNearKm(d, pos) && !picked.has(d.id)) picked.set(d.id, d);
  }
  return [...picked.values()];
}

module.exports = {
  GPS_PREF_KEY,
  GPS_STATIONARY_METERS,
  GPS_STATIONARY_SAMPLES,
  TRACK_PUBLISH_LIMIT,
  readGpsEnabledPref,
  writeGpsEnabledPref,
  coordsFromPosition,
  gpsAccuracyCircleRadius,
  canUseWebGeolocation,
  canUseNativeGeolocation,
  buildActiveTrackTargets,
  nextActiveTrackTargets,
  positionFromBackgroundLocation,
  metersBetweenCoords,
  isGpsStationary,
  adaptiveWatchOptions,
  suggestedBackgroundIntervalMs,
  nextStationaryState
};
