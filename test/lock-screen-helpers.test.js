'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { lockScreenStopPayload } = require('../lib/lock-screen-helpers.js');

describe('lockScreenStopPayload', () => {
  it('returns null for missing or finished deliveries', () => {
    assert.equal(lockScreenStopPayload(null), null);
    assert.equal(lockScreenStopPayload(undefined), null);
    assert.equal(lockScreenStopPayload({ status: 'entregue', sequentialId: 1 }), null);
    assert.equal(lockScreenStopPayload({ status: 'falhou', sequentialId: 1 }), null);
  });

  it('builds title/body with name and plural pacotes', () => {
    const payload = lockScreenStopPayload({
      status: 'pendente',
      sequentialId: 7,
      pacotes: 3,
      nome: '  Ana  ',
      endereco: 'Rua A, 10, Centro'
    });
    assert.deepEqual(payload, {
      title: 'Indo para 7 · 3 pacotes',
      body: 'Ana · Rua A, 10'
    });
  });

  it('uses street-only body and singular pacote defaults', () => {
    const payload = lockScreenStopPayload({
      status: 'pendente',
      endereco: 'Av. Brasil, 100'
    });
    assert.equal(payload.title, 'Indo para — · 1 pacote');
    assert.equal(payload.body, 'Av. Brasil, 100');
  });

  it('uses em-dash street when address is empty (legacy shortStreetAddress)', () => {
    const payload = lockScreenStopPayload({ status: 'pendente', sequentialId: 2 });
    assert.deepEqual(payload, {
      title: 'Indo para 2 · 1 pacote',
      body: '—'
    });
  });
});
