'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { migrateTelefones, migrateFavorito } = require('../lib/migrate-helpers.js');

describe('migrateTelefones', () => {
  it('converts string[] telefones and legacy telefone field', () => {
    const obj = { telefones: ['69999999999'], telefone: '69888888888' };
    migrateTelefones(obj);
    assert.equal(obj.telefone, undefined);
    assert.ok(Array.isArray(obj.telefones));
    assert.equal(obj.telefones.length, 2);
    assert.equal(typeof obj.telefones[0].numero, 'string');
  });

  it('handles null/empty without throwing', () => {
    assert.equal(migrateTelefones(null), undefined);
    const empty = {};
    migrateTelefones(empty);
    assert.deepEqual(empty.telefones, []);
  });
});

describe('migrateFavorito', () => {
  it('defaults missing favorito to false', () => {
    const obj = {};
    migrateFavorito(obj);
    assert.equal(obj.favorito, false);
    const kept = { favorito: true };
    migrateFavorito(kept);
    assert.equal(kept.favorito, true);
  });
});
