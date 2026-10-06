'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  isValidTrackToken,
  newTrackToken,
  normalizeTrackToken,
  readTrackTokenFromLocation,
  publicFirstName,
  trackStatusFor,
  stripTrackEtaFields,
  haversineDistance,
  haversineKm,
  formatDistance,
  formatDistanceApprox,
  formatDuration,
  formatClientDuration,
  isWithinNearKm,
  shouldPublishTrack,
  stopsAheadOf,
  buildTrackPayload,
  isValidTrack,
  TRACK_FIELD_KEYS,
  TRACK_UPDATE_KEYS,
  TRACK_NEAR_KM,
  trackExpiresAtMs,
  TRACK_RETENTION_ACTIVE_MS,
  TRACK_RETENTION_FINAL_MS
} = require('../lib/track-schema.js');

function quotedKeysAfter(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) return [];
  const start = source.indexOf('[', at);
  const end = source.indexOf(']', start);
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('firestore.rules stay aligned with TRACK_FIELD_KEYS', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

  it('matches isValidTrack and the update allowlist', () => {
    const createKeys = quotedKeysAfter(rules, 'function isValidTrack');
    const updateKeys = quotedKeysAfter(rules, 'affectedKeys()');
    assert.deepEqual(createKeys, [...TRACK_FIELD_KEYS].sort());
    assert.deepEqual(updateKeys, [...TRACK_UPDATE_KEYS].sort());
  });
});

describe('newTrackToken', () => {
  it('turns 16 random bytes into 32 lowercase hex chars', () => {
    const token = newTrackToken({
      getRandomValues(buf) {
        buf.fill(0xab);
        return buf;
      }
    });
    assert.equal(token, 'ab'.repeat(16));
    assert.equal(isValidTrackToken(token), true);
  });
});

describe('isValidTrackToken', () => {
  it('accepts 32 hex chars', () => {
    assert.equal(isValidTrackToken('a'.repeat(32)), true);
    assert.equal(isValidTrackToken('0123456789abcdef0123456789abcdef'), true);
  });

  it('rejects empty, short or non-hex', () => {
    assert.equal(isValidTrackToken(''), false);
    assert.equal(isValidTrackToken('abc'), false);
    assert.equal(isValidTrackToken('g'.repeat(32)), false);
    assert.equal(isValidTrackToken(null), false);
  });
});

describe('newTrackToken', () => {
  it('returns 32 hex chars from the given crypto', () => {
    const token = newTrackToken({
      getRandomValues(bytes) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = i;
      }
    });
    assert.equal(token, '000102030405060708090a0b0c0d0e0f');
    assert.equal(isValidTrackToken(token), true);
  });
});

describe('normalizeTrackToken / readTrackTokenFromLocation', () => {
  it('lowercases a valid token', () => {
    assert.equal(normalizeTrackToken('AB' + 'c'.repeat(30)), 'ab' + 'c'.repeat(30));
  });

  it('reads ?t= and /r/ path', () => {
    const hex = '0123456789abcdef0123456789abcdef';
    assert.equal(readTrackTokenFromLocation({ search: '?t=' + hex.toUpperCase(), pathname: '/' }), hex);
    assert.equal(readTrackTokenFromLocation({ search: '', pathname: '/r/' + hex }), hex);
    assert.equal(readTrackTokenFromLocation({ search: '', pathname: '/x' }), '');
  });
});

describe('publicFirstName', () => {
  it('keeps the first word and caps length', () => {
    assert.equal(publicFirstName('Maria Silva'), 'Maria');
    assert.equal(publicFirstName('', 'Cliente'), 'Cliente');
    assert.equal(publicFirstName('x'.repeat(80)).length, 60);
  });
});

describe('trackStatusFor', () => {
  it('maps delivery status to track status', () => {
    assert.equal(trackStatusFor(null), 'encerrado');
    assert.equal(trackStatusFor({ status: 'entregue' }), 'entregue');
    assert.equal(trackStatusFor({ status: 'falhou' }), 'falhou');
    assert.equal(trackStatusFor({ status: 'pendente' }), 'active');
    assert.equal(trackStatusFor({ status: 'em-rota' }), 'active');
    assert.equal(trackStatusFor({ status: 'outro' }), 'encerrado');
  });
});

describe('stripTrackEtaFields', () => {
  it('drops eta fields and leaves the rest', () => {
    const out = stripTrackEtaFields({ status: 'active', etaSeconds: 10, stopsAhead: 2, destName: 'A' });
    assert.equal(out.etaSeconds, undefined);
    assert.equal(out.stopsAhead, undefined);
    assert.equal(out.destName, 'A');
  });
});

describe('haversineDistance', () => {
  it('returns ~0 for the same point', () => {
    assert.ok(haversineDistance(-8.76, -63.9, -8.76, -63.9) < 0.001);
  });

  it('matches haversineKm for {lat,lng} pairs', () => {
    const a = { lat: -8.76, lng: -63.90 };
    const b = { lat: -8.77, lng: -63.91 };
    assert.equal(haversineKm(a, b), haversineDistance(a.lat, a.lng, b.lat, b.lng));
  });
});

describe('formatDistance / formatDuration', () => {
  it('formats meters under 1 km', () => {
    assert.equal(formatDistance(0.05), '50 m');
    assert.equal(formatDistance(null), '—');
    assert.equal(formatDistanceApprox(0.05), 'cerca de 50 m');
    assert.equal(formatDistanceApprox(null), null);
  });

  it('formats duration for the driver toast and the client page', () => {
    assert.equal(formatDuration(120), '2 min');
    assert.equal(formatDuration(3660), '1h01');
    assert.equal(formatClientDuration(-1), '');
    assert.equal(formatClientDuration(10), '1 min');
  });
});

describe('isWithinNearKm / shouldPublishTrack / stopsAheadOf', () => {
  it('detects a stop within the near radius', () => {
    const d = { lat: -8.76, lng: -63.90 };
    assert.equal(isWithinNearKm(d, { lat: -8.76, lng: -63.90 }), true);
    assert.equal(isWithinNearKm(d, { lat: -8.80, lng: -63.90 }), false);
    assert.equal(isWithinNearKm({ lat: 'x', lng: 1 }, { lat: 0, lng: 0 }), false);
  });

  it('publishes on first fix, time or distance', () => {
    const pos = { lat: 0, lng: 0 };
    assert.equal(shouldPublishTrack(pos, null, 0, 1000), true);
    assert.equal(shouldPublishTrack(pos, pos, 0, 1000), false);
    assert.equal(shouldPublishTrack(pos, pos, 0, 5000), true);
    assert.equal(TRACK_NEAR_KM, 0.1);
  });

  it('counts pending stops ahead', () => {
    const pending = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.equal(stopsAheadOf({ id: 3 }, pending), 2);
    assert.equal(stopsAheadOf({ id: 99 }, pending), 0);
    assert.equal(stopsAheadOf(null, pending), 0);
  });
});

describe('buildTrackPayload / isValidTrack', () => {
  function sampleDelivery() {
    return {
      id: 1,
      sequentialId: 'A1',
      nome: 'Ana Souza',
      lat: -8.76,
      lng: -63.9,
      status: 'pendente',
      nearNotified: false
    };
  }

  it('builds a valid active payload with driver position', () => {
    const payload = buildTrackPayload(sampleDelivery(), { pos: { lat: -8.75, lng: -63.88 } }, {
      motorista: 'João Motorista',
      pendingStops: [sampleDelivery()],
      estimateStopEta: () => ({ seconds: 180 }),
      gpsAccuracyMeters: 12,
      now: 1700000000000
    });
    assert.equal(payload.destName, 'Ana');
    assert.equal(payload.status, 'active');
    assert.equal(payload.motorista, 'João');
    assert.equal(payload.etaSeconds, 180);
    assert.equal(payload.stopsAhead, 0);
    assert.equal(payload.driverLat, -8.75);
    assert.equal(payload.accuracy, 12);
    const doc = { ...payload, ownerUid: 'uid-motorista', expiresAt: { seconds: 1, nanoseconds: 0 } };
    assert.equal(isValidTrack(doc), true);
    TRACK_FIELD_KEYS.forEach((k) => {
      if (k === 'driverLat' || k === 'driverLng' || k === 'accuracy') return;
      assert.ok(k in doc, k);
    });
  });

  it('rejects extra keys, out-of-range coords and missing ownerUid', () => {
    const payload = { ...buildTrackPayload(sampleDelivery(), null, { now: 1 }), ownerUid: 'u1', expiresAt: { seconds: 1, nanoseconds: 0 } };
    assert.equal(isValidTrack(payload), true);
    assert.equal(isValidTrack({ ...payload, hack: true }), false);
    assert.equal(isValidTrack({ ...payload, destLat: 200 }), false);
    const { ownerUid, ...noOwner } = payload;
    assert.equal(ownerUid, 'u1');
    assert.equal(isValidTrack(noOwner), false);
    const { expiresAt, ...noExpiry } = payload;
    assert.ok(expiresAt);
    assert.equal(isValidTrack(noExpiry), false);
  });
});

describe('trackExpiresAtMs', () => {
  it('keeps active tracks 48h after the last write and finished ones 24h', () => {
    const now = 1700000000000;
    assert.equal(trackExpiresAtMs('active', now), now + TRACK_RETENTION_ACTIVE_MS);
    assert.equal(trackExpiresAtMs('entregue', now), now + TRACK_RETENTION_FINAL_MS);
    assert.equal(trackExpiresAtMs('falhou', now), now + TRACK_RETENTION_FINAL_MS);
    assert.equal(TRACK_RETENTION_ACTIVE_MS, 48 * 3600 * 1000);
    assert.equal(TRACK_RETENTION_FINAL_MS, 24 * 3600 * 1000);
  });
});
