'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isActiveStop,
  isPreferredNextStop,
  findNextInSequence,
  deliveryProgressInfo,
  dayProgressBar,
  deliveryPhotoCount,
  shouldKeepPanelMinimized,
  adjacentIndexResult,
  panelOpenClassPlan,
  panelCloseClassPlan,
  formatPanelPhonesText,
  panelMiniPhotoUiState,
  resolvePanelSwipeGesture,
  panelActionFlags
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

describe('dayProgressBar', () => {
  it('counts only delivered stops as done', () => {
    assert.deepEqual(dayProgressBar({ total: 15, entregue: 8, falhou: 2, pendente: 5 }), {
      done: 8, total: 15, pct: 53, label: '8 de 15 entregas'
    });
  });

  it('ignores failures in the percentage', () => {
    // 8 entregues + 7 falhas: a barra não trata falha como entrega concluída
    assert.equal(dayProgressBar({ total: 15, entregue: 8, falhou: 7, pendente: 0 }).pct, 53);
  });

  it('clamps at 100% and marks a complete route', () => {
    assert.equal(dayProgressBar({ total: 4, entregue: 4, falhou: 0, pendente: 0 }).pct, 100);
  });

  it('pluralizes the label for a single-delivery route', () => {
    assert.equal(dayProgressBar({ total: 1, entregue: 0, falhou: 0, pendente: 1 }).label, '0 de 1 entrega');
  });

  it('handles empty and malformed stats', () => {
    assert.deepEqual(dayProgressBar({ total: 0, entregue: 0, falhou: 0, pendente: 0 }), {
      done: 0, total: 0, pct: 0, label: '0 de 0 entregas'
    });
    assert.deepEqual(dayProgressBar(null), { done: 0, total: 0, pct: 0, label: '0 de 0 entregas' });
    assert.deepEqual(dayProgressBar(undefined), { done: 0, total: 0, pct: 0, label: '0 de 0 entregas' });
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

describe('formatPanelPhonesText / panelMiniPhotoUiState', () => {
  it('formats phones or fallback', () => {
    assert.equal(formatPanelPhonesText(null), 'Não informado');
    assert.equal(
      formatPanelPhonesText([{ label: 'Cel', numero: '69999990000' }], (n) => `F:${n}`),
      'Cel: F:69999990000'
    );
  });

  it('builds mini photo UI state from count', () => {
    assert.equal(panelMiniPhotoUiState(0).miniHidden, true);
    assert.equal(panelMiniPhotoUiState(0).saveAgendaDisabled, true);
    assert.equal(panelMiniPhotoUiState(1).panelCountText, '1 foto');
    assert.equal(panelMiniPhotoUiState(3).miniTitle, '3 fotos nesta entrega');
  });
});

describe('resolvePanelSwipeGesture / panelActionFlags', () => {
  it('classifies vertical minimize/expand and horizontal next/prev', () => {
    assert.deepEqual(resolvePanelSwipeGesture(0, 80), { type: 'minimize' });
    assert.deepEqual(resolvePanelSwipeGesture(0, -80), { type: 'expand' });
    assert.deepEqual(resolvePanelSwipeGesture(-80, 0), { type: 'next' });
    assert.deepEqual(resolvePanelSwipeGesture(80, 0), { type: 'prev' });
    assert.equal(resolvePanelSwipeGesture(10, 10), null);
  });

  it('derives action flags from status / phone / coords', () => {
    const pending = panelActionFlags({ status: 'pendente', telefones: [{ numero: '1' }] }, true);
    assert.equal(pending.showNav, true);
    assert.equal(pending.showWhatsApp, true);
    assert.equal(pending.showFailDeliver, true);
    assert.equal(pending.hasDualCta, true);
    const done = panelActionFlags({ status: 'entregue', telefones: [] }, false);
    assert.equal(done.showUndo, true);
    assert.equal(done.showFailDeliver, false);
    assert.equal(done.showNav, false);
  });
});
