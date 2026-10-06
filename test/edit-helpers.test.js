'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  alignPhotoIdArray,
  photoSlotsLeft,
  collectPhonesFromPairs,
  isValidEditNameAddress,
  applyDeliveryUpdatedFields,
  mergeAgendaItemFields,
  deliveryStatusOptionsHtml,
  parsePacotesInput
} = require('../lib/edit-helpers.js');

describe('alignPhotoIdArray', () => {
  it('pads ids to photos length with null', () => {
    assert.deepEqual(alignPhotoIdArray(['a', 'b'], ['id1']), ['id1', null]);
    assert.deepEqual(alignPhotoIdArray([], null), []);
  });
});

describe('photoSlotsLeft', () => {
  it('counts remaining slots', () => {
    assert.equal(photoSlotsLeft(['a', null, 'b'], 5), 3);
    assert.equal(photoSlotsLeft(null, 3), 3);
    assert.equal(photoSlotsLeft(['a', 'b', 'c'], 3), 0);
  });
});

describe('collectPhonesFromPairs', () => {
  const format = (raw) => (raw && raw.length >= 8 ? `fmt:${raw}` : '');
  it('skips empty/invalid and keeps labels', () => {
    assert.deepEqual(
      collectPhonesFromPairs(['Casa', ''], ['69999999999', '1'], format),
      [{ numero: 'fmt:69999999999', label: 'Casa' }]
    );
  });
  it('handles empty lists', () => {
    assert.deepEqual(collectPhonesFromPairs(null, null, format), []);
  });
});

describe('isValidEditNameAddress', () => {
  it('requires both fields', () => {
    assert.equal(isValidEditNameAddress('Ana', 'Rua 1'), true);
    assert.equal(isValidEditNameAddress('  ', 'Rua 1'), false);
    assert.equal(isValidEditNameAddress('Ana', ''), false);
  });
});

describe('applyDeliveryUpdatedFields', () => {
  it('mutates delivery and reports address change', () => {
    const d = {
      nome: 'A',
      endereco: 'Rua Velha',
      telefones: [],
      pacotes: 1,
      status: 'pendente'
    };
    const info = applyDeliveryUpdatedFields(d, {
      nome: 'B',
      endereco: 'Rua Nova',
      telefones: [{ numero: '1', label: '' }],
      pacotes: 2,
      status: 'em-rota',
      photos: ['p'],
      photoIds: ['id'],
      notes: 'ok'
    });
    assert.equal(info.oldAddress, 'Rua Velha');
    assert.equal(info.addressChanged, true);
    assert.equal(d.nome, 'B');
    assert.equal(d.endereco, 'Rua Nova');
    assert.equal(d.pacotes, 2);
    assert.deepEqual(d.photoIds, ['id']);
    assert.equal(d.notes, 'ok');
  });
});

describe('mergeAgendaItemFields', () => {
  it('merges and applies coords', () => {
    const next = mergeAgendaItemFields(
      { agendaId: 1, nome: 'X', endereco: 'A' },
      { nome: 'Y', endereco: 'B' },
      { lat: 1.5, lng: -2.5 }
    );
    assert.equal(next.agendaId, 1);
    assert.equal(next.nome, 'Y');
    assert.equal(next.lat, 1.5);
    assert.equal(next.lng, -2.5);
  });
});

describe('deliveryStatusOptionsHtml / parsePacotesInput', () => {
  it('marks selected status', () => {
    const html = deliveryStatusOptionsHtml('entregue');
    assert.match(html, /<option selected>entregue<\/option>/);
    assert.match(html, /<option >pendente<\/option>/);
  });
  it('parses pacotes with fallback (parseInt || fallback)', () => {
    assert.equal(parsePacotesInput('3'), 3);
    assert.equal(parsePacotesInput('0', 1), 1);
    assert.equal(parsePacotesInput('x', 2), 2);
    assert.equal(parsePacotesInput('-2', 1), -2);
  });
});
