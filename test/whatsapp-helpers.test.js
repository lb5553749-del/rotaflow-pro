'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  companyDisplayName,
  buildDeliveryWhatsAppMessage
} = require('../lib/whatsapp-helpers.js');

const PADRAO =
  'Olá {nome}! ({id} - {pacotes}) {endereco} {empresa} {obs}{link}';

describe('companyDisplayName', () => {
  it('prefers trimmed empresa from profile', () => {
    assert.equal(companyDisplayName({ empresa: '  Acme  ' }, 'Fallback'), 'Acme');
  });

  it('falls back when profile is empty', () => {
    assert.equal(companyDisplayName(null, 'Fallback'), 'Fallback');
    assert.equal(companyDisplayName({ empresa: '   ' }, 'Fallback'), 'Fallback');
  });
});

describe('buildDeliveryWhatsAppMessage', () => {
  const delivery = {
    nome: 'Maria',
    sequentialId: 12,
    pacotes: 2,
    endereco: 'Rua A, 1',
    notes: 'Interfone 2'
  };

  it('fills placeholders and appends track link when missing', () => {
    const msg = buildDeliveryWhatsAppMessage(
      delivery,
      { trackUrl: 'https://track.example/x' },
      { profile: { mensagemPadrao: PADRAO, empresa: 'Correx' }, empresaPadrao: 'X', mensagemPadrao: 'Y' }
    );
    assert.match(msg, /Olá Maria!/);
    assert.match(msg, /\(12 - 2\)/);
    assert.match(msg, /Rua A, 1/);
    assert.match(msg, /Correx/);
    assert.match(msg, /Obs: Interfone 2/);
    assert.match(msg, /https:\/\/track\.example\/x/);
  });

  it('handles null/empty delivery without throwing', () => {
    const msg = buildDeliveryWhatsAppMessage(
      null,
      {},
      { mensagemPadrao: 'Oi {nome} {id} {pacotes} {endereco} {empresa} {obs}{link}', empresaPadrao: 'Padrao' }
    );
    assert.equal(msg, 'Oi cliente null 1  Padrao');
  });

  it('strips legacy ETA lines from templates', () => {
    const msg = buildDeliveryWhatsAppMessage(
      delivery,
      {},
      {
        mensagemPadrao: 'Oi {nome}\n⏱ Faltam cerca de 10 min\nFim',
        empresaPadrao: 'X'
      }
    );
    assert.equal(msg, 'Oi Maria\nFim');
    assert.doesNotMatch(msg, /Faltam cerca de/);
  });
});
