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

/**
 * @param {DeliveryStop|null|undefined} delivery
 * @param {{ riskLevel?: 'amarelo'|'vermelho'|null }} [opts]
 */
function markerColorFor(delivery, opts) {
  if (!delivery) return '#3b82f6';
  if (delivery.status === 'entregue') return '#F1F3F4';
  if (delivery.status === 'falhou') return '#EEF0F2';
  const risk = opts && opts.riskLevel;
  if (risk === 'vermelho') return '#B91C1C';
  if (risk === 'amarelo') return '#D97706';
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

/** Token que parece número/complemento ("100", "s/n", "casa 3", "12-A") e não bairro. */
function isNumberishToken(token) {
  return /[0-9]/.test(token) || /^s\/?n/i.test(token);
}

/**
 * Bairro de um endereço "Rua, número, bairro": a última parte separada por
 * vírgula, desde que não pareça um número/complemento. Antes a regra usava a
 * penúltima parte, que num endereço de 3 partes é o número da porta — o filtro
 * de bairro e o label das áreas de risco casavam por número.
 */
function extractDistrict(endereco) {
  if (!endereco) return '';
  const parts = String(endereco).split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && last && !isNumberishToken(last)) return last;
  return '';
}

/**
 * Normalize google.maps.LatLng or plain {lat,lng} to a plain object.
 * @param {{ lat: number|Function, lng: number|Function }|null|undefined} pos
 * @returns {{ lat: number, lng: number }|null}
 */
function plainLatLng(pos) {
  if (!pos) return null;
  if (typeof pos.lat === 'function' && typeof pos.lng === 'function') {
    const lat = pos.lat();
    const lng = pos.lng();
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng };
  }
  if (typeof pos.lat === 'number' && typeof pos.lng === 'number'
    && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
    return { lat: pos.lat, lng: pos.lng };
  }
  return null;
}

/**
 * Extract SW/NE from a google.maps.LatLngBounds-like or plain bounds object.
 * @param {object|null|undefined} bounds
 * @returns {{ southwest: {lat:number,lng:number}, northeast: {lat:number,lng:number}, center: {lat:number,lng:number} }|null}
 */
function boundsCorners(bounds) {
  if (!bounds) return null;
  let sw;
  let ne;
  if (typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
    sw = plainLatLng(bounds.getSouthWest());
    ne = plainLatLng(bounds.getNorthEast());
  } else if (bounds.southwest && bounds.northeast) {
    sw = plainLatLng(bounds.southwest);
    ne = plainLatLng(bounds.northeast);
  }
  if (!sw || !ne) return null;
  return {
    southwest: sw,
    northeast: ne,
    center: { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 }
  };
}

/**
 * Pacotes heuristic for native pin color (red multi-package).
 * @param {string} color
 */
function pacotesFromPinColor(color) {
  const c = String(color || '').toLowerCase();
  return c === '#ef4444' ? 2 : 1;
}

/**
 * Sequential ids that should remain on the map after a rebuild.
 * @param {DeliveryStop[]} deliveries
 * @param {(d: DeliveryStop) => boolean} shouldShow
 * @returns {Set<string|number>}
 */
function markerIdsToKeep(deliveries, shouldShow) {
  const keep = new Set();
  const pred = typeof shouldShow === 'function' ? shouldShow : () => true;
  for (const del of Array.isArray(deliveries) ? deliveries : []) {
    if (pred(del)) keep.add(del.sequentialId);
  }
  return keep;
}

/**
 * Google Maps marker z-index for highlight / muted state.
 * @param {boolean} highlighted
 * @param {boolean} muted
 */
function markerZIndexFor(highlighted, muted) {
  if (highlighted) return 30;
  if (muted) return 1;
  return 10;
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
  shortStreetAddress,
  extractDistrict,
  plainLatLng,
  boundsCorners,
  pacotesFromPinColor,
  markerIdsToKeep,
  markerZIndexFor
};
