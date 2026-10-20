'use strict';

/**
 * Day-archive helpers (history list). No DOM, no localStorage.
 */

const { cloneWithoutHeavyPhotos } = require('./persist-helpers.js');

const HISTORY_MAX_DAYS = 30;

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHistoryDate(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return key || '—';
  try {
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (_) {
    return key;
  }
}

function routeDayStats(list) {
  const arr = list || [];
  return {
    total: arr.length,
    entregue: arr.filter((x) => x.status === 'entregue').length,
    falhou: arr.filter((x) => x.status === 'falhou').length,
    pendente: arr.filter((x) => x.status !== 'entregue' && x.status !== 'falhou').length
  };
}

/**
 * Attach economics snapshot onto a history entry (mutates entry).
 * @param {Delivery} entry
 * @param {{ km?: number, fuelCost?: number, revenue?: number, netProfit?: number, meters?: number, message?: string }|null|undefined} economics
 * @returns {Delivery}
 */
function attachHistoryEconomics(entry, economics) {
  if (!entry || !economics) return entry;
  entry.economics = {
    meters: Number(economics.meters) || 0,
    km: Number(economics.km) || 0,
    fuelCost: Number(economics.fuelCost) || 0,
    revenue: Number(economics.revenue) || 0,
    netProfit: Number(economics.netProfit) || 0,
    message: economics.message ? String(economics.message) : undefined
  };
  return entry;
}

function snapshotDeliveriesForHistory(list) {
  return cloneWithoutHeavyPhotos(list).map((d) => ({
    ...d,
    status: d.status,
    voltarDepois: !!d.voltarDepois,
    failReason: d.failReason || undefined
  }));
}

function prependHistoryDay(history, entry, maxDays = HISTORY_MAX_DAYS) {
  const dateKey = entry && entry.date;
  return [entry, ...(history || []).filter((h) => h.date !== dateKey)].slice(0, maxDays);
}

module.exports = {
  HISTORY_MAX_DAYS,
  localDateKey,
  formatHistoryDate,
  routeDayStats,
  attachHistoryEconomics,
  snapshotDeliveriesForHistory,
  prependHistoryDay
};
