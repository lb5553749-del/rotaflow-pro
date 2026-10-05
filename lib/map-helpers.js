'use strict';

/**
 * Pure map-pin visuals: status → color/mute. No DOM / Google Maps.
 */

require('./types.js');

/** @param {DeliveryStop|null|undefined} delivery */
function isMutedPin(delivery) {
  return !!(delivery && (delivery.status === 'entregue' || delivery.status === 'falhou'));
}

/**
 * @param {DeliveryStop|null|undefined} delivery
 * @param {boolean} [highlighted]
 */
function pinTextColorFor(delivery, highlighted) {
  if (highlighted) return '#ffffff';
  if (isMutedPin(delivery)) return '#80868B';
  return '#ffffff';
}

/** @param {DeliveryStop|null|undefined} delivery */
function markerColorFor(delivery) {
  if (!delivery) return '#3b82f6';
  if (delivery.status === 'entregue') return '#F1F3F4';
  if (delivery.status === 'falhou') return '#EEF0F2';
  return (delivery.pacotes || 1) >= 2 ? '#EF4444' : '#1A73E8';
}

/**
 * @param {string} hex
 * @param {number} [alpha]
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function hexToTint(hex, alpha = 255) {
  const h = String(hex || '#3b82f6').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
    a: alpha
  };
}

/**
 * Pin scale by how many active (non-muted) stops are on the map.
 * @param {boolean} muted
 * @param {number} activeCount
 * @returns {number}
 */
function markerScaleForActiveCount(muted, activeCount) {
  if (muted) return 5;
  const n = Number(activeCount) || 0;
  if (n > 60) return 6;
  if (n > 30) return 7;
  if (n > 15) return 8;
  return 10;
}

module.exports = {
  isMutedPin,
  pinTextColorFor,
  markerColorFor,
  hexToTint,
  markerScaleForActiveCount
};
