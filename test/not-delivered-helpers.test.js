'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  countNormalActiveStops,
  getVoltarDepoisStops,
  shouldNotifyVoltarDepois
} = require('../lib/not-delivered-helpers.js');

const isActive = (d) => d && d.status !== 'entregue' && d.status !== 'falhou';

describe('countNormalActiveStops', () => {
  it('counts active stops that are not postponed', () => {
    const list = [
      { status: 'pendente', voltarDepois: false },
      { status: 'pendente', voltarDepois: true },
      { status: 'entregue', voltarDepois: false }
    ];
    assert.equal(countNormalActiveStops(list, isActive), 1);
  });

  it('handles null/empty without throwing', () => {
    assert.equal(countNormalActiveStops(null, isActive), 0);
    assert.equal(countNormalActiveStops([], isActive), 0);
  });
});

describe('getVoltarDepoisStops', () => {
  it('returns only active postponed stops', () => {
    const list = [
      { id: 1, status: 'pendente', voltarDepois: true },
      { id: 2, status: 'falhou', voltarDepois: true },
      { id: 3, status: 'pendente', voltarDepois: false }
    ];
    assert.deepEqual(getVoltarDepoisStops(list, isActive).map((d) => d.id), [1]);
  });
});

describe('shouldNotifyVoltarDepois', () => {
  it('fires only when leaving 2+ normals for 1/0 with postponed stops', () => {
    assert.equal(shouldNotifyVoltarDepois({
      normalsBefore: 2, normalsAfter: 1, alreadyShown: false, postponedCount: 1
    }), true);
    assert.equal(shouldNotifyVoltarDepois({
      normalsBefore: 2, normalsAfter: 1, alreadyShown: true, postponedCount: 1
    }), false);
    assert.equal(shouldNotifyVoltarDepois({
      normalsBefore: 1, normalsAfter: 0, alreadyShown: false, postponedCount: 1
    }), false);
    assert.equal(shouldNotifyVoltarDepois({
      normalsBefore: 3, normalsAfter: 1, alreadyShown: false, postponedCount: 0
    }), false);
  });
});
