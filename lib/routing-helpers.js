'use strict';

/**
 * Pure routing geometry: coords, nearest-neighbor order, Directions chunking.
 */

require('./types.js');
const { haversineDistance } = require('./track-schema.js');

const MAX_WAYPOINTS = 23;

function isPendingStop(d) {
  return !!d && d.status !== 'entregue' && d.status !== 'falhou' && hasMapCoords(d);
}

function pendingStops(list) {
  return (list || []).filter(isPendingStop);
}

function hasMapCoords(d) {
  if (!d) return false;
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function normalizeDeliveryCoords(d) {
  if (!d) return d;
  if (d.lat != null && d.lat !== '') {
    const lat = Number(d.lat);
    if (Number.isFinite(lat)) d.lat = lat;
  }
  if (d.lng != null && d.lng !== '') {
    const lng = Number(d.lng);
    if (Number.isFinite(lng)) d.lng = lng;
  }
  return d;
}

function routeSignature(stops, startPoint) {
  const start = startPoint
    ? `${startPoint.lat.toFixed(3)},${startPoint.lng.toFixed(3)}`
    : 'lista';
  return start + '|' + (stops || []).map((d) => d.id).join('>');
}

function farthestFrom(point, stops) {
  let best = stops[0];
  let bestDist = -1;
  (stops || []).forEach((s) => {
    const dist = haversineDistance(point.lat, point.lng, s.lat, s.lng);
    if (dist > bestDist) {
      bestDist = dist;
      best = s;
    }
  });
  return best;
}

function orderByProximity(stops, startPoint) {
  const list = stops || [];
  const fixedStart = startPoint ? null : list[0];
  let current = startPoint || { lat: fixedStart.lat, lng: fixedStart.lng };
  const remaining = fixedStart ? list.slice(1) : list.slice();
  const ordered = fixedStart ? [fixedStart] : [];
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((s, i) => {
      const dist = haversineDistance(current.lat, current.lng, s.lat, s.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

function chunkPoints(points, maxWaypoints = MAX_WAYPOINTS) {
  const perRequest = maxWaypoints + 2;
  const chunks = [];
  for (let i = 0; i < points.length - 1; i += perRequest - 1) {
    chunks.push(points.slice(i, i + perRequest));
  }
  return chunks;
}

function applyStopOrder(deliveries, ordered) {
  const slots = [];
  (deliveries || []).forEach((d, i) => {
    if (isPendingStop(d)) slots.push(i);
  });
  if (ordered.length !== slots.length) throw new Error('ORDER_MISMATCH');
  ordered.forEach((d, i) => {
    deliveries[slots[i]] = d;
  });
  return deliveries;
}

module.exports = {
  MAX_WAYPOINTS,
  isPendingStop,
  pendingStops,
  hasMapCoords,
  normalizeDeliveryCoords,
  routeSignature,
  farthestFrom,
  orderByProximity,
  chunkPoints,
  applyStopOrder
};
