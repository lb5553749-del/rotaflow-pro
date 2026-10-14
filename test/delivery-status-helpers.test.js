'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyDeliveryStatusTransition } = require('../lib/delivery-status-helpers.js');

describe('applyDeliveryStatusTransition', () => {
  it('clears voltarDepois and failReason when marking delivered', () => {
    const d = { id: 1, status: 'pendente', voltarDepois: true, failReason: 'ausente' };
    applyDeliveryStatusTransition(d, 'entregue');
    assert.equal(d.status, 'entregue');
    assert.equal(d.voltarDepois, false);
    assert.ok(!('failReason' in d));
  });

  it('clears voltarDepois but keeps a chosen failReason when failing', () => {
    const d = { id: 2, status: 'em-rota', voltarDepois: true };
    applyDeliveryStatusTransition(d, 'falhou', { failReason: 'ausente' });
    assert.equal(d.status, 'falhou');
    assert.equal(d.voltarDepois, false);
    assert.equal(d.failReason, 'ausente');
  });

  it('preserves absentNotified only while failed with reason ausente', () => {
    // entrega falhou por ausente: o flag de "já avisou o cliente" sobrevive
    const ausente = { id: 3, status: 'pendente', absentNotified: true };
    applyDeliveryStatusTransition(ausente, 'falhou', { failReason: 'ausente' });
    assert.equal(ausente.absentNotified, true);

    // outro motivo de falha: o flag perde o sentido e é limpo
    const recusado = { id: 4, status: 'pendente', absentNotified: true };
    applyDeliveryStatusTransition(recusado, 'falhou', { failReason: 'recusado' });
    assert.ok(!('absentNotified' in recusado));

    // entregue: idem
    const entregue = { id: 5, status: 'pendente', absentNotified: true };
    applyDeliveryStatusTransition(entregue, 'entregue');
    assert.ok(!('absentNotified' in entregue));
  });

  it('drops deliveredNotified when leaving entregue', () => {
    const d = { id: 6, status: 'entregue', deliveredNotified: true };
    applyDeliveryStatusTransition(d, 'pendente');
    assert.equal(d.status, 'pendente');
    assert.ok(!('deliveredNotified' in d));
    // voltar para pendente não limpa failReason (só entregue limpa)
  });

  it('keeps deliveredNotified while staying entregue', () => {
    const d = { id: 7, status: 'em-rota', deliveredNotified: true };
    applyDeliveryStatusTransition(d, 'entregue');
    assert.equal(d.deliveredNotified, true);
  });

  it('leaves voltarDepois untouched for a non-terminal status', () => {
    // voltar-depois precisa do flag ativo: a transição canônica não o toca
    const d = { id: 8, status: 'pendente' };
    applyDeliveryStatusTransition(d, 'pendente', { failReason: 'voltar-depois' });
    d.voltarDepois = true;
    assert.equal(d.status, 'pendente');
    assert.equal(d.failReason, 'voltar-depois');
    assert.equal(d.voltarDepois, true);
  });

  it('is a no-op for null delivery or invalid status', () => {
    assert.equal(applyDeliveryStatusTransition(null, 'entregue'), null);
    const d = { id: 9, status: 'entregue' };
    applyDeliveryStatusTransition(d, 'cancelado');
    assert.equal(d.status, 'entregue');
  });
});
