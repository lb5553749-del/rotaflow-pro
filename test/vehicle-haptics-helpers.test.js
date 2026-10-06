'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HAPTIC_PATTERNS,
  hapticPatternFor,
  hapticImpactStyleFor,
  ttsFeedbackStub
} = require('../lib/haptics-helpers.js');
const {
  VEHICLE_MODE_PREF_KEY,
  readVehicleModePref,
  writeVehicleModePref,
  buildNavigationUrls
} = require('../lib/vehicle-mode-helpers.js');

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); }
  };
}

describe('haptics helpers', () => {
  it('maps kinds to vibrate patterns and impact styles', () => {
    assert.deepEqual(hapticPatternFor('delivery'), HAPTIC_PATTERNS.delivery);
    assert.deepEqual(hapticPatternFor('near'), HAPTIC_PATTERNS.near);
    assert.equal(hapticImpactStyleFor('near'), 'HEAVY');
    assert.equal(hapticImpactStyleFor('delivery'), 'MEDIUM');
    const stub = ttsFeedbackStub();
    assert.equal(stub.enabled, false);
    assert.match(stub.reason, /TTS/);
  });
});

describe('vehicle mode helpers', () => {
  it('persists pref and builds nav urls', () => {
    const s = memoryStorage();
    assert.equal(readVehicleModePref(s), false);
    writeVehicleModePref(s, true);
    assert.equal(s.getItem(VEHICLE_MODE_PREF_KEY), '1');
    assert.equal(readVehicleModePref(s), true);
    const urls = buildNavigationUrls(-8.76, -63.9);
    assert.match(urls.googleWeb, /destination=-8\.76,-63\.9/);
    assert.match(urls.waze, /waze\.com/);
    assert.match(urls.googleNav, /google\.navigation/);
  });
});
