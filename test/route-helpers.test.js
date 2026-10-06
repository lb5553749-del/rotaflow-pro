'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  nextRouteName,
  syncActiveRouteState,
  findRouteById,
  routeSwitcherItems,
  sanitizeRouteName,
  renameRouteInList,
  appendEmptyRoute
} = require('../lib/route-helpers.js');

function emptyRoute(name) {
  return {
    id: `r_${name || 'x'}`,
    name: name || 'Rota 1',
    deliveries: [],
    nextSequenceNumber: 1,
    routeActive: false,
    routeMetrics: null,
    createdAt: 1
  };
}

describe('nextRouteName', () => {
  it('starts at Rota 1', () => {
    assert.equal(nextRouteName([]), 'Rota 1');
  });

  it('uses max existing number + 1', () => {
    assert.equal(nextRouteName([
      { name: 'Rota 1' },
      { name: 'Centro' },
      { name: 'Rota 3' }
    ]), 'Rota 4');
  });
});

describe('syncActiveRouteState', () => {
  it('boots an empty routes list', () => {
    const state = syncActiveRouteState({
      routes: [],
      deliveries: [{ id: 1 }],
      nextSequenceNumber: 2,
      routeActive: true,
      routeMetrics: { meters: 10 }
    }, emptyRoute);
    assert.equal(state.routes.length, 1);
    assert.equal(state.activeRouteId, 'r_Rota 1');
    assert.equal(state.routes[0].deliveries.length, 1);
    assert.equal(state.routes[0].routeActive, true);
  });

  it('writes memory fields into the active route', () => {
    const routes = [
      { id: 'a', name: 'A', deliveries: [], nextSequenceNumber: 1, routeActive: false, routeMetrics: null },
      { id: 'b', name: 'B', deliveries: [{ id: 9 }], nextSequenceNumber: 2, routeActive: false, routeMetrics: null }
    ];
    const state = syncActiveRouteState({
      routes,
      activeRouteId: 'a',
      deliveries: [{ id: 1 }, { id: 2 }],
      nextSequenceNumber: 3,
      routeActive: true,
      routeMetrics: { signature: 'x' }
    }, emptyRoute);
    assert.equal(state.activeRouteId, 'a');
    assert.equal(state.routes[0].deliveries.length, 2);
    assert.equal(state.routes[0].nextSequenceNumber, 3);
    assert.equal(state.routes[0].routeActive, true);
    assert.deepEqual(state.routes[0].routeMetrics, { signature: 'x' });
    assert.equal(state.routes[1].deliveries.length, 1);
  });

  it('falls back to first route when active id is missing', () => {
    const state = syncActiveRouteState({
      routes: [{ id: 'only', name: 'Only', deliveries: [] }],
      activeRouteId: 'gone',
      deliveries: [{ id: 7 }],
      nextSequenceNumber: 8
    }, emptyRoute);
    assert.equal(state.activeRouteId, 'only');
    assert.equal(state.routes[0].deliveries[0].id, 7);
  });
});

describe('findRouteById / routeSwitcherItems', () => {
  it('finds by id', () => {
    assert.equal(findRouteById([{ id: 'a' }, { id: 'b' }], 'b').id, 'b');
    assert.equal(findRouteById([{ id: 'a' }], 'x'), null);
  });

  it('builds switcher items with active count override', () => {
    const items = routeSwitcherItems([
      { id: 'a', name: 'A', deliveries: [{}, {}] },
      { id: 'b', name: 'B', deliveries: [{}] }
    ], 'a', 5);
    assert.deepEqual(items, [
      { id: 'a', name: 'A', count: 5, active: true },
      { id: 'b', name: 'B', count: 1, active: false }
    ]);
  });
});

describe('renameRouteInList', () => {
  it('sanitizes and renames', () => {
    const result = renameRouteInList(
      [{ id: 'a', name: 'Old' }, { id: 'b', name: 'B' }],
      'a',
      '  Centro   manhã  '
    );
    assert.equal(result.ok, true);
    assert.equal(result.name, 'Centro manhã');
    assert.equal(result.routes[0].name, 'Centro manhã');
    assert.equal(result.routes[1].name, 'B');
  });

  it('rejects empty names', () => {
    assert.equal(renameRouteInList([{ id: 'a', name: 'A' }], 'a', '   ').ok, false);
  });

  it('rejects missing ids', () => {
    assert.equal(renameRouteInList([{ id: 'a', name: 'A' }], 'x', 'Novo').ok, false);
  });

  it('sanitizeRouteName truncates', () => {
    assert.equal(sanitizeRouteName('x'.repeat(50)).length, 40);
  });
});

describe('appendEmptyRoute', () => {
  it('keeps previous route and appends a new empty one', () => {
    let n = 0;
    const create = (name) => {
      n += 1;
      return emptyRoute(name || `Nova ${n}`);
    };
    const out = appendEmptyRoute({
      routes: [{ id: 'a', name: 'Atual', deliveries: [{ id: 1 }], nextSequenceNumber: 2 }],
      activeRouteId: 'a',
      deliveries: [{ id: 1 }],
      nextSequenceNumber: 2,
      routeActive: false,
      routeMetrics: null
    }, create);
    assert.equal(out.previousName, 'Atual');
    assert.equal(out.routes.length, 2);
    assert.equal(out.route.deliveries.length, 0);
    assert.equal(out.routes[0].deliveries.length, 1);
  });
});
