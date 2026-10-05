'use strict';

/**
 * Pure routing geometry: coords, nearest-neighbor order, Directions chunking,
 * leg metrics, and user-facing Directions/GPS error strings.
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

/**
 * Split pending stops into origin / end / middle waypoints for Directions optimizeWaypoints.
 * @param {DeliveryStop[]} stops
 * @param {{ lat: number, lng: number }|null|undefined} startPoint
 */
function planDirectionsLegs(stops, startPoint) {
  const list = stops || [];
  const fixedStart = startPoint ? null : list[0];
  const origin = startPoint || { lat: fixedStart.lat, lng: fixedStart.lng };
  const rest = fixedStart ? list.slice(1) : list.slice();
  const end = farthestFrom(origin, rest);
  const waypoints = rest.filter((s) => s !== end);
  return { fixedStart, origin, end, waypoints };
}

/**
 * Rebuild stop order from Google Directions waypoint_order.
 * @param {{ fixedStart: DeliveryStop|null, end: DeliveryStop, waypoints: DeliveryStop[] }} plan
 * @param {number[]} [waypointOrder]
 */
function orderedFromDirectionsPlan(plan, waypointOrder) {
  const waypoints = plan.waypoints || [];
  const order = Array.isArray(waypointOrder) && waypointOrder.length
    ? waypointOrder
    : waypoints.map((_, i) => i);
  const middle = order.map((i) => waypoints[i]);
  return plan.fixedStart
    ? [plan.fixedStart, ...middle, plan.end]
    : [...middle, plan.end];
}

/** LatLng points for Directions chunks (optional GPS origin first). */
function buildRoutePoints(ordered, startPoint) {
  const points = (ordered || []).map((s) => ({ lat: s.lat, lng: s.lng }));
  if (startPoint) points.unshift(startPoint);
  return points;
}

function clearStopRouteFields(stops) {
  (stops || []).forEach((d) => {
    if (!d) return;
    delete d.legMeters;
    delete d.legSeconds;
    delete d.routeOrder;
    delete d.etaMeters;
    delete d.etaSeconds;
  });
  return stops;
}

/**
 * Apply Directions legs onto ordered pending stops.
 * When startPoint is set, leg i maps to ordered[i]; otherwise leg 0 is first→second stop.
 * @param {DeliveryStop[]} ordered
 * @param {{ distance?: { value?: number }, duration?: { value?: number } }[]} legs
 * @param {boolean} hasStartPoint
 * @returns {{ meters: number, seconds: number }}
 */
function applyLegsToOrdered(ordered, legs, hasStartPoint) {
  let meters = 0;
  let seconds = 0;
  (legs || []).forEach((leg, i) => {
    const legMeters = leg && leg.distance ? leg.distance.value : 0;
    const legSeconds = leg && leg.duration ? leg.duration.value : 0;
    meters += legMeters || 0;
    seconds += legSeconds || 0;
    const stop = ordered[hasStartPoint ? i : i + 1];
    if (stop) {
      stop.legMeters = legMeters;
      stop.legSeconds = legSeconds;
    }
  });
  return { meters, seconds };
}

function assignCumulativeEtas(ordered) {
  let cumM = 0;
  let cumS = 0;
  (ordered || []).forEach((s) => {
    cumM += s.legMeters || 0;
    cumS += s.legSeconds || 0;
    s.etaMeters = cumM;
    s.etaSeconds = cumS;
  });
  return ordered;
}

/** routeOrder follows position among pending ordered stops (1-based). */
function assignRouteOrderIndexes(deliveries, ordered) {
  const orderIndex = new Map((ordered || []).map((s, i) => [s.id, i + 1]));
  (deliveries || []).forEach((d) => {
    if (orderIndex.has(d.id)) d.routeOrder = orderIndex.get(d.id);
  });
  return deliveries;
}

function buildRouteMetrics(signature, meters, seconds) {
  return { signature, meters, seconds };
}

function isRouteOptimizedFor(routeActive, routeMetrics, signature) {
  return !!(
    routeActive &&
    routeMetrics &&
    routeMetrics.signature === signature
  );
}

function shouldShowOptimizeFab(pendingCount, routeActive, routeMetrics, signature) {
  const optimized = isRouteOptimizedFor(routeActive, routeMetrics, signature);
  return pendingCount >= 2 && !optimized;
}

function directionsErrorMessage(err) {
  switch (err && err.message) {
    case 'REQUEST_DENIED':
      return 'A Directions API precisa ser habilitada na chave do Google Maps';
    case 'OVER_QUERY_LIMIT':
      return 'Limite de consultas do Google atingido. Tente novamente em instantes';
    case 'ZERO_RESULTS':
      return 'Não foi encontrado um trajeto por rua entre essas paradas';
    case 'MAX_WAYPOINTS_EXCEEDED':
      return 'Há paradas demais para calcular em uma única rota';
    default:
      return 'Não foi possível calcular a rota neste momento';
  }
}

/**
 * @param {object|null|undefined} err
 * @param {{ isNative?: boolean, isSecureContext?: boolean, hasGeolocation?: boolean }} [ctx]
 */
function gpsErrorMessage(err, ctx) {
  const isNative = !!(ctx && ctx.isNative);
  const secure = ctx && ctx.isSecureContext !== undefined ? !!ctx.isSecureContext : true;
  const hasGeo = ctx && ctx.hasGeolocation !== undefined ? !!ctx.hasGeolocation : true;
  if (!isNative && !secure) {
    return 'Localização indisponível neste contexto. Abra o app por HTTPS ou instale como aplicativo';
  }
  if (!isNative && !hasGeo) return 'Este navegador não oferece suporte à localização';
  const code = err && err.code;
  if (code === 1) return 'Permissão de localização negada. Ative-a nas configurações do aparelho';
  if (code === 2) return 'Localização indisponível. Verifique se o GPS está ativo e tente novamente';
  if (code === 3) return 'Tempo esgotado ao obter a localização. Tente novamente em área aberta';
  return 'Não foi possível obter a localização atual';
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
  applyStopOrder,
  planDirectionsLegs,
  orderedFromDirectionsPlan,
  buildRoutePoints,
  clearStopRouteFields,
  applyLegsToOrdered,
  assignCumulativeEtas,
  assignRouteOrderIndexes,
  buildRouteMetrics,
  isRouteOptimizedFor,
  shouldShowOptimizeFab,
  directionsErrorMessage,
  gpsErrorMessage
};
