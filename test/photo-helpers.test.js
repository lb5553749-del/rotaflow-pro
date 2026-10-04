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
  DEFAULT_PHOTO_MAX_PER_ITEM
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
