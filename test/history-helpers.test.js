'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HISTORY_MAX_DAYS,
  localDateKey,
  formatHistoryDate,
  routeDayStats,
  snapshotDeliveriesForHistory,
  prependHistoryDay
} = require('../lib/history-helpers.js');

describe('localDateKey / formatHistoryDate', () => {
  it('formats a local YYYY-MM-DD key', () => {
    assert.equal(localDateKey(new Date(2026, 8, 4)), '2026-09-04');
    assert.match(formatHistoryDate('2026-09-04'), /2026/);
    assert.equal(formatHistoryDate(''), '—');
  });
});

describe('routeDayStats', () => {
  it('counts delivered, failed and pending', () => {
    assert.deepEqual(routeDayStats([
      { status: 'entregue' },
      { status: 'falhou' },
      { status: 'pendente' },
      { status: 'em-rota' }
    ]), { total: 4, entregue: 1, falhou: 1, pendente: 2 });
    assert.deepEqual(routeDayStats(null), { total: 0, entregue: 0, falhou: 0, pendente: 0 });
  });
});

describe('snapshotDeliveriesForHistory', () => {
  it('strips photos and keeps photoIds', () => {
    const out = snapshotDeliveriesForHistory([
      { id: 1, status: 'entregue', photos: ['data:x'], photoIds: ['p1'], voltarDepois: true, failReason: 'ausente' }
    ]);
    assert.equal(out[0].photos, undefined);
    assert.deepEqual(out[0].photoIds, ['p1']);
    assert.equal(out[0].voltarDepois, true);
    assert.equal(out[0].failReason, 'ausente');
  });
});

describe('prependHistoryDay', () => {
  it('replaces the same date and caps at HISTORY_MAX_DAYS', () => {
    const old = { id: 'old', date: '2026-09-04' };
    const next = { id: 'new', date: '2026-09-04' };
    const out = prependHistoryDay([old, { id: 'other', date: '2026-09-03' }], next);
    assert.equal(out[0].id, 'new');
    assert.equal(out.length, 2);
    assert.equal(HISTORY_MAX_DAYS, 30);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: 'h' + i, date: '2026-01-' + String(i + 1).padStart(2, '0') }));
    assert.equal(prependHistoryDay(many, { id: 'x', date: '2026-10-01' }).length, 30);
  });
});
