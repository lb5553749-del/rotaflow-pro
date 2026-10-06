'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  remainingPhotoSlots,
  photoFingerprint,
  canAddPhoto,
  slicePhotoIdsForHydrate,
  itemPhotoScope,
  normalizeIdbPhotoValue,
  DEFAULT_PHOTO_MAX_PER_ITEM,
  DEFAULT_FINISHED_PHOTO_TTL_DAYS,
  MS_PER_DAY,
  collectPhotoIdsFromLists,
  isHistoryWithinPhotoTtl,
  collectKeepPhotoIds,
  planIdbPhotoKeysToDelete,
  PHOTO_SAVE_DEDUPE_MS,
  photoSaveDedupeKey,
  pruneRecentPhotoSaveMap,
  isDuplicatePhotoSaveInMap,
  markPhotoSavedInMap,
  itemNeedsPhotoHydrate,
  hasLegacyDataUrlPhotos
} = require('../lib/photo-helpers.js');

describe('remainingPhotoSlots / canAddPhoto', () => {
  it('respects default cap', () => {
    const item = { photoIds: new Array(DEFAULT_PHOTO_MAX_PER_ITEM).fill('p') };
    assert.equal(remainingPhotoSlots(item), 0);
    assert.equal(canAddPhoto(item), false);
  });

  it('counts free slots', () => {
    assert.equal(remainingPhotoSlots({ photoIds: ['a', 'b'] }, 10), 8);
    assert.equal(canAddPhoto({ photoIds: [] }, 10), true);
    assert.equal(remainingPhotoSlots(null, 10), 10);
  });
});

describe('photoFingerprint', () => {
  it('is stable for same data URL', () => {
    const a = 'data:image/jpeg;base64,' + 'ABCD'.repeat(40);
    assert.equal(photoFingerprint(a), photoFingerprint(a));
    assert.notEqual(photoFingerprint(a), photoFingerprint(a + 'Z'));
  });

  it('returns empty for invalid', () => {
    assert.equal(photoFingerprint(null), '');
    assert.equal(photoFingerprint(12), '');
  });
});

describe('slicePhotoIdsForHydrate', () => {
  it('limits and skips pending', () => {
    assert.deepEqual(
      slicePhotoIdsForHydrate(['a', 'pending', 'b', 'c'], 2),
      ['a', 'b']
    );
    assert.deepEqual(slicePhotoIdsForHydrate(['a', 'b'], null), ['a', 'b']);
  });
});

describe('itemPhotoScope', () => {
  it('prefers delivery id then agenda', () => {
    assert.equal(itemPhotoScope({ id: 9, agendaId: 1 }), 'd:9');
    assert.equal(itemPhotoScope({ agendaId: 3 }), 'a:3');
    assert.equal(itemPhotoScope({ sequentialId: 'A1' }), 's:A1');
  });
});

describe('normalizeIdbPhotoValue', () => {
  it('recognizes data URLs', () => {
    const n = normalizeIdbPhotoValue('data:image/jpeg;base64,abc');
    assert.equal(n.kind, 'dataurl');
  });

  it('returns null for empty', () => {
    assert.equal(normalizeIdbPhotoValue(null), null);
  });
});

describe('photo housekeeping (TTL)', () => {
  const now = Date.UTC(2026, 9, 4, 12); // 2026-10-04

  it('collects photo ids and skips pending', () => {
    const ids = collectPhotoIdsFromLists([
      [{ photoIds: ['a', 'pending', 'b'] }, { photoIds: ['b', 'c'] }],
      null
    ]);
    assert.deepEqual([...ids].sort(), ['a', 'b', 'c']);
  });

  it('keeps history inside TTL and drops expired finished days', () => {
    assert.equal(DEFAULT_FINISHED_PHOTO_TTL_DAYS, 30);
    const recent = { savedAt: now - 10 * MS_PER_DAY, deliveries: [{ photoIds: ['keep'] }] };
    const expired = { savedAt: now - 45 * MS_PER_DAY, deliveries: [{ photoIds: ['gone'] }] };
    assert.equal(isHistoryWithinPhotoTtl(recent, 30, now), true);
    assert.equal(isHistoryWithinPhotoTtl(expired, 30, now), false);
    assert.equal(isHistoryWithinPhotoTtl(expired, 60, now), true);

    const keep = collectKeepPhotoIds({
      routes: [{ deliveries: [{ photoIds: ['route1'] }] }],
      agenda: [{ photoIds: ['agenda1'] }],
      history: [recent, expired],
      ttlDays: 30,
      now
    });
    assert.deepEqual([...keep].sort(), ['agenda1', 'keep', 'route1']);
  });

  it('plans IDB keys to delete for one uid only', () => {
    const keys = planIdbPhotoKeysToDelete({
      uid: 'u1',
      allKeys: ['u1::keep', 'u1::drop', 'u2::other', 'weird'],
      keepPhotoIds: new Set(['keep'])
    });
    assert.deepEqual(keys, ['u1::drop']);
  });
});

describe('photo save dedupe map', () => {
  const dataUrl = 'data:image/jpeg;base64,' + 'ABCD'.repeat(40);
  const now = 1_000_000;

  it('builds stable dedupe keys', () => {
    const key = photoSaveDedupeKey('d:1', dataUrl);
    assert.ok(key.startsWith('d:1::'));
    assert.equal(photoSaveDedupeKey('d:1', dataUrl), key);
    assert.equal(photoSaveDedupeKey('d:1', null), '');
  });

  it('detects duplicates inside the window and accepts after expiry', () => {
    const map = new Map();
    assert.equal(isDuplicatePhotoSaveInMap(map, 'd:1', dataUrl, now), false);
    markPhotoSavedInMap(map, 'd:1', dataUrl, now);
    assert.equal(isDuplicatePhotoSaveInMap(map, 'd:1', dataUrl, now + 100), true);
    assert.equal(
      isDuplicatePhotoSaveInMap(map, 'd:1', dataUrl, now + PHOTO_SAVE_DEDUPE_MS + 1),
      false
    );
  });

  it('prunes expired entries only when map is large', () => {
    const map = new Map();
    for (let i = 0; i < 70; i++) map.set(`k${i}`, now - PHOTO_SAVE_DEDUPE_MS - 1);
    assert.equal(pruneRecentPhotoSaveMap(map, now), 70);
    assert.equal(map.size, 0);
    map.set('fresh', now);
    assert.equal(pruneRecentPhotoSaveMap(map, now), 0);
  });
});

describe('itemNeedsPhotoHydrate / hasLegacyDataUrlPhotos', () => {
  it('detects incomplete, legacy and missing display urls', () => {
    assert.equal(itemNeedsPhotoHydrate(null), false);
    assert.equal(itemNeedsPhotoHydrate({ photoIds: ['a'], photos: [] }), true);
    assert.equal(itemNeedsPhotoHydrate({ photoIds: ['a', 'b'], photos: ['x'] }), true);
    assert.equal(itemNeedsPhotoHydrate({
      photoIds: [],
      photos: ['data:image/jpeg;base64,abc']
    }), true);
    assert.equal(itemNeedsPhotoHydrate({ photoIds: ['a'], photos: ['blob:1'] }), false);
  });

  it('flags legacy data URL arrays', () => {
    assert.equal(hasLegacyDataUrlPhotos({ photos: ['data:image/jpeg;base64,x'] }), true);
    assert.equal(hasLegacyDataUrlPhotos({ photos: ['blob:1'] }), false);
    assert.equal(hasLegacyDataUrlPhotos(null), false);
  });
});
