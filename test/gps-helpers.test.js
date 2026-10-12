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
  nextActiveTrackTargets,
  TRACK_PUBLISH_LIMIT,
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
    assert.deepEqual(targets, [{ token: 'a', lat: 1, lng: 2, routeOrder: Number.MAX_SAFE_INTEGER, nearNotified: true }]);
  });

  it('carries routeOrder for the native publish head', () => {
    const targets = buildActiveTrackTargets([
      { id: 'a', trackToken: 'a', lat: 1, lng: 2, routeOrder: 4 }
    ], () => true);
    assert.equal(targets[0].routeOrder, 4);
  });
});

describe('nextActiveTrackTargets', () => {
  // 0,001 grau de latitude ≈ 111 m: cada parada fica a ~111 m da anterior.
  const stops = [
    { id: 's1', trackToken: 't1', routeOrder: 3, lat: 0.003, lng: 0 },
    { id: 's2', trackToken: 't2', routeOrder: 1, lat: 0.001, lng: 0 },
    { id: 's3', trackToken: 't3', routeOrder: 2, lat: 0.002, lng: 0 },
    { id: 's4', trackToken: 't4', routeOrder: 5, lat: 0.005, lng: 0 },
    { id: 's5', trackToken: 't5', routeOrder: 4, lat: 0.004, lng: 0 },
    { id: 'done', trackToken: 'td', routeOrder: 0, lat: 0, lng: 0, status: 'entregue' },
    { id: 'notok', routeOrder: 1, lat: 0, lng: 0 }
  ];
  const active = (d) => d.status !== 'entregue';

  it(`limita às próximas ${TRACK_PUBLISH_LIMIT} paradas, na ordem da rota`, () => {
    assert.deepEqual(
      nextActiveTrackTargets(stops, active, null).map((d) => d.id),
      ['s2', 's3', 's1']
    );
  });

  it('respeita um limite maior', () => {
    assert.equal(nextActiveTrackTargets(stops, active, null, 2).length, 2);
  });

  it('sem posição, não alcança paradas além do limite', () => {
    const out = nextActiveTrackTargets(stops, active, null);
    assert.ok(!out.some((d) => d.id === 's4' || d.id === 's5'));
  });

  it('inclui quem já está perto, mesmo além do limite', () => {
    // Motorista em cima da s5 (4ª na rota): ela entra sem tirar ninguém do topo.
    assert.deepEqual(
      nextActiveTrackTargets(stops, active, { lat: 0.004, lng: 0 }).map((d) => d.id),
      ['s2', 's3', 's1', 's5']
    );
  });

  it('normalizes BackgroundGps location events', () => {
    assert.deepEqual(
      positionFromBackgroundLocation({ latitude: 1, longitude: 2, accuracy: 5 }),
      { coords: { latitude: 1, longitude: 2, accuracy: 5 } }
    );
    assert.equal(positionFromBackgroundLocation({ latitude: 1 }), null);
  });
});

describe('adaptive GPS battery helpers', () => {
  const {
    isGpsStationary,
    adaptiveWatchOptions,
    suggestedBackgroundIntervalMs,
    nextStationaryState,
    GPS_STATIONARY_SAMPLES
  } = require('../lib/gps-helpers.js');

  it('detects stationary and retunes watch options', () => {
    assert.equal(
      isGpsStationary({ lat: 0, lng: 0 }, { lat: 0.00001, lng: 0 }),
      true
    );
    assert.equal(
      isGpsStationary({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }),
      false
    );
    assert.equal(adaptiveWatchOptions({ stationary: true }).enableHighAccuracy, false);
    assert.equal(adaptiveWatchOptions({ stationary: false }).maximumAge, 10000);
    assert.equal(suggestedBackgroundIntervalMs({ stationary: true }), 12000);
    let state = nextStationaryState(0, false);
    for (let i = 1; i < GPS_STATIONARY_SAMPLES; i++) {
      state = nextStationaryState(state.streak, false);
    }
    assert.equal(state.stationary, true);
    assert.equal(nextStationaryState(5, true).stationary, false);
  });
});
