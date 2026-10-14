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

/**
 * Progresso do dia para a barra de progresso da aba Rota.
 * Conta só status 'entregue' (falhas não são entregas concluídas) — o resumo
 * do dia já mostra as falhas separadas, a barra não deve duplicá-las.
 * @param {{ total: number, entregue: number, falhou: number, pendente: number }|null|undefined} stats
 * @returns {{ done: number, total: number, pct: number, label: string }}
 */
function dayProgressBar(stats) {
  const total = stats && Number.isFinite(stats.total) ? stats.total : 0;
  const done = stats && Number.isFinite(stats.entregue) ? stats.entregue : 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return { done, total, pct, label: `${done} de ${total} ${total === 1 ? 'entrega' : 'entregas'}` };
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

/**
 * Telefones do painel (texto único).
 * @param {Array<{ label?: string, numero?: string }>|null|undefined} telefones
 * @param {(n: string) => string} [formatShort]
 */
function formatPanelPhonesText(telefones, formatShort) {
  if (!telefones || !telefones.length) return 'Não informado';
  const fmt = typeof formatShort === 'function' ? formatShort : ((n) => String(n || ''));
  return telefones.map((p) => {
    const label = p && p.label ? `${p.label}: ` : '';
    return label + fmt(p && p.numero);
  }).join(', ');
}

/**
 * Estado de UI do contador de fotos (mini + expandido).
 * @param {number} count
 */
function panelMiniPhotoUiState(count) {
  const n = Math.max(0, Number(count) || 0);
  return {
    count: n,
    miniHidden: n === 0,
    miniTitle: n === 0 ? '' : (n === 1 ? '1 foto nesta entrega' : `${n} fotos nesta entrega`),
    panelCountHidden: n === 0,
    panelCountText: n === 0 ? '' : (n === 1 ? '1 foto' : `${n} fotos`),
    saveAgendaDisabled: n === 0,
    saveAgendaTitle: n === 0
      ? 'Tire ou escolha uma foto primeiro'
      : 'Salvar a última foto na agenda deste cliente'
  };
}

/**
 * Classifica gesto de swipe no painel.
 * @param {number} dx
 * @param {number} dy
 * @param {{ minVertical?: number, minHorizontal?: number, verticalBias?: number, horizontalBias?: number }} [opts]
 * @returns {{ type: 'minimize'|'expand'|'next'|'prev' }|null}
 */
function resolvePanelSwipeGesture(dx, dy, opts) {
  const minVert = (opts && opts.minVertical) || 55;
  const minHoriz = (opts && opts.minHorizontal) || 55;
  const vertBias = (opts && opts.verticalBias) || 1.1;
  const horizBias = (opts && opts.horizontalBias) || 1.15;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (ady > minVert && ady > adx * vertBias) {
    return { type: dy > 0 ? 'minimize' : 'expand' };
  }
  if (adx < minHoriz || adx < ady * horizBias) return null;
  return { type: dx < 0 ? 'next' : 'prev' };
}

/**
 * Quais ações o painel deve exibir.
 * @param {object|null|undefined} delivery
 * @param {boolean} hasCoords
 */
function panelActionFlags(delivery, hasCoords) {
  const hasPhone = !!(delivery && delivery.telefones && delivery.telefones.length);
  const coords = !!hasCoords;
  const status = delivery && delivery.status;
  const isDone = status === 'entregue' || status === 'falhou';
  return {
    hasPhone,
    hasCoords: coords,
    isDone,
    showNav: coords,
    showWhatsApp: hasPhone,
    showUndo: isDone,
    showFailDeliver: !isDone,
    hasDualCta: coords && hasPhone
  };
}

module.exports = {
  isActiveStop,
  isPreferredNextStop,
  findNextInSequence,
  deliveryProgressInfo,
  dayProgressBar,
  deliveryPhotoCount,
  shouldKeepPanelMinimized,
  adjacentIndexResult,
  panelOpenClassPlan,
  panelCloseClassPlan,
  formatPanelPhonesText,
  panelMiniPhotoUiState,
  resolvePanelSwipeGesture,
  panelActionFlags
};
