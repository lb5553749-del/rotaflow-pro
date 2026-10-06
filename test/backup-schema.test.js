'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseBackupPayload, parseAgendaBackup, sanitizeDeliveryLike } = require('../lib/backup-schema.js');

describe('parseBackupPayload', () => {
  it('accepts a routes + agenda backup', () => {
    const out = parseBackupPayload({
      agenda: [{ id: 1, nome: 'A', endereco: 'Rua 1', lat: '-8.7', lng: '-63.9' }],
      routes: [{ id: 'r1', name: 'Rota 1', deliveries: [{ id: 2, sequentialId: 'A1', lat: 1, lng: 2 }] }],
      nextSequenceNumber: 3,
      userProfile: { motorista: 'João', empresa: 'Correx' }
    });
    assert.equal(out.ok, true);
    assert.equal(out.data.agenda[0].lat, -8.7);
    assert.equal(out.data.routes[0].deliveries[0].sequentialId, 'A1');
    assert.equal(out.data.userProfile.motorista, 'João');
  });

  it('rejects payloads without agenda or deliveries/routes', () => {
    assert.equal(parseBackupPayload(null).ok, false);
    assert.equal(parseBackupPayload({ agenda: [] }).ok, false);
    assert.equal(parseBackupPayload({ deliveries: [] }).ok, false);
  });
});

describe('sanitizeDeliveryLike', () => {
  it('neutralizes a hostile sequentialId and status', () => {
    const item = sanitizeDeliveryLike({
      id: 9,
      sequentialId: '<img src=x onerror=alert(1)>',
      status: '<img src=x>',
      nome: 12
    });
    assert.equal(item.sequentialId.includes('<'), true);
    assert.equal(item.status, 'pendente');
    assert.equal(item.nome, '12');
    assert.equal(item.photos.length, 0);
  });
});

describe('sanitizeDeliveryLike agenda rows', () => {
  it('keeps an agenda item that only has agendaId', () => {
    const item = sanitizeDeliveryLike({ agendaId: 4, nome: 'Loja', endereco: 'Rua 2' });
    assert.equal(item.agendaId, 4);
    assert.equal(item.nome, 'Loja');
    assert.equal(item.status, 'pendente');
  });
});

describe('parseAgendaBackup', () => {
  it('requires an agenda array', () => {
    assert.equal(parseAgendaBackup({}).ok, false);
    const out = parseAgendaBackup({ agenda: [{ id: 1, nome: 'B' }], nextAgendaId: 4 });
    assert.equal(out.ok, true);
    assert.equal(out.data.nextAgendaId, 4);
  });
});
