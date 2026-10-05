'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  GPS_PREF_KEY,
  readGpsEnabledPref,
  writeGpsEnabledPref,
  coordsFromPosition,
  gpsAccuracyCircleRadius,
  canUseWebGeolocation,
  canUseNativeGeolocation,
  buildActiveTrackTargets,
  positionFromBackgroundLocation
} = require('../lib/gps-helpers.js');

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    _data: data
  };
}

describe('gps pref', () => {
  it('defaults to enabled and persists 0/1', () => {
    const s = memoryStorage();
    assert.equal(readGpsEnabledPref(s), true);
    writeGpsEnabledPref(s, false);
    assert.equal(s.getItem(GPS_PREF_KEY), '0');
    assert.equal(readGpsEnabledPref(s), false);
    writeGpsEnabledPref(s, true);
    assert.equal(readGpsEnabledPref(s), true);
  });
});

describe('coordsFromPosition / accuracy radius', () => {
  it('reads lat/lng/accuracy and rejects invalid', () => {
    assert.deepEqual(
      coordsFromPosition({ coords: { latitude: -8.7, longitude: -63.9, accuracy: 12 } }),
      { lat: -8.7, lng: -63.9, accuracy: 12 }
    );
    assert.equal(coordsFromPosition(null), null);
    assert.equal(coordsFromPosition({ coords: { latitude: NaN, longitude: 1 } }), null);
    assert.equal(gpsAccuracyCircleRadius(10), 25);
    assert.equal(gpsAccuracyCircleRadius(40), 40);
    assert.equal(gpsAccuracyCircleRadius(null), 25);
  });
});

describe('capability helpers', () => {
  it('gates web and native geolocation', () => {
    assert.equal(canUseWebGeolocation({ isSecureContext: true, hasGeolocation: true }), true);
    assert.equal(canUseWebGeolocation({ isSecureContext: false, hasGeolocation: true }), false);
    assert.equal(canUseNativeGeolocation({ isNative: true, hasNativeGeo: true }), true);
    assert.equal(canUseNativeGeolocation({ isNative: true, hasNativeGeo: false }), false);
  });
});

describe('buildActiveTrackTargets / background location', () => {
  it('keeps only active stops with token and coords', () => {
    const targets = buildActiveTrackTargets([
      { trackToken: 'a', lat: 1, lng: 2, status: 'pendente', nearNotified: true },
      { trackToken: 'b', lat: 3, lng: 4, status: 'entregue' },
      { trackToken: 'c', lat: 5, status: 'pendente' },
      { lat: 6, lng: 7, status: 'pendente' }
    ], (d) => d.status !== 'entregue' && d.status !== 'falhou');
    assert.deepEqual(targets, [{ token: 'a', lat: 1, lng: 2, nearNotified: true }]);
  });

  it('normalizes BackgroundGps location events', () => {
    assert.deepEqual(
      positionFromBackgroundLocation({ latitude: 1, longitude: 2, accuracy: 5 }),
      { coords: { latitude: 1, longitude: 2, accuracy: 5 } }
    );
    assert.equal(positionFromBackgroundLocation({ latitude: 1 }), null);
  });
});
