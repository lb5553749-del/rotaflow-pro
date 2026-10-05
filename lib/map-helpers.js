'use strict';

/**
 * Pure map-pin visuals and geometry helpers. No DOM / Google Maps.
 */

require('./types.js');

const PIN_SIZE_PX = { p: 16, m: 22, g: 28 };

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

/**
 * Display size (CSS px) for native/canvas pins from preference + density.
 * @param {'p'|'m'|'g'|string} pref
 * @param {number} activeCount
 */
function nativePinDisplaySize(pref, activeCount) {
  let base = PIN_SIZE_PX[pref] || PIN_SIZE_PX.p;
  const n = Number(activeCount) || 0;
  if (n > 60) base = Math.max(12, base - 2);
  else if (n > 30) base = Math.max(13, base - 1);
  return base;
}

function iconFillColor(icon) {
  if (!icon) return '#3b82f6';
  if (typeof icon === 'string') return icon;
  return icon.fillColor || '#3b82f6';
}

function iconFillOpacity(icon) {
  if (!icon || typeof icon !== 'object') return 1;
  return typeof icon.fillOpacity === 'number' ? icon.fillOpacity : 1;
}

/**
 * Axis-aligned bounds + center for fitBounds (native facade).
 * @param {{ lat: number, lng: number }[]} pts
 * @returns {{ southwest: {lat:number,lng:number}, northeast: {lat:number,lng:number}, center: {lat:number,lng:number} }|null}
 */
function boundsFromPoints(pts) {
  if (!pts || !pts.length) return null;
  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    southwest: { lat: minLat, lng: minLng },
    northeast: { lat: maxLat, lng: maxLng },
    center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
  };
}

/**
 * Prefer non-delivered stops for framing; fall back to all with coords.
 * @param {DeliveryStop[]} deliveries
 * @param {(d: DeliveryStop) => boolean} hasCoords
 * @returns {{ lat: number, lng: number }[]}
 */
function pointsForMapFit(deliveries, hasCoords) {
  const list = deliveries || [];
  const ok = typeof hasCoords === 'function' ? hasCoords : () => true;
  let pts = list
    .filter((d) => ok(d) && d.status !== 'entregue')
    .map((d) => ({ lat: d.lat, lng: d.lng }));
  if (!pts.length) {
    pts = list.filter(ok).map((d) => ({ lat: d.lat, lng: d.lng }));
  }
  return pts;
}

/** First two comma-separated address parts for HUD / panel. */
function shortStreetAddress(endereco) {
  if (!endereco) return '—';
  const parts = String(endereco).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join(', ');
  return parts[0] || '—';
}

module.exports = {
  PIN_SIZE_PX,
  isMutedPin,
  pinTextColorFor,
  markerColorFor,
  hexToTint,
  markerScaleForActiveCount,
  nativePinDisplaySize,
  iconFillColor,
  iconFillOpacity,
  boundsFromPoints,
  pointsForMapFit,
  shortStreetAddress
};
