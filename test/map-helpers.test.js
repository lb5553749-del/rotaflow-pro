'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PIN_SIZE_PX,
  isMutedPin,
  pinTextColorFor,
  markerColorFor,
  hexToTint,
  markerScaleForActiveCount,
  nativePinDisplaySize,
  iconFillColor,
  iconFillOpacity,
  boundsFromPoints,
  pointsForMapFit,
  shortStreetAddress,
  extractDistrict,
  plainLatLng,
  boundsCorners,
  pacotesFromPinColor,
  markerIdsToKeep,
  markerZIndexFor
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
    assert.equal(
      markerColorFor({ status: 'pendente', pacotes: 1 }, { riskLevel: 'amarelo' }),
      '#D97706'
    );
    assert.equal(
      markerColorFor({ status: 'pendente', pacotes: 1 }, { riskLevel: 'vermelho' }),
      '#B91C1C'
    );
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

describe('nativePinDisplaySize / iconFill / bounds / street', () => {
  it('shrinks pin size when the map is dense', () => {
    assert.equal(nativePinDisplaySize('p', 5), PIN_SIZE_PX.p);
    assert.ok(nativePinDisplaySize('p', 70) < PIN_SIZE_PX.p);
    assert.equal(nativePinDisplaySize('g', 5), PIN_SIZE_PX.g);
  });

  it('reads fill color/opacity from icon objects', () => {
    assert.equal(iconFillColor('#abc'), '#abc');
    assert.equal(iconFillColor({ fillColor: '#112233' }), '#112233');
    assert.equal(iconFillOpacity(null), 1);
    assert.equal(iconFillOpacity({ fillOpacity: 0.4 }), 0.4);
  });

  it('builds bounds and prefers pending points for fit', () => {
    const b = boundsFromPoints([
      { lat: 0, lng: 0 },
      { lat: 2, lng: 4 }
    ]);
    assert.deepEqual(b.center, { lat: 1, lng: 2 });
    const pts = pointsForMapFit(
      [
        { status: 'entregue', lat: 9, lng: 9 },
        { status: 'pendente', lat: 1, lng: 2 }
      ],
      (d) => d.lat != null
    );
    assert.deepEqual(pts, [{ lat: 1, lng: 2 }]);
  });

  it('shortens street addresses', () => {
    assert.equal(shortStreetAddress('Rua A, 10, Centro'), 'Rua A, 10');
    assert.equal(shortStreetAddress(''), '—');
  });

  it('extracts the district as the last non-numberish part', () => {
    assert.equal(extractDistrict('Rua A, 10, Centro'), 'Centro');
    assert.equal(extractDistrict('Rua B, Centro'), 'Centro');
    assert.equal(extractDistrict('Rua C'), '');
    assert.equal(extractDistrict('Rua D, 10'), '');
    assert.equal(extractDistrict('Quadra 12, casa 3'), '');
    assert.equal(extractDistrict('Rua E, s/n'), '');
    assert.equal(extractDistrict(null), '');
  });

  it('normalizes LatLng and bounds corners for the native facade', () => {
    assert.deepEqual(plainLatLng({ lat: 1, lng: 2 }), { lat: 1, lng: 2 });
    assert.deepEqual(plainLatLng({ lat: () => 3, lng: () => 4 }), { lat: 3, lng: 4 });
    assert.equal(plainLatLng(null), null);
    const corners = boundsCorners({
      getSouthWest: () => ({ lat: () => 0, lng: () => 0 }),
      getNorthEast: () => ({ lat: () => 2, lng: () => 4 })
    });
    assert.deepEqual(corners.center, { lat: 1, lng: 2 });
    assert.equal(pacotesFromPinColor('#EF4444'), 2);
    assert.equal(pacotesFromPinColor('#1A73E8'), 1);
  });
});

describe('markerIdsToKeep / markerZIndexFor', () => {
  it('collects sequential ids that should stay on the map', () => {
    const keep = markerIdsToKeep(
      [
        { sequentialId: 1, status: 'pendente' },
        { sequentialId: 2, status: 'entregue' },
        { sequentialId: 3, status: 'pendente' }
      ],
      (d) => d.status === 'pendente'
    );
    assert.deepEqual([...keep], [1, 3]);
    assert.equal(markerIdsToKeep(null, () => true).size, 0);
  });

  it('picks z-index for highlight and muted pins', () => {
    assert.equal(markerZIndexFor(true, false), 30);
    assert.equal(markerZIndexFor(false, true), 1);
    assert.equal(markerZIndexFor(false, false), 10);
  });
});
