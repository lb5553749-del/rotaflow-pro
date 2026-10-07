'use strict';

/**
 * Pure helpers for JSON backup with embedded delivery photos (photoBlobs map).
 * Blobs stay out of route/agenda rows; restore hydrates IndexedDB from photoBlobs.
 */

const { collectPhotoIdsFromLists } = require('./photo-helpers.js');

/** Soft cap per photo string (~6 MiB base64) to reject hostile payloads. */
const MAX_PHOTO_BLOB_CHARS = 6 * 1024 * 1024;
/** Soft cap on how many photos a restore will accept. */
const MAX_BACKUP_PHOTO_BLOBS = 500;

/**
 * Photo ids referenced by a backup-shaped object (routes, deliveries, agenda).
 * @param {{ routes?: object[], deliveries?: object[], agenda?: object[] }|null|undefined} data
 * @returns {string[]}
 */
function collectBackupPhotoIds(data) {
  if (!data || typeof data !== 'object') return [];
  const lists = [data.agenda || [], data.deliveries || []];
  for (const r of data.routes || []) {
    if (r && Array.isArray(r.deliveries)) lists.push(r.deliveries);
  }
  return Array.from(collectPhotoIdsFromLists(lists));
}

/**
 * @param {string} id
 * @param {unknown} value
 * @returns {{ id: string, value: string }|null}
 */
function sanitizePhotoBlobEntry(id, value) {
  if (typeof id !== 'string' || !id || id === 'pending') return null;
  if (id.length > 80) return null;
  if (typeof value !== 'string' || value.length < 32) return null;
  if (value.length > MAX_PHOTO_BLOB_CHARS) return null;
  if (value.startsWith('data:image/')) return { id, value };
  // Raw base64 (no data: prefix)
  const compact = value.replace(/\s/g, '');
  if (compact.length < 32 || compact.length > MAX_PHOTO_BLOB_CHARS) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact.slice(0, 120))) return null;
  return { id, value: `data:image/jpeg;base64,${compact}` };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function sanitizePhotoBlobs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= MAX_BACKUP_PHOTO_BLOBS) break;
    const entry = sanitizePhotoBlobEntry(key, raw[key]);
    if (!entry) continue;
    out[entry.id] = entry.value;
    n += 1;
  }
  return out;
}

/**
 * Attach a photoBlobs map to a light backup object (version ≥ 2).
 * @param {object} backup
 * @param {Record<string, string>|null|undefined} photoBlobs
 * @returns {object}
 */
function attachPhotoBlobs(backup, photoBlobs) {
  const base = backup && typeof backup === 'object' ? backup : {};
  const blobs = sanitizePhotoBlobs(photoBlobs);
  const ver = Number(base.version);
  return {
    ...base,
    version: Number.isFinite(ver) && ver > 2 ? ver : 2,
    photoBlobs: blobs
  };
}

/**
 * Entries safe to write into IndexedDB on restore, in stable order.
 * Prefer ids still referenced by the backup; orphan blobs are skipped.
 * @param {{ routes?: object[], deliveries?: object[], agenda?: object[], photoBlobs?: unknown }|null|undefined} data
 * @returns {Array<{ id: string, dataUrl: string }>}
 */
function planPhotoRestoreEntries(data) {
  const blobs = sanitizePhotoBlobs(data && data.photoBlobs);
  const wanted = new Set(collectBackupPhotoIds(data));
  const entries = [];
  for (const id of wanted) {
    const dataUrl = blobs[id];
    if (dataUrl) entries.push({ id, dataUrl });
  }
  return entries;
}

/**
 * Build photoBlobs map from async loader (one id at a time). Pure orchestration
 * for tests when loadFn is sync/fake; browser passes idb export.
 * @param {string[]} photoIds
 * @param {(id: string) => Promise<string|null>|string|null} loadFn
 * @param {{ onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<Record<string, string>>}
 */
async function collectPhotoBlobsMap(photoIds, loadFn, opts) {
  const ids = Array.isArray(photoIds) ? photoIds : [];
  const out = {};
  const total = ids.length;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id || id === 'pending') continue;
    let dataUrl = null;
    try {
      dataUrl = await loadFn(id);
    } catch (_) {
      dataUrl = null;
    }
    if (typeof dataUrl === 'string' && dataUrl.length >= 32) {
      const entry = sanitizePhotoBlobEntry(id, dataUrl);
      if (entry) out[entry.id] = entry.value;
    }
    if (opts && typeof opts.onProgress === 'function') {
      await opts.onProgress(i + 1, total);
    }
  }
  return out;
}

module.exports = {
  MAX_PHOTO_BLOB_CHARS,
  MAX_BACKUP_PHOTO_BLOBS,
  collectBackupPhotoIds,
  sanitizePhotoBlobEntry,
  sanitizePhotoBlobs,
  attachPhotoBlobs,
  planPhotoRestoreEntries,
  collectPhotoBlobsMap
};
