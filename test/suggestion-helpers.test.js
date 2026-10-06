'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  suggestionFieldRank,
  suggestionItemRank
} = require('../lib/suggestion-helpers.js');

describe('suggestionFieldRank', () => {
  it('returns sentinel when query empty or not found', () => {
    assert.equal(suggestionFieldRank('Maria', ''), 10000);
    assert.equal(suggestionFieldRank('Maria', 'xyz'), 10000);
    assert.equal(suggestionFieldRank(null, 'a'), 10000);
  });

  it('prefers exact match over prefix and substring', () => {
    assert.equal(suggestionFieldRank('ana', 'ana'), 0);
    assert.ok(suggestionFieldRank('ana silva', 'ana') > 0);
    assert.ok(suggestionFieldRank('joana', 'ana') > suggestionFieldRank('ana silva', 'ana'));
  });

  it('ranks numeric token boundaries better than longer-number prefixes', () => {
    const exactToken = suggestionFieldRank('casa 80', '80');
    const longerPrefix = suggestionFieldRank('8050', '80');
    assert.ok(exactToken < longerPrefix);
  });
});

describe('suggestionItemRank', () => {
  it('prefers nome match over endereco-only match', () => {
    const byNome = suggestionItemRank({ nome: 'Centro', endereco: 'Rua X' }, 'centro');
    const byEnd = suggestionItemRank({ nome: 'Outro', endereco: 'Centro 1' }, 'centro');
    assert.ok(byNome < byEnd);
  });

  it('handles null/empty item without throwing', () => {
    assert.equal(suggestionItemRank({}, 'x'), 10000);
    assert.equal(suggestionItemRank({ nome: '', endereco: '' }, ''), 10000);
  });
});
