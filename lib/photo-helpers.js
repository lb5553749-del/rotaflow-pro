'use strict';

/**
 * Pure photo helpers (caps, fingerprints, dataURL↔Blob conversion planning).
 */

const DEFAULT_PHOTO_MAX_PER_ITEM = 15;

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

module.exports = {
  DEFAULT_PHOTO_MAX_PER_ITEM,
  remainingPhotoSlots,
  photoFingerprint,
  photoFingerprintFromBytes,
  itemPhotoScope,
  normalizeIdbPhotoValue,
  canAddPhoto,
  slicePhotoIdsForHydrate
};
