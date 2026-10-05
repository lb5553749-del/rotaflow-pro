'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isMutedPin,
  pinTextColorFor,
  markerColorFor,
  hexToTint,
  markerScaleForActiveCount
} = require('../lib/map-helpers.js');

describe('isMutedPin / markerColorFor', () => {
  it('mutes delivered and failed stops', () => {
    assert.equal(isMutedPin({ status: 'entregue' }), true);
    assert.equal(isMutedPin({ status: 'falhou' }), true);
    assert.equal(isMutedPin({ status: 'pendente' }), false);
    assert.equal(isMutedPin(null), false);
  });

  it('colors by status and package count', () => {
    assert.equal(markerColorFor({ status: 'entregue' }), '#F1F3F4');
    assert.equal(markerColorFor({ status: 'falhou' }), '#EEF0F2');
    assert.equal(markerColorFor({ status: 'pendente', pacotes: 1 }), '#1A73E8');
    assert.equal(markerColorFor({ status: 'pendente', pacotes: 2 }), '#EF4444');
    assert.equal(markerColorFor(null), '#3b82f6');
  });
});

describe('pinTextColorFor / hexToTint / markerScaleForActiveCount', () => {
  it('uses muted text color for finished pins', () => {
    assert.equal(pinTextColorFor({ status: 'entregue' }, false), '#80868B');
    assert.equal(pinTextColorFor({ status: 'pendente' }, true), '#ffffff');
  });

  it('parses hex tints', () => {
    assert.deepEqual(hexToTint('#112233', 128), { r: 0x11, g: 0x22, b: 0x33, a: 128 });
    assert.equal(hexToTint('#abc').r, 0xaa);
  });

  it('scales by active count', () => {
    assert.equal(markerScaleForActiveCount(true, 100), 5);
    assert.equal(markerScaleForActiveCount(false, 70), 6);
    assert.equal(markerScaleForActiveCount(false, 40), 7);
    assert.equal(markerScaleForActiveCount(false, 20), 8);
    assert.equal(markerScaleForActiveCount(false, 5), 10);
  });
});
