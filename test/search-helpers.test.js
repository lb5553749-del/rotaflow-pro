'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSearchText,
  buildDeliverySearchText,
  matchDeliveryQuery,
  filterDeliveriesByText
} = require('../lib/search-helpers.js');

const makeDelivery = (overrides = {}) => ({
  id: 101,
  sequentialId: 3,
  nome: 'João Silva',
  endereco: 'Rua das Flores, 123, Centro, Porto Velho',
  telefones: [{ numero: '(69) 99999-8888', label: 'casa' }],
  notes: 'deixar com o porteiro',
  ...overrides
});

describe('normalizeSearchText', () => {
  it('strips accents and lowercases', () => {
    assert.equal(normalizeSearchText('Rua das Flores'), 'rua das flores');
    assert.equal(normalizeSearchText('João'), 'joao');
    assert.equal(normalizeSearchText('Não'), 'nao');
  });

  it('turns separator punctuation into spaces and collapses them', () => {
    assert.equal(normalizeSearchText('Rua, 123; Centro'), 'rua 123 centro');
    assert.equal(normalizeSearchText('Apto  12 / Bloco B'), 'apto 12 bloco b');
  });

  it('handles null / undefined / numbers without throwing', () => {
    assert.equal(normalizeSearchText(null), '');
    assert.equal(normalizeSearchText(undefined), '');
    assert.equal(normalizeSearchText(42), '42');
  });
});

describe('buildDeliverySearchText', () => {
  it('joins name, address, notes, ids and phone numbers', () => {
    const text = buildDeliverySearchText(makeDelivery());
    assert.match(text, /joao silva/);
    assert.match(text, /rua das flores 123 centro porto velho/);
    assert.match(text, /\(69\) 99999-8888/);
    assert.match(text, /deixar com o porteiro/);
  });

  it('never yields the literal token "undefined"', () => {
    const text = buildDeliverySearchText({ id: 1 });
    assert.ok(!text.includes('undefined'), text);
    assert.ok(!text.includes('null'), text);
  });

  it('returns empty string for null / undefined delivery', () => {
    assert.equal(buildDeliverySearchText(null), '');
    assert.equal(buildDeliverySearchText(undefined), '');
  });

  it('handles deliveries without phones or with malformed entries', () => {
    assert.doesNotThrow(() => buildDeliverySearchText({ nome: 'x' }));
    assert.doesNotThrow(() => buildDeliverySearchText({ nome: 'x', telefones: [null, { label: 'só label' }] }));
  });
});

describe('matchDeliveryQuery', () => {
  it('matches name, address and notes', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), 'joao'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'silva'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'rua das flores'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'porteiro'), true);
  });

  it('matches the house number embedded in the address', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), '123'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'flores 123'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), '123 centro'), true);
  });

  it('matches phone number digits in any shape', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), '99999'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), '99999-8888'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), '69 99999'), true);
  });

  it('matches ignoring accents and case', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), 'JOAO'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'rua das flores'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'FLores, 123'), true);
  });

  it('requires every token to be present', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), 'joao flores'), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), 'joao inexistente'), false);
    assert.equal(matchDeliveryQuery(makeDelivery(), '99999 77777'), false);
  });

  it('matches sequentialId', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), '3'), true);
  });

  it('empty query matches everything', () => {
    assert.equal(matchDeliveryQuery(makeDelivery(), ''), true);
    assert.equal(matchDeliveryQuery(makeDelivery(), '   '), true);
  });
});

describe('filterDeliveriesByText', () => {
  const list = [
    { id: 1, sequentialId: 1, nome: 'João Silva', endereco: 'Rua das Flores, 123, Centro', telefones: [{ numero: '(69) 99999-8888' }], notes: 'deixar com o porteiro' },
    { id: 2, sequentialId: 2, nome: 'Maria Souza', endereco: 'Av. Brasil, 456, Norte', telefones: [{ numero: '(69) 98888-7777' }], notes: '' },
    { id: 3, sequentialId: 3, nome: 'Casa', endereco: 'Rua das Flores, 999, Centro', telefones: [] }
  ];

  it('returns a shallow copy when query is empty', () => {
    const filtered = filterDeliveriesByText(list, '');
    assert.equal(filtered.length, list.length);
    assert.notEqual(filtered, list);
  });

  it('filters by the house number in the address', () => {
    assert.deepEqual(filterDeliveriesByText(list, '123').map((d) => d.id), [1]);
    assert.deepEqual(filterDeliveriesByText(list, '456').map((d) => d.id), [2]);
  });

  it('number tokens also match digits inside phone numbers', () => {
    // "999" aparece no telefone do id 1 e no endereco do id 3
    assert.deepEqual(filterDeliveriesByText(list, '999').map((d) => d.id), [1, 3]);
  });

  it('filters by street name and keeps original order', () => {
    assert.deepEqual(filterDeliveriesByText(list, 'flores').map((d) => d.id), [1, 3]);
    assert.deepEqual(filterDeliveriesByText(list, 'flores 123').map((d) => d.id), [1]);
  });

  it('filters by name ignoring accents and case', () => {
    assert.deepEqual(filterDeliveriesByText(list, 'joao').map((d) => d.id), [1]);
    assert.deepEqual(filterDeliveriesByText(list, 'MARIA').map((d) => d.id), [2]);
  });

  it('filters by phone digits', () => {
    assert.deepEqual(filterDeliveriesByText(list, '99999').map((d) => d.id), [1]);
    assert.deepEqual(filterDeliveriesByText(list, '98888').map((d) => d.id), [2]);
  });

  it('filters by notes', () => {
    assert.deepEqual(filterDeliveriesByText(list, 'porteiro').map((d) => d.id), [1]);
  });

  it('handles non-array input', () => {
    assert.deepEqual(filterDeliveriesByText(null, 'x'), []);
    assert.deepEqual(filterDeliveriesByText(undefined, 'x'), []);
  });

  it('does not crash on deliveries missing fields', () => {
    assert.doesNotThrow(() => filterDeliveriesByText([{}], 'x'));
    assert.equal(filterDeliveriesByText([{}], 'x').length, 0);
  });
});
