'use strict';

/**
 * Pure helpers for the bottom delivery panel (navigation / progress / photos).
 * No DOM.
 */

/** @param {object|null|undefined} d */
function isActiveStop(d) {
  return !!(d && d.status !== 'entregue' && d.status !== 'falhou');
}

/** @param {object|null|undefined} d */
function isPreferredNextStop(d) {
  return isActiveStop(d) && !d.voltarDepois;
}

/**
 * @param {object[]} seq
 * @param {number} fromIdx
 * @param {(d: object) => boolean} pred
 * @param {{ wrap?: boolean }} [opts]
 */
function findNextInSequence(seq, fromIdx, pred, opts) {
  const list = Array.isArray(seq) ? seq : [];
  const wrap = !!(opts && opts.wrap);
  const start = Math.max(fromIdx, -1) + 1;
  for (let i = start; i < list.length; i++) {
    if (pred(list[i])) return list[i];
  }
  if (!wrap) return null;
  const end = Math.max(fromIdx, 0);
  for (let i = 0; i < end; i++) {
    if (pred(list[i])) return list[i];
  }
  return null;
}

/**
 * @param {object} delivery
 * @param {object[]} deliveries
 * @param {(d: object) => boolean} [activePred]
 * @returns {{ current: number, total: number, remaining: number }}
 */
function deliveryProgressInfo(delivery, deliveries, activePred) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  const total = list.length;
  let idx = delivery ? list.findIndex((d) => d.id === delivery.id) : -1;
  if (idx < 0) idx = 0;
  const current = (delivery && typeof delivery.routeOrder === 'number')
    ? delivery.routeOrder
    : (idx + 1);
  const pred = typeof activePred === 'function' ? activePred : isActiveStop;
  const remaining = list.filter(pred).length;
  return { current, total, remaining };
}

/** @param {object|null|undefined} delivery */
function deliveryPhotoCount(delivery) {
  if (!delivery) return 0;
  if (Array.isArray(delivery.photoIds) && delivery.photoIds.length) return delivery.photoIds.length;
  if (Array.isArray(delivery.photos) && delivery.photos.length) return delivery.photos.length;
  return 0;
}

/**
 * Whether the panel should remain minimized after navigation.
 * @param {{ classList: { contains: (c: string) => boolean } }|null|undefined} panel
 * @param {boolean} [keepMinimized]
 */
function shouldKeepPanelMinimized(panel, keepMinimized) {
  if (keepMinimized) return true;
  return !!(panel && panel.classList.contains('open') && panel.classList.contains('minimized'));
}

/**
 * Adjacent index navigation result (no wrap).
 * @param {number} idx
 * @param {number} direction 1 | -1
 * @param {number} length
 * @returns {{ ok: true, next: number }|{ ok: false, reason: 'empty'|'first'|'last'|'missing' }}
 */
function adjacentIndexResult(idx, direction, length) {
  const len = Number(length) || 0;
  if (len <= 0) return { ok: false, reason: 'empty' };
  if (idx < 0) return { ok: true, next: 0 };
  const next = idx + direction;
  if (next < 0) return { ok: false, reason: 'first' };
  if (next >= len) return { ok: false, reason: 'last' };
  return { ok: true, next };
}

/**
 * CSS class plan for opening the panel.
 * @param {object|null|undefined} delivery
 * @param {boolean} [stayMini]
 */
function panelOpenClassPlan(delivery, stayMini) {
  return {
    open: true,
    minimized: !!stayMini,
    redBg: !!delivery && (delivery.pacotes || 1) >= 2
  };
}

/** CSS class plan for closing the panel. */
function panelCloseClassPlan() {
  return { open: false, minimized: false, redBg: false };
}

module.exports = {
  isActiveStop,
  isPreferredNextStop,
  findNextInSequence,
  deliveryProgressInfo,
  deliveryPhotoCount,
  shouldKeepPanelMinimized,
  adjacentIndexResult,
  panelOpenClassPlan,
  panelCloseClassPlan
};
