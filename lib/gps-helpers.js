'use strict';

/**
 * Pure GPS / BackgroundGps helpers. No DOM / Capacitor / Geolocation APIs.
 */

const GPS_PREF_KEY = 'rotaflow_gps';

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
 * @param {Array<{ trackToken?: string, lat?: number, lng?: number, nearNotified?: boolean, status?: string }>} deliveries
 * @param {(d: object) => boolean} isActiveStop
 * @returns {{ token: string, lat: number, lng: number, nearNotified: boolean }[]}
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

module.exports = {
  GPS_PREF_KEY,
  readGpsEnabledPref,
  writeGpsEnabledPref,
  coordsFromPosition,
  gpsAccuracyCircleRadius,
  canUseWebGeolocation,
  canUseNativeGeolocation,
  buildActiveTrackTargets,
  positionFromBackgroundLocation
};
