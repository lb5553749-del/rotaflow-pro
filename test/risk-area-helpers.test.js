'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  RISK_AREAS_PREF_KEY,
  RISK_LEVELS,
  normalizeRiskMatchText,
  normalizeRiskLevel,
  createRiskArea,
  normalizeRiskAreasList,
  readRiskAreasPref,
  writeRiskAreasPref,
  matchDeliveryRiskArea,
  riskPinColorForLevel,
  isDaytimeHours,
  preferDaytimeRiskOrder,
  summarizeRouteRisk,
  riskLevelBadgeLabel
} = require('../lib/risk-area-helpers.js');

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    get length() { return Object.keys(data).length; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    clear() { Object.keys(data).forEach((k) => delete data[k]); },
    key(i) { return Object.keys(data)[i] ?? null; },
    _data: data
  };
}

describe('normalizeRiskMatchText / level', () => {
  it('normalizes accents and level aliases', () => {
    assert.equal(normalizeRiskMatchText('São João Bosco'), 'sao joao bosco');
    assert.equal(normalizeRiskLevel('vermelho'), RISK_LEVELS.vermelho);
    assert.equal(normalizeRiskLevel('yellow'), RISK_LEVELS.amarelo);
    assert.equal(normalizeRiskLevel('x'), null);
  });
});

describe('persist risk areas', () => {
  it('creates, writes and reads prefs', () => {
    const s = memoryStorage();
    const area = createRiskArea('São João Bosco', 'vermelho');
    assert.ok(area);
    assert.equal(area.level, 'vermelho');
    writeRiskAreasPref(s, [area, { label: 'x', level: 'bad' }]);
    const list = readRiskAreasPref(s);
    assert.equal(list.length, 1);
    assert.equal(list[0].match, 'sao joao bosco');
    assert.ok(s.getItem(RISK_AREAS_PREF_KEY));
  });

  it('dedupes same match+level', () => {
    const list = normalizeRiskAreasList([
      { label: 'Centro', level: 'amarelo' },
      { label: 'centro', level: 'amarelo' },
      { label: 'Centro', level: 'vermelho' }
    ]);
    assert.equal(list.length, 2);
  });
});

describe('matchDeliveryRiskArea', () => {
  const areas = [
    createRiskArea('São João Bosco', 'amarelo'),
    createRiskArea('Tancredo Neves', 'vermelho')
  ];

  it('matches address text and prefers vermelho', () => {
    const hit = matchDeliveryRiskArea({
      endereco: 'Rua A, 10 - São João Bosco, Porto Velho'
    }, areas);
    assert.equal(hit.level, 'amarelo');

    const both = matchDeliveryRiskArea({
      endereco: 'Av Tancredo Neves, São João Bosco'
    }, areas);
    assert.equal(both.level, 'vermelho');
    assert.equal(matchDeliveryRiskArea({ endereco: 'Centro' }, areas), null);
  });
});

describe('daytime / optimize advice', () => {
  it('detects daytime hours and pin colors', () => {
    assert.equal(isDaytimeHours(new Date('2026-10-06T10:00:00')), true);
    assert.equal(isDaytimeHours(new Date('2026-10-06T22:00:00')), false);
    assert.equal(riskPinColorForLevel('vermelho'), '#B91C1C');
    assert.equal(riskPinColorForLevel('amarelo'), '#D97706');
    assert.equal(riskLevelBadgeLabel('vermelho'), 'Risco alto');
  });

  it('prefers vermelho stops earlier in daytime', () => {
    const areas = [createRiskArea('Perigo', 'vermelho')];
    const stops = [
      { id: 1, endereco: 'Rua Segura' },
      { id: 2, endereco: 'Rua Perigo, 1' },
      { id: 3, endereco: 'Outra' }
    ];
    const day = preferDaytimeRiskOrder(stops, areas, { daytime: true });
    assert.equal(day[0].id, 2);
    const night = preferDaytimeRiskOrder(stops, areas, { daytime: false });
    assert.equal(night[0].id, 1);
  });

  it('summarizes route risk with night warning', () => {
    const areas = [createRiskArea('Perigo', 'vermelho')];
    const stops = [{ id: 1, endereco: 'Rua Perigo' }];
    const night = summarizeRouteRisk(stops, areas, { now: new Date('2026-10-06T21:00:00') });
    assert.equal(night.redCount, 1);
    assert.equal(night.preferDaytimeNote, true);
    assert.match(night.toastMessage, /diurno/);
  });
});
