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
  applyStopOrder
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
