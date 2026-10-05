'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isActiveStop,
  isPreferredNextStop,
  findNextInSequence,
  deliveryProgressInfo,
  deliveryPhotoCount,
  shouldKeepPanelMinimized,
  adjacentIndexResult,
  panelOpenClassPlan,
  panelCloseClassPlan
} = require('../lib/panel-helpers.js');

describe('isActiveStop / isPreferredNextStop', () => {
  it('treats delivered/failed as inactive', () => {
    assert.equal(isActiveStop({ status: 'pendente' }), true);
    assert.equal(isActiveStop({ status: 'entregue' }), false);
    assert.equal(isActiveStop({ status: 'falhou' }), false);
    assert.equal(isPreferredNextStop({ status: 'pendente', voltarDepois: true }), false);
    assert.equal(isPreferredNextStop({ status: 'pendente' }), true);
  });
});

describe('findNextInSequence / adjacentIndexResult', () => {
  const seq = [
    { id: 1, status: 'entregue' },
    { id: 2, status: 'pendente' },
    { id: 3, status: 'pendente' }
  ];

  it('finds next matching stop with optional wrap', () => {
    assert.equal(findNextInSequence(seq, 0, isActiveStop).id, 2);
    assert.equal(findNextInSequence(seq, 2, isActiveStop, { wrap: false }), null);
    assert.equal(findNextInSequence(seq, 2, isActiveStop, { wrap: true }).id, 2);
  });

  it('resolves adjacent indices without wrapping', () => {
    assert.deepEqual(adjacentIndexResult(-1, 1, 3), { ok: true, next: 0 });
    assert.deepEqual(adjacentIndexResult(0, -1, 3), { ok: false, reason: 'first' });
    assert.deepEqual(adjacentIndexResult(2, 1, 3), { ok: false, reason: 'last' });
    assert.deepEqual(adjacentIndexResult(1, 1, 3), { ok: true, next: 2 });
    assert.deepEqual(adjacentIndexResult(0, 1, 0), { ok: false, reason: 'empty' });
  });
});

describe('deliveryProgressInfo / photo count / class plans', () => {
  it('computes progress and photo counts', () => {
    const list = [
      { id: 'a', status: 'entregue', routeOrder: 1 },
      { id: 'b', status: 'pendente', routeOrder: 2, photoIds: ['p1', 'p2'] }
    ];
    assert.deepEqual(deliveryProgressInfo(list[1], list), { current: 2, total: 2, remaining: 1 });
    assert.equal(deliveryPhotoCount(list[1]), 2);
    assert.equal(deliveryPhotoCount({ photos: ['x'] }), 1);
    assert.equal(deliveryPhotoCount(null), 0);
  });

  it('keeps minimized when requested or already mini+open', () => {
    assert.equal(shouldKeepPanelMinimized(null, true), true);
    const panel = { classList: { contains: (c) => c === 'open' || c === 'minimized' } };
    assert.equal(shouldKeepPanelMinimized(panel, false), true);
    assert.equal(shouldKeepPanelMinimized({ classList: { contains: () => false } }, false), false);
  });

  it('plans open/close CSS classes', () => {
    assert.deepEqual(panelOpenClassPlan({ pacotes: 2 }, true), {
      open: true, minimized: true, redBg: true
    });
    assert.deepEqual(panelCloseClassPlan(), {
      open: false, minimized: false, redBg: false
    });
  });
});
