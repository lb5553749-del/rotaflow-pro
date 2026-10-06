'use strict';

/**
 * Helpers puros de câmera / multi-foto (sem DOM, MediaDevices ou Capacitor).
 */

/**
 * Erros de cancelamento do picker nativo / permissão negada pelo usuário.
 * @param {unknown} err
 * @returns {boolean}
 */
function isPhotoPickCancelled(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.includes('cancel')
    || msg.includes('user denied')
    || msg.includes('no image')
    || msg.includes('picker was cancelled');
}

/**
 * Limita maxPhotos ao teto PHOTO_MAX (mínimo 1).
 * @param {number|undefined|null} requested
 * @param {number} photoMax
 * @param {{ multipleFallback?: number }} [opts]
 * @returns {number}
 */
function clampMaxPhotos(requested, photoMax, opts) {
  const cap = Math.max(1, Number(photoMax) || 1);
  const fallback = opts && opts.multipleFallback != null
    ? Number(opts.multipleFallback)
    : cap;
  const n = Number(requested);
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.max(1, Math.min(cap, base));
}

/**
 * @param {{ isNative?: boolean, hasOpenMultiCamera?: boolean }} [ctx]
 * @returns {boolean}
 */
function canUseNativeMultiCamera(ctx) {
  return !!(ctx && ctx.isNative && ctx.hasOpenMultiCamera);
}

/**
 * getUserMedia multi só no web — no nativo luta com o mapa Google Maps.
 * @param {{ isNative?: boolean, hasGetUserMedia?: boolean }} [ctx]
 * @returns {boolean}
 */
function canUseGetUserMediaMulti(ctx) {
  if (ctx && ctx.isNative) return false;
  return !!(ctx && ctx.hasGetUserMedia);
}

/**
 * @param {{ isNative?: boolean, hasOpenMultiCamera?: boolean, hasGetUserMedia?: boolean }} [ctx]
 * @returns {boolean}
 */
function canUseInAppMultiCamera(ctx) {
  return canUseNativeMultiCamera(ctx) || canUseGetUserMediaMulti(ctx);
}

/**
 * Status de permissão da câmera Capacitor.
 * @param {{ camera?: string }|null|undefined} status
 * @returns {boolean}
 */
function isCameraPermissionGranted(status) {
  return !!(status && (status.camera === 'granted' || status.camera === 'limited'));
}

/**
 * Dimensões do frame JPEG multi-cam (escala para caber em maxSide).
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @param {number} maxSide
 * @returns {{ w: number, h: number }|null}
 */
function multicamFrameSize(videoWidth, videoHeight, maxSide) {
  const vw = Number(videoWidth) || 0;
  const vh = Number(videoHeight) || 0;
  if (!vw || !vh) return null;
  const side = Math.max(1, Number(maxSide) || 1);
  const scale = Math.min(1, side / Math.max(vw, vh));
  return {
    w: Math.max(1, Math.round(vw * scale)),
    h: Math.max(1, Math.round(vh * scale))
  };
}

/**
 * Limite de ficheiros do input file (galeria/fallback).
 * @param {number} fileCount
 * @param {number} maxPhotos
 * @param {boolean} multiple
 * @returns {number}
 */
function filePickLimit(fileCount, maxPhotos, multiple) {
  const n = Math.max(0, Number(fileCount) || 0);
  const max = Math.max(1, Number(maxPhotos) || 1);
  if (multiple) return Math.min(n, max, 12);
  return Math.min(n, 1);
}

module.exports = {
  isPhotoPickCancelled,
  clampMaxPhotos,
  canUseNativeMultiCamera,
  canUseGetUserMediaMulti,
  canUseInAppMultiCamera,
  isCameraPermissionGranted,
  multicamFrameSize,
  filePickLimit
};
