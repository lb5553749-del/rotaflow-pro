'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('../lib/routing-helpers.js');

describe('hasMapCoords / normalizeDeliveryCoords', () => {
  it('accepts numeric coords and coerces numeric strings', () => {
    assert.equal(hasMapCoords({ lat: -8.7, lng: -63.9 }), true);
    assert.equal(hasMapCoords({ lat: 'x', lng: 1 }), false);
    const d = { lat: '-8.76', lng: '-63.90' };
    normalizeDeliveryCoords(d);
    assert.equal(d.lat, -8.76);
    assert.equal(hasMapCoords(d), true);
  });
});

describe('isPendingStop / pendingStops', () => {
  it('drops delivered, failed and coord-less stops', () => {
    const list = [
      { id: 1, status: 'pendente', lat: 1, lng: 1 },
      { id: 2, status: 'entregue', lat: 1, lng: 1 },
      { id: 3, status: 'falhou', lat: 1, lng: 1 },
      { id: 4, status: 'pendente' }
    ];
    assert.deepEqual(pendingStops(list).map((d) => d.id), [1]);
    assert.equal(isPendingStop(list[0]), true);
    assert.equal(isPendingStop(null), false);
  });
});

describe('routeSignature', () => {
  it('includes start point and stop ids', () => {
    assert.equal(
      routeSignature([{ id: 'a' }, { id: 'b' }], { lat: -8.7619, lng: -63.9038 }),
      '-8.762,-63.904|a>b'
    );
    assert.equal(routeSignature([], null), 'lista|');
  });
});

describe('farthestFrom / orderByProximity', () => {
  it('picks the farthest stop and walks nearest neighbor', () => {
    const origin = { lat: 0, lng: 0 };
    const stops = [
      { id: 'near', lat: 0.01, lng: 0 },
      { id: 'far', lat: 1, lng: 0 },
      { id: 'mid', lat: 0.2, lng: 0 }
    ];
    assert.equal(farthestFrom(origin, stops).id, 'far');
    const ordered = orderByProximity(stops, origin);
    assert.deepEqual(ordered.map((s) => s.id), ['near', 'mid', 'far']);
  });

  it('uses the first stop as origin when there is no GPS', () => {
    const stops = [
      { id: 'a', lat: 0, lng: 0 },
      { id: 'b', lat: 0.01, lng: 0 },
      { id: 'c', lat: 1, lng: 0 }
    ];
    const ordered = orderByProximity(stops, null);
    assert.equal(ordered[0].id, 'a');
    assert.equal(ordered.length, 3);
  });
});

describe('chunkPoints', () => {
  it('overlaps chunks so the last point of one is the first of the next', () => {
    const points = Array.from({ length: 30 }, (_, i) => i);
    const chunks = chunkPoints(points, MAX_WAYPOINTS);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0].length, MAX_WAYPOINTS + 2);
    assert.equal(chunks[0][chunks[0].length - 1], chunks[1][0]);
  });

  it('returns empty for a single point', () => {
    assert.deepEqual(chunkPoints([{ lat: 1 }]), []);
  });
});

describe('applyStopOrder', () => {
  it('rewrites only pending slots', () => {
    const deliveries = [
      { id: 1, status: 'entregue', lat: 0, lng: 0 },
      { id: 2, status: 'pendente', lat: 1, lng: 1 },
      { id: 3, status: 'pendente', lat: 2, lng: 2 }
    ];
    applyStopOrder(deliveries, [deliveries[2], deliveries[1]]);
    assert.equal(deliveries[0].id, 1);
    assert.equal(deliveries[1].id, 3);
    assert.equal(deliveries[2].id, 2);
  });

  it('throws ORDER_MISMATCH when the list is incomplete', () => {
    const deliveries = [
      { id: 1, status: 'pendente', lat: 1, lng: 1 },
      { id: 2, status: 'pendente', lat: 2, lng: 2 }
    ];
    assert.throws(() => applyStopOrder(deliveries, [deliveries[0]]), /ORDER_MISMATCH/);
  });
});

describe('Directions plan / order / metrics', () => {
  it('plans origin, farthest end and middle waypoints', () => {
    const origin = { lat: 0, lng: 0 };
    const stops = [
      { id: 'a', lat: 0.01, lng: 0 },
      { id: 'b', lat: 1, lng: 0 },
      { id: 'c', lat: 0.2, lng: 0 }
    ];
    const plan = planDirectionsLegs(stops, origin);
    assert.equal(plan.end.id, 'b');
    assert.deepEqual(plan.waypoints.map((s) => s.id).sort(), ['a', 'c']);
    const ordered = orderedFromDirectionsPlan(plan, [1, 0]);
    assert.deepEqual(ordered.map((s) => s.id), ['c', 'a', 'b']);
  });

  it('builds route points with optional GPS start', () => {
    const ordered = [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }];
    assert.deepEqual(buildRoutePoints(ordered, null), ordered);
    assert.deepEqual(buildRoutePoints(ordered, { lat: 0, lng: 0 })[0], { lat: 0, lng: 0 });
  });

  it('applies legs, cumulative ETAs and routeOrder', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const ordered = [a, b];
    clearStopRouteFields(ordered);
    const totals = applyLegsToOrdered(ordered, [
      { distance: { value: 1000 }, duration: { value: 120 } },
      { distance: { value: 500 }, duration: { value: 60 } }
    ], true);
    assert.equal(totals.meters, 1500);
    assert.equal(a.legMeters, 1000);
    assignCumulativeEtas(ordered);
    assert.equal(b.etaMeters, 1500);
    assert.equal(b.etaSeconds, 180);
    const deliveries = [{ id: 'x' }, a, b];
    assignRouteOrderIndexes(deliveries, ordered);
    assert.equal(a.routeOrder, 1);
    assert.equal(b.routeOrder, 2);
    assert.equal(deliveries[0].routeOrder, undefined);
  });

  it('decides optimize FAB visibility from signature', () => {
    const metrics = buildRouteMetrics('sig-a', 100, 60);
    assert.equal(isRouteOptimizedFor(true, metrics, 'sig-a'), true);
    assert.equal(shouldShowOptimizeFab(3, true, metrics, 'sig-a'), false);
    assert.equal(shouldShowOptimizeFab(3, true, metrics, 'sig-b'), true);
    assert.equal(shouldShowOptimizeFab(1, false, null, 'x'), false);
  });
});

describe('directionsErrorMessage / gpsErrorMessage', () => {
  it('maps Directions statuses', () => {
    assert.match(directionsErrorMessage({ message: 'ZERO_RESULTS' }), /trajeto/);
    assert.match(directionsErrorMessage(null), /Não foi possível/);
  });

  it('maps GPS context and codes', () => {
    assert.match(gpsErrorMessage(null, { isNative: false, isSecureContext: false }), /HTTPS/);
    assert.match(gpsErrorMessage({ code: 1 }, { isNative: true }), /Permissão/);
    assert.match(gpsErrorMessage({ code: 3 }, { isNative: false, isSecureContext: true, hasGeolocation: true }), /Tempo esgotado/);
  });
});

describe('time windows / address clustering', () => {
  const {
    parseHhMmToMinutes,
    normalizeTimeInputValue,
    groupStopsByAddress,
    orderByProximityWithWindows,
    anyStopHasTimeWindow
  } = require('../lib/routing-helpers.js');

  it('parses HH:MM and normalizes for time inputs', () => {
    assert.equal(parseHhMmToMinutes('17:00'), 17 * 60);
    assert.equal(parseHhMmToMinutes('9:30'), 9 * 60 + 30);
    assert.equal(parseHhMmToMinutes('25:00'), null);
    assert.equal(normalizeTimeInputValue('9:05'), '09:05');
  });

  it('groups same condo/address packages together', () => {
    const groups = groupStopsByAddress([
      { id: 1, endereco: 'Rua A, 10 apto 101' },
      { id: 2, endereco: 'Rua A, 10 Ap. 202' },
      { id: 3, endereco: 'Rua B, 5' }
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0].map((s) => s.id), [1, 2]);
  });

  it('prioritizes urgent deadlines over farther nearest-neighbor', () => {
    const origin = { lat: 0, lng: 0 };
    const stops = [
      { id: 'far-urgent', lat: 1, lng: 0, janelaFim: '12:30', endereco: 'Longe' },
      { id: 'near', lat: 0.01, lng: 0, endereco: 'Perto' },
      { id: 'mid', lat: 0.2, lng: 0, janelaFim: '18:00', endereco: 'Meio' }
    ];
    assert.equal(anyStopHasTimeWindow(stops), true);
    // now = 12:00 → far-urgent is within 90 min urgency window
    const ordered = orderByProximityWithWindows(stops, origin, { nowMinutes: 12 * 60, urgentWithinMinutes: 90 });
    assert.equal(ordered[0].id, 'far-urgent');
    assert.ok(ordered.map((s) => s.id).includes('near'));
  });

  it('keeps same-address stops consecutive after window ordering', () => {
    const origin = { lat: 0, lng: 0 };
    const stops = [
      { id: 'a1', lat: 0.5, lng: 0, endereco: 'Cond X apto 1', janelaFim: '13:00' },
      { id: 'b', lat: 0.01, lng: 0, endereco: 'Outro' },
      { id: 'a2', lat: 0.501, lng: 0, endereco: 'Cond X apto 2', janelaFim: '13:00' }
    ];
    const ordered = orderByProximityWithWindows(stops, origin, { nowMinutes: 12 * 60 });
    const ids = ordered.map((s) => s.id);
    const i1 = ids.indexOf('a1');
    const i2 = ids.indexOf('a2');
    assert.equal(Math.abs(i1 - i2), 1);
  });
});
