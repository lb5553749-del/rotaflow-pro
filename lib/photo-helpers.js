'use strict';

/**
 * Pure photo helpers (caps, fingerprints, dataURL↔Blob conversion planning,
 * IndexedDB housekeeping for finished-route photos).
 */

require('./types.js');

const DEFAULT_PHOTO_MAX_PER_ITEM = 15;
/** Default TTL for photos belonging only to archived / finished route days. */
const DEFAULT_FINISHED_PHOTO_TTL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function remainingPhotoSlots(item, maxPerItem = DEFAULT_PHOTO_MAX_PER_ITEM) {
  if (!item) return maxPerItem;
  const n = Array.isArray(item.photoIds) ? item.photoIds.length : 0;
  return Math.max(0, maxPerItem - n);
}

/** Fingerprint barato do JPEG (evita gravar a mesma captura 2×). */
function photoFingerprint(dataUrlOrB64) {
  if (!dataUrlOrB64 || typeof dataUrlOrB64 !== 'string') return '';
  const comma = dataUrlOrB64.indexOf(',');
  const body = comma >= 0 ? dataUrlOrB64.slice(comma + 1) : dataUrlOrB64;
  const n = body.length;
  if (n < 64) return `${n}:${body}`;
  const mid = n >> 1;
  return `${n}:${body.slice(0, 40)}:${body.slice(mid - 20, mid + 20)}:${body.slice(-40)}`;
}

function photoFingerprintFromBytes(bytes) {
  if (!bytes || !bytes.length) return '';
  const n = bytes.length;
  const sample = (start, len) => {
    const end = Math.min(bytes.length, start + len);
    let s = '';
    for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i] & 0xff);
    return s;
  };
  if (n < 64) return `${n}:${sample(0, n)}`;
  const mid = n >> 1;
  return `${n}:${sample(0, 40)}:${sample(mid - 20, 40)}:${sample(n - 40, 40)}`;
}

function itemPhotoScope(item) {
  if (!item) return 'unknown';
  if (item.id != null) return `d:${item.id}`;
  if (item.agendaId != null) return `a:${item.agendaId}`;
  if (item.sequentialId != null) return `s:${item.sequentialId}`;
  return 'x';
}

/**
 * Normaliza valor lido do IDB: Blob | ArrayBuffer | data URL string → { kind, value }.
 */
function normalizeIdbPhotoValue(value) {
  if (value == null) return null;
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { kind: 'blob', value };
  }
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return { kind: 'buffer', value };
  }
  if (typeof value === 'string' && value.startsWith('data:')) {
    return { kind: 'dataurl', value };
  }
  if (typeof value === 'string' && value.length > 32) {
    // legado: base64 cru
    return { kind: 'dataurl', value: `data:image/jpeg;base64,${value}` };
  }
  return null;
}

function canAddPhoto(item, maxPerItem = DEFAULT_PHOTO_MAX_PER_ITEM) {
  return remainingPhotoSlots(item, maxPerItem) > 0;
}

function slicePhotoIdsForHydrate(photoIds, maxPhotos) {
  const ids = Array.isArray(photoIds) ? photoIds.filter((id) => id && id !== 'pending') : [];
  if (maxPhotos == null || !Number.isFinite(maxPhotos)) return ids;
  return ids.slice(0, Math.max(0, maxPhotos));
}

/**
 * Collect concrete photo ids from delivery/agenda-like items (skips `pending`).
 * @param {Array<Array<{ photoIds?: string[] }|null|undefined>|null|undefined>|null|undefined} lists
 * @returns {Set<string>}
 */
function collectPhotoIdsFromLists(lists) {
  const ids = new Set();
  for (const list of lists || []) {
    for (const item of list || []) {
      const arr = item && Array.isArray(item.photoIds) ? item.photoIds : [];
      for (const id of arr) {
        if (id && id !== 'pending') ids.add(String(id));
      }
    }
  }
  return ids;
}

/**
 * Age of a history day in ms. Unknown age → null (keep photos).
 * @param {{ savedAt?: number, date?: string }|null|undefined} entry
 * @param {number} [now]
 * @returns {number|null}
 */
function historyEntryAgeMs(entry, now = Date.now()) {
  if (!entry) return null;
  if (typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)) {
    return Math.max(0, now - entry.savedAt);
  }
  if (entry.date) {
    const [y, m, d] = String(entry.date).split('-').map(Number);
    if (y && m && d) {
      return Math.max(0, now - new Date(y, m - 1, d).getTime());
    }
  }
  return null;
}

/**
 * @param {{ savedAt?: number, date?: string }|null|undefined} entry
 * @param {number} [ttlDays]
 * @param {number} [now]
 * @returns {boolean}
 */
function isHistoryWithinPhotoTtl(entry, ttlDays = DEFAULT_FINISHED_PHOTO_TTL_DAYS, now = Date.now()) {
  const age = historyEntryAgeMs(entry, now);
  if (age == null) return true;
  const days = Number.isFinite(ttlDays) ? Math.max(0, ttlDays) : DEFAULT_FINISHED_PHOTO_TTL_DAYS;
  return age <= days * MS_PER_DAY;
}

/**
 * Photo ids that must stay in IndexedDB: active routes, agenda, and history
 * days still inside the finished-route TTL (default 30 days; 60 also supported).
 *
 * @param {{
 *   routes?: Array<{ deliveries?: object[] }>,
 *   agenda?: object[],
 *   history?: Array<{ savedAt?: number, date?: string, deliveries?: object[] }>,
 *   ttlDays?: number,
 *   now?: number
 * }} [opts]
 * @returns {Set<string>}
 */
function collectKeepPhotoIds(opts = {}) {
  const lists = [opts.agenda || []];
  for (const r of opts.routes || []) {
    if (r && Array.isArray(r.deliveries)) lists.push(r.deliveries);
  }
  const ttlDays = opts.ttlDays == null ? DEFAULT_FINISHED_PHOTO_TTL_DAYS : opts.ttlDays;
  const now = opts.now == null ? Date.now() : opts.now;
  for (const h of opts.history || []) {
    if (isHistoryWithinPhotoTtl(h, ttlDays, now) && h && Array.isArray(h.deliveries)) {
      lists.push(h.deliveries);
    }
  }
  return collectPhotoIdsFromLists(lists);
}

/**
 * IndexedDB keys (`uid::photoId`) safe to delete for this user.
 * @param {{ uid: string, allKeys?: Array<string|IDBValidKey>, keepPhotoIds?: Set<string>|string[] }} opts
 * @returns {string[]}
 */
function planIdbPhotoKeysToDelete(opts) {
  const uid = opts && opts.uid != null ? String(opts.uid) : '';
  if (!uid) return [];
  const prefix = `${uid}::`;
  const keep = new Set();
  for (const id of opts.keepPhotoIds || []) {
    if (id) keep.add(`${uid}::${id}`);
  }
  const toDelete = [];
  for (const key of opts.allKeys || []) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
    if (keep.has(key)) continue;
    toDelete.push(key);
  }
  return toDelete;
}

/** Janela de dedupe para a mesma captura no mesmo item (anti double-tap / restore). */
const PHOTO_SAVE_DEDUPE_MS = 15000;
const PHOTO_SAVE_MAP_PRUNE_THRESHOLD = 64;

/**
 * @param {string} scopeKey
 * @param {string} dataUrl
 * @returns {string} chave vazia se fingerprint inválido
 */
function photoSaveDedupeKey(scopeKey, dataUrl) {
  const fp = photoFingerprint(dataUrl);
  if (!fp) return '';
  return `${scopeKey}::${fp}`;
}

/**
 * Remove entradas expiradas quando o mapa cresce demais.
 * @param {Map<string, number>} map
 * @param {number} [now]
 * @param {number} [dedupeMs]
 * @param {number} [threshold]
 * @returns {number} removidas
 */
function pruneRecentPhotoSaveMap(
  map,
  now = Date.now(),
  dedupeMs = PHOTO_SAVE_DEDUPE_MS,
  threshold = PHOTO_SAVE_MAP_PRUNE_THRESHOLD
) {
  if (!map || typeof map.size !== 'number' || map.size < threshold) return 0;
  let removed = 0;
  for (const [k, t] of map) {
    if (now - t > dedupeMs) {
      map.delete(k);
      removed += 1;
    }
  }
  return removed;
}

/**
 * @param {Map<string, number>} map
 * @param {string} scopeKey
 * @param {string} dataUrl
 * @param {number} [now]
 * @param {number} [dedupeMs]
 * @returns {boolean} true = duplicata / inválida (não gravar)
 */
function isDuplicatePhotoSaveInMap(
  map,
  scopeKey,
  dataUrl,
  now = Date.now(),
  dedupeMs = PHOTO_SAVE_DEDUPE_MS
) {
  const key = photoSaveDedupeKey(scopeKey, dataUrl);
  if (!key) return true;
  pruneRecentPhotoSaveMap(map, now, dedupeMs);
  const prev = map && map.get(key);
  return !!(prev && now - prev < dedupeMs);
}

/**
 * @param {Map<string, number>} map
 * @param {string} scopeKey
 * @param {string} dataUrl
 * @param {number} [now]
 * @returns {string} chave gravada ou ''
 */
function markPhotoSavedInMap(map, scopeKey, dataUrl, now = Date.now()) {
  const key = photoSaveDedupeKey(scopeKey, dataUrl);
  if (!key || !map) return '';
  map.set(key, now);
  return key;
}

/** Item precisa hidratar fotos do IDB / migrar data URLs legadas. */
function itemNeedsPhotoHydrate(item) {
  if (!item) return false;
  const photoIds = Array.isArray(item.photoIds) ? item.photoIds : [];
  const photos = Array.isArray(item.photos) ? item.photos : [];
  const incomplete = photoIds.length > 0 && photos.length < photoIds.length;
  const legacyData = photos.some((p) => typeof p === 'string' && p.startsWith('data:')) && !photoIds.length;
  const missingUrls = !photos.length && photoIds.length > 0;
  return incomplete || legacyData || missingUrls;
}

function hasLegacyDataUrlPhotos(item) {
  return !!(
    item
    && Array.isArray(item.photos)
    && item.photos.some((p) => typeof p === 'string' && p.startsWith('data:'))
  );
}

module.exports = {
  DEFAULT_PHOTO_MAX_PER_ITEM,
  DEFAULT_FINISHED_PHOTO_TTL_DAYS,
  MS_PER_DAY,
  PHOTO_SAVE_DEDUPE_MS,
  PHOTO_SAVE_MAP_PRUNE_THRESHOLD,
  remainingPhotoSlots,
  photoFingerprint,
  photoFingerprintFromBytes,
  itemPhotoScope,
  normalizeIdbPhotoValue,
  canAddPhoto,
  slicePhotoIdsForHydrate,
  collectPhotoIdsFromLists,
  historyEntryAgeMs,
  isHistoryWithinPhotoTtl,
  collectKeepPhotoIds,
  planIdbPhotoKeysToDelete,
  photoSaveDedupeKey,
  pruneRecentPhotoSaveMap,
  isDuplicatePhotoSaveInMap,
  markPhotoSavedInMap,
  itemNeedsPhotoHydrate,
  hasLegacyDataUrlPhotos
};
