'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HISTORY_MAX_DAYS,
  localDateKey,
  formatHistoryDate,
  routeDayStats,
  snapshotDeliveriesForHistory,
  prependHistoryDay,
  attachHistoryEconomics
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
    ]), {
      total: 4, entregue: 1, falhou: 1, pendente: 2,
      comTempo: 0, tempoTotalMs: 0, tempoMedioMs: null
    });
    assert.deepEqual(routeDayStats(null), {
      total: 0, entregue: 0, falhou: 0, pendente: 0,
      comTempo: 0, tempoTotalMs: 0, tempoMedioMs: null
    });
  });

  it('soma o tempo só das entregas com cronômetro fechado (patch 14)', () => {
    const s = routeDayStats([
      { status: 'entregue', duracaoMs: 7 * 60000 },
      { status: 'falhou', duracaoMs: 3 * 60000 },
      { status: 'em-rota', iniciadaEm: Date.now() },
      { status: 'pendente' }
    ]);
    assert.equal(s.comTempo, 2);
    assert.equal(s.tempoTotalMs, 10 * 60000);
    assert.equal(s.tempoMedioMs, 5 * 60000);
  });

  it('dias arquivados antes do patch 14 não quebram (sem duração)', () => {
    const s = routeDayStats([{ status: 'entregue' }, { status: 'falhou' }]);
    assert.equal(s.tempoTotalMs, 0);
    assert.equal(s.tempoMedioMs, null);
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

describe('attachHistoryEconomics', () => {
  it('stores economics snapshot on the history entry', () => {
    const entry = { id: 'h1', date: '2026-10-05' };
    attachHistoryEconomics(entry, {
      km: 52,
      fuelCost: 19.8,
      revenue: 220,
      netProfit: 200.2,
      meters: 52000,
      message: 'ok'
    });
    assert.equal(entry.economics.km, 52);
    assert.equal(entry.economics.message, 'ok');
  });
});
