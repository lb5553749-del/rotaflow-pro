'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultActiveFilters,
  extractDistrict,
  availableDistricts,
  applyAdvancedFilters,
  hasActiveFilters,
  countActiveFilters,
  setFilterValue,
  toggleArrayFilter,
  cloneFilters,
  loadSavedFilters,
  persistSavedFilters
} = require('../lib/advanced-filters-helpers.js');

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    _data: data
  };
}

const ROUTE = [
  { id: 1, nome: 'Ana', endereco: 'Rua das Flores, 100, Centro', status: 'pendente', photoIds: ['p1'] },
  { id: 2, nome: 'Bruno', endereco: 'Av. Brasil, 45, Caiari', status: 'entregue', photos: ['x'] },
  { id: 3, nome: 'Carla', endereco: 'Rua 7, 9, Centro', status: 'falhou', failReason: 'ausente', priority: true },
  { id: 4, nome: 'Davi', endereco: 'Quadra 12, casa 3', status: 'em-rota' }
];

describe('extractDistrict / availableDistricts', () => {
  it('takes the last part of "Rua, número, bairro"', () => {
    assert.equal(extractDistrict('Rua das Flores, 100, Centro'), 'Centro');
    assert.equal(extractDistrict('Av. Brasil, 45, Caiari'), 'Caiari');
  });

  it('returns empty for addresses without a district', () => {
    assert.equal(extractDistrict('Rua sem virgula'), '');
    assert.equal(extractDistrict(''), '');
    assert.equal(extractDistrict(null), '');
  });

  it('treats a 2-part address as district only when the last part is not a number', () => {
    assert.equal(extractDistrict('Rua das Flores, Centro'), 'Centro');
    assert.equal(extractDistrict('Rua das Flores, 100'), '');
    assert.equal(extractDistrict('Av. Brasil, s/n'), '');
    assert.equal(extractDistrict('Quadra 12, casa 3'), '');
  });

  it('lists unique sorted districts', () => {
    assert.deepEqual(availableDistricts(ROUTE), ['Caiari', 'Centro']);
    assert.deepEqual(availableDistricts([]), []);
    assert.deepEqual(availableDistricts(null), []);
  });
});

describe('applyAdvancedFilters', () => {
  it('keeps everything when no filter is active', () => {
    assert.equal(applyAdvancedFilters(ROUTE, defaultActiveFilters()).length, 4);
    assert.equal(applyAdvancedFilters(ROUTE, null).length, 4);
  });

  it('does not mutate the input list', () => {
    const before = ROUTE.slice();
    applyAdvancedFilters(ROUTE, { search: 'ana' });
    assert.deepEqual(ROUTE, before);
  });

  it('filters by status (multi-select)', () => {
    const a = { ...defaultActiveFilters(), status: ['pendente', 'falhou'] };
    const out = applyAdvancedFilters(ROUTE, a);
    assert.deepEqual(out.map((d) => d.id), [1, 3]);
  });

  it('filters by free text (accent and number aware)', () => {
    const a = { ...defaultActiveFilters(), search: 'ana' };
    assert.deepEqual(applyAdvancedFilters(ROUTE, a).map((d) => d.id), [1]);
  });

  it('filters by district case-insensitively', () => {
    const a = { ...defaultActiveFilters(), district: ['centro'] };
    assert.deepEqual(applyAdvancedFilters(ROUTE, a).map((d) => d.id), [1, 3]);
  });

  it('filters by priority', () => {
    const high = applyAdvancedFilters(ROUTE, { ...defaultActiveFilters(), priority: 'high' });
    assert.deepEqual(high.map((d) => d.id), [3]);
    const normal = applyAdvancedFilters(ROUTE, { ...defaultActiveFilters(), priority: 'normal' });
    assert.deepEqual(normal.map((d) => d.id), [1, 2, 4]);
  });

  it('counts photos from photoIds first, then photos', () => {
    const withPhotos = applyAdvancedFilters(ROUTE, { ...defaultActiveFilters(), hasPhotos: true });
    assert.deepEqual(withPhotos.map((d) => d.id), [1, 2]);
    const without = applyAdvancedFilters(ROUTE, { ...defaultActiveFilters(), hasPhotos: false });
    assert.deepEqual(without.map((d) => d.id), [3, 4]);
  });

  it('filters by fail reason only on failed deliveries', () => {
    const a = { ...defaultActiveFilters(), failReason: ['ausente'] };
    assert.deepEqual(applyAdvancedFilters(ROUTE, a).map((d) => d.id), [3]);
    // entrega pendente com mesmo failReason não entra
    const b = applyAdvancedFilters(
      [...ROUTE, { id: 5, endereco: 'Rua 1', status: 'pendente', failReason: 'ausente' }], a
    );
    assert.deepEqual(b.map((d) => d.id), [3]);
  });

  it('combines filters conjunctively', () => {
    const a = { ...defaultActiveFilters(), status: ['pendente', 'em-rota'], district: ['centro'] };
    assert.deepEqual(applyAdvancedFilters(ROUTE, a).map((d) => d.id), [1]);
  });
});

describe('hasActiveFilters / countActiveFilters', () => {
  it('reports an empty state as inactive', () => {
    assert.equal(hasActiveFilters(defaultActiveFilters()), false);
    assert.equal(countActiveFilters(defaultActiveFilters()), 0);
  });

  it('counts each active filter dimension once', () => {
    const a = { ...defaultActiveFilters(), search: 'ana', status: ['pendente'], priority: 'high', hasPhotos: true };
    assert.equal(hasActiveFilters(a), true);
    assert.equal(countActiveFilters(a), 4);
  });

  it('ignores empty arrays', () => {
    const a = { ...defaultActiveFilters(), status: [], district: [] };
    assert.equal(hasActiveFilters(a), false);
  });
});

describe('setFilterValue / toggleArrayFilter', () => {
  it('sets known keys and ignores unknown ones', () => {
    const a = defaultActiveFilters();
    setFilterValue(a, 'search', 'x');
    assert.equal(a.search, 'x');
    setFilterValue(a, 'bogus', 1);
    assert.ok(!('bogus' in a));
  });

  it('toggles array values on and off', () => {
    const a = defaultActiveFilters();
    toggleArrayFilter(a, 'status', 'pendente');
    assert.deepEqual(a.status, ['pendente']);
    toggleArrayFilter(a, 'status', 'pendente');
    assert.deepEqual(a.status, []);
  });

  it('is a no-op for non-array keys', () => {
    const a = defaultActiveFilters();
    toggleArrayFilter(a, 'search', 'x');
    assert.equal(a.search, '');
  });
});

describe('cloneFilters', () => {
  it('deep-clones so presets never alias the live state', () => {
    const a = defaultActiveFilters();
    a.status.push('pendente');
    const c = cloneFilters(a);
    c.status.push('entregue');
    assert.deepEqual(a.status, ['pendente']);
    assert.deepEqual(c.status, ['pendente', 'entregue']);
  });

  it('falls back to defaults for falsy input', () => {
    assert.deepEqual(cloneFilters(null), defaultActiveFilters());
  });
});

describe('preset persistence', () => {
  it('round-trips presets through an injected storage', () => {
    const s = memoryStorage();
    const saved = { trabalho: defaultActiveFilters() };
    persistSavedFilters(s, saved);
    assert.deepEqual(loadSavedFilters(s), saved);
  });

  it('returns an empty object when storage is missing or unreadable', () => {
    assert.deepEqual(loadSavedFilters(null), {});
    const broken = { getItem() { throw new Error('denied'); } };
    assert.deepEqual(loadSavedFilters(broken), {});
  });

  it('never throws when persisting fails', () => {
    const broken = { setItem() { throw new Error('denied'); } };
    assert.doesNotThrow(() => persistSavedFilters(broken, { a: 1 }));
  });
});
