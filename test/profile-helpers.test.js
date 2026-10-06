'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatLastBackupLabel,
  applyProfileFormValues
} = require('../lib/profile-helpers.js');

describe('formatLastBackupLabel', () => {
  it('returns empty-state copy when there is no backup', () => {
    assert.equal(formatLastBackupLabel(null), 'Nenhum backup registrado neste aparelho');
    assert.equal(formatLastBackupLabel({}), 'Nenhum backup registrado neste aparelho');
  });

  it('formats lastBackupAt with the injected formatter', () => {
    const label = formatLastBackupLabel(
      { lastBackupAt: 1700000000000 },
      () => '01/01/2024, 12:00:00'
    );
    assert.equal(label, 'Último: 01/01/2024, 12:00:00');
  });
});

describe('applyProfileFormValues', () => {
  it('trims fields and applies defaults', () => {
    const profile = { motorista: 'Old', empresa: 'OldCo', mensagemPadrao: 'Oi' };
    applyProfileFormValues(profile, {
      motorista: '  Ana  ',
      empresa: '',
      mensagemPadrao: '  Nova msg  '
    }, 'Correx');
    assert.equal(profile.motorista, 'Ana');
    assert.equal(profile.empresa, 'Correx');
    assert.equal(profile.mensagemPadrao, 'Nova msg');
  });

  it('keeps previous mensagem when the field is blank', () => {
    const profile = { motorista: 'X', empresa: 'Y', mensagemPadrao: 'Keep me' };
    applyProfileFormValues(profile, {
      motorista: '',
      empresa: 'Acme',
      mensagemPadrao: '   '
    }, 'Padrao');
    assert.equal(profile.motorista, 'Motorista');
    assert.equal(profile.empresa, 'Acme');
    assert.equal(profile.mensagemPadrao, 'Keep me');
  });

  it('stores fuel cost prefs from the profile form', () => {
    const profile = { motorista: 'A', empresa: 'B', mensagemPadrao: 'Oi' };
    applyProfileFormValues(profile, {
      motorista: 'A',
      empresa: 'B',
      mensagemPadrao: 'Oi',
      consumoKmL: '11,5',
      precoCombustivel: '6.20',
      valorPadraoEntrega: '18'
    }, 'Padrao');
    assert.equal(profile.consumoKmL, 11.5);
    assert.equal(profile.precoCombustivel, 6.2);
    assert.equal(profile.valorPadraoEntrega, 18);
  });
});
