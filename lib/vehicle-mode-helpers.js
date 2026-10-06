'use strict';

/**
 * Vehicle-support mode prefs (high contrast / larger targets).
 */

const VEHICLE_MODE_PREF_KEY = 'rotaflow_vehicle_mode';

/**
 * @param {Storage|null|undefined} storage
 * @returns {boolean}
 */
function readVehicleModePref(storage) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || typeof s.getItem !== 'function') return false;
    return s.getItem(VEHICLE_MODE_PREF_KEY) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @param {boolean} enabled
 */
function writeVehicleModePref(storage, enabled) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || typeof s.setItem !== 'function') return;
    s.setItem(VEHICLE_MODE_PREF_KEY, enabled ? '1' : '0');
  } catch (_) {}
}

/**
 * Navigation deep-links for lat/lng.
 * @param {number} lat
 * @param {number} lng
 * @returns {{ googleNav: string, googleWeb: string, waze: string }}
 */
function buildNavigationUrls(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return {
    googleNav: `google.navigation:q=${la},${ln}`,
    googleWeb: `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${la}%2C${ln}&navigate=yes`
  };
}

module.exports = {
  VEHICLE_MODE_PREF_KEY,
  readVehicleModePref,
  writeVehicleModePref,
  buildNavigationUrls
};
