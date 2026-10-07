'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectBackupPhotoIds,
  sanitizePhotoBlobs,
  sanitizePhotoBlobEntry,
  attachPhotoBlobs,
  planPhotoRestoreEntries,
  collectPhotoBlobsMap,
  MAX_BACKUP_PHOTO_BLOBS
} = require('../lib/backup-photos.js');
const { parseBackupPayload } = require('../lib/backup-schema.js');

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';

describe('collectBackupPhotoIds', () => {
  it('collects ids from routes, deliveries and agenda', () => {
    const ids = collectBackupPhotoIds({
      agenda: [{ photoIds: ['a1', 'pending'] }],
      deliveries: [{ photoIds: ['d1'] }],
      routes: [
        { deliveries: [{ photoIds: ['r1', 'd1'] }] },
        { deliveries: [{ photoIds: ['r2'] }] }
      ]
    });
    assert.deepEqual(ids.sort(), ['a1', 'd1', 'r1', 'r2']);
  });

  it('returns empty for missing data', () => {
    assert.deepEqual(collectBackupPhotoIds(null), []);
    assert.deepEqual(collectBackupPhotoIds({}), []);
  });
});

describe('sanitizePhotoBlobs', () => {
  it('keeps data:image entries and normalizes raw base64', () => {
    const rawB64 = TINY_JPEG.slice(TINY_JPEG.indexOf(',') + 1);
    const out = sanitizePhotoBlobs({
      p_ok: TINY_JPEG,
      p_raw: rawB64,
      pending: TINY_JPEG,
      '': TINY_JPEG,
      bad: 'nope',
      huge: 'x'.repeat(10)
    });
    assert.equal(out.p_ok, TINY_JPEG);
    assert.ok(out.p_raw.startsWith('data:image/jpeg;base64,'));
    assert.equal(out.pending, undefined);
    assert.equal(out.bad, undefined);
  });

  it('rejects non-objects', () => {
    assert.deepEqual(sanitizePhotoBlobs(null), {});
    assert.deepEqual(sanitizePhotoBlobs([]), {});
  });
});

describe('sanitizePhotoBlobEntry', () => {
  it('rejects oversized ids and values', () => {
    assert.equal(sanitizePhotoBlobEntry('pending', TINY_JPEG), null);
    assert.equal(sanitizePhotoBlobEntry('p_x', 'short'), null);
    assert.equal(sanitizePhotoBlobEntry('a'.repeat(100), TINY_JPEG), null);
  });
});

describe('attachPhotoBlobs', () => {
  it('bumps version to 2 and attaches sanitized map', () => {
    const out = attachPhotoBlobs(
      { version: 1, agenda: [], routes: [] },
      { p1: TINY_JPEG, junk: 1 }
    );
    assert.equal(out.version, 2);
    assert.equal(out.photoBlobs.p1, TINY_JPEG);
    assert.equal(out.photoBlobs.junk, undefined);
  });
});

describe('planPhotoRestoreEntries', () => {
  it('only restores blobs referenced by photoIds', () => {
    const entries = planPhotoRestoreEntries({
      agenda: [{ photoIds: ['keep'] }],
      deliveries: [],
      routes: [],
      photoBlobs: {
        keep: TINY_JPEG,
        orphan: TINY_JPEG
      }
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'keep');
    assert.equal(entries[0].dataUrl, TINY_JPEG);
  });
});

describe('collectPhotoBlobsMap', () => {
  it('loads ids sequentially via loadFn', async () => {
    const calls = [];
    const map = await collectPhotoBlobsMap(
      ['p1', 'pending', 'p2', 'missing'],
      async (id) => {
        calls.push(id);
        if (id === 'missing') return null;
        return TINY_JPEG;
      }
    );
    assert.deepEqual(calls, ['p1', 'p2', 'missing']);
    assert.equal(Object.keys(map).sort().join(','), 'p1,p2');
  });
});

describe('parseBackupPayload with photoBlobs', () => {
  it('round-trips photoBlobs through schema', () => {
    const built = attachPhotoBlobs(
      {
        agenda: [{ id: 1, nome: 'A', photoIds: ['p1'] }],
        routes: [{ id: 'r1', name: 'Rota', deliveries: [{ id: 2, photoIds: ['p1'] }] }],
        deliveries: [{ id: 2, photoIds: ['p1'] }]
      },
      { p1: TINY_JPEG }
    );
    const parsed = parseBackupPayload(built);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.photoBlobs.p1, TINY_JPEG);
    const plan = planPhotoRestoreEntries(parsed.data);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].id, 'p1');
  });

  it('accepts legacy backup without photoBlobs', () => {
    const parsed = parseBackupPayload({
      agenda: [],
      deliveries: [{ id: 1, nome: 'X' }]
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data.photoBlobs, {});
  });
});

describe('MAX_BACKUP_PHOTO_BLOBS', () => {
  it('is a positive finite cap', () => {
    assert.ok(Number.isFinite(MAX_BACKUP_PHOTO_BLOBS));
    assert.ok(MAX_BACKUP_PHOTO_BLOBS > 0);
  });
});
