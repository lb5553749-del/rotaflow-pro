'use strict';

/**
 * Pure helpers for risk-area alerts (bairro/rua/região).
 * Levels: amarelo (caution) / vermelho (high — prefer daytime).
 * Local-first: callers pass Storage; no DOM.
 */

const RISK_AREAS_PREF_KEY = 'rotaflow_risk_areas';
const RISK_LEVELS = Object.freeze({ amarelo: 'amarelo', vermelho: 'vermelho' });
const DAYTIME_START_HOUR = 6;
const DAYTIME_END_HOUR = 18;

/**
 * @param {unknown} text
 * @returns {string}
 */
function normalizeRiskMatchText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {unknown} level
 * @returns {'amarelo'|'vermelho'|null}
 */
function normalizeRiskLevel(level) {
  const s = String(level || '').toLowerCase().trim();
  if (s === 'vermelho' || s === 'red' || s === 'alto') return RISK_LEVELS.vermelho;
  if (s === 'amarelo' || s === 'yellow' || s === 'medio' || s === 'médio') return RISK_LEVELS.amarelo;
  return null;
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }|null}
 */
function normalizeRiskArea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = String(raw.label || raw.match || '').trim();
  const match = normalizeRiskMatchText(raw.match || raw.label || '');
  const level = normalizeRiskLevel(raw.level);
  if (!label || !match || !level) return null;
  const id = String(raw.id || '').trim() || `risk_${match.replace(/\s+/g, '_')}_${level}`;
  return { id, label, match, level };
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }[]}
 */
function normalizeRiskAreasList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  list.forEach((item) => {
    const area = normalizeRiskArea(item);
    if (!area) return;
    const key = `${area.level}|${area.match}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(area);
  });
  return out;
}

/**
 * @param {Storage|null|undefined} storage
 * @returns {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }[]}
 */
function readRiskAreasPref(storage) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || typeof s.getItem !== 'function') return [];
    const raw = s.getItem(RISK_AREAS_PREF_KEY);
    if (!raw) return [];
    return normalizeRiskAreasList(JSON.parse(raw));
  } catch (_) {
    return [];
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @param {unknown} areas
 * @returns {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }[]}
 */
function writeRiskAreasPref(storage, areas) {
  const normalized = normalizeRiskAreasList(areas);
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || typeof s.setItem !== 'function') return normalized;
    s.setItem(RISK_AREAS_PREF_KEY, JSON.stringify(normalized));
  } catch (_) {}
  return normalized;
}

/**
 * @param {string} label
 * @param {'amarelo'|'vermelho'|string} level
 * @returns {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }|null}
 */
function createRiskArea(label, level) {
  return normalizeRiskArea({
    id: `risk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    match: label,
    level
  });
}

/**
 * Match address/name against saved areas. Vermelho wins over amarelo if both match.
 * @param {{ endereco?: string, nome?: string }|null|undefined} delivery
 * @param {Array<{ match?: string, level?: string, label?: string }>|null|undefined} areas
 * @returns {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }|null}
 */
function matchDeliveryRiskArea(delivery, areas) {
  const list = normalizeRiskAreasList(areas);
  if (!delivery || !list.length) return null;
  const hay = normalizeRiskMatchText(
    [delivery.endereco, delivery.nome].filter(Boolean).join(' ')
  );
  if (!hay) return null;
  let best = null;
  list.forEach((area) => {
    if (!area.match || hay.indexOf(area.match) === -1) return;
    if (!best || (best.level === RISK_LEVELS.amarelo && area.level === RISK_LEVELS.vermelho)) {
      best = area;
    }
  });
  return best;
}

/**
 * @param {'amarelo'|'vermelho'|string|null|undefined} level
 * @returns {string|null} hex fill for map pin (null = no override)
 */
function riskPinColorForLevel(level) {
  if (level === RISK_LEVELS.vermelho) return '#B91C1C';
  if (level === RISK_LEVELS.amarelo) return '#D97706';
  return null;
}

/**
 * @param {Date|number|null|undefined} now
 * @param {{ startHour?: number, endHour?: number }} [opts]
 * @returns {boolean}
 */
function isDaytimeHours(now, opts) {
  const start = opts && Number.isFinite(opts.startHour) ? opts.startHour : DAYTIME_START_HOUR;
  const end = opts && Number.isFinite(opts.endHour) ? opts.endHour : DAYTIME_END_HOUR;
  const d = now instanceof Date ? now : (now != null ? new Date(now) : new Date());
  if (Number.isNaN(d.getTime())) return true;
  const h = d.getHours();
  return h >= start && h < end;
}

/**
 * Soft reorder: push vermelho-risk stops earlier when daytime (safer window).
 * Does not change relative order among non-risk / amarelo stops beyond stable partition.
 * @template {{ endereco?: string, nome?: string }} T
 * @param {T[]} ordered
 * @param {Array} areas
 * @param {{ now?: Date|number, daytime?: boolean }} [opts]
 * @returns {T[]}
 */
function preferDaytimeRiskOrder(ordered, areas, opts) {
  const list = Array.isArray(ordered) ? ordered.slice() : [];
  if (list.length < 2) return list;
  const daytime = opts && typeof opts.daytime === 'boolean'
    ? opts.daytime
    : isDaytimeHours(opts && opts.now);
  if (!daytime) return list;
  const red = [];
  const rest = [];
  list.forEach((stop) => {
    const hit = matchDeliveryRiskArea(stop, areas);
    if (hit && hit.level === RISK_LEVELS.vermelho) red.push(stop);
    else rest.push(stop);
  });
  if (!red.length) return list;
  return red.concat(rest);
}

/**
 * @param {object[]} stops
 * @param {Array} areas
 * @param {{ now?: Date|number }} [opts]
 * @returns {{
 *   matches: Array<{ stop: object, area: object }>,
 *   yellowCount: number,
 *   redCount: number,
 *   daytime: boolean,
 *   toastMessage: string|null,
 *   preferDaytimeNote: boolean
 * }}
 */
function summarizeRouteRisk(stops, areas, opts) {
  const list = Array.isArray(stops) ? stops : [];
  const daytime = isDaytimeHours(opts && opts.now);
  const matches = [];
  let yellowCount = 0;
  let redCount = 0;
  list.forEach((stop) => {
    const area = matchDeliveryRiskArea(stop, areas);
    if (!area) return;
    matches.push({ stop, area });
    if (area.level === RISK_LEVELS.vermelho) redCount += 1;
    else yellowCount += 1;
  });
  let toastMessage = null;
  let preferDaytimeNote = false;
  if (matches.length) {
    const parts = [];
    if (redCount) parts.push(`${redCount} área(s) vermelha(s)`);
    if (yellowCount) parts.push(`${yellowCount} amarela(s)`);
    toastMessage = `Atenção: ${parts.join(' e ')} na rota`;
    if (redCount && !daytime) {
      preferDaytimeNote = true;
      toastMessage += ' — priorize diurno nas vermelhas';
    } else if (redCount && daytime) {
      toastMessage += ' — vermelhas adiantadas (diurno)';
    }
  }
  return {
    matches,
    yellowCount,
    redCount,
    daytime,
    toastMessage,
    preferDaytimeNote
  };
}

/**
 * Short pt-BR label for list/panel badges.
 * @param {'amarelo'|'vermelho'|string|null|undefined} level
 * @returns {string}
 */
function riskLevelBadgeLabel(level) {
  if (level === RISK_LEVELS.vermelho) return 'Risco alto';
  if (level === RISK_LEVELS.amarelo) return 'Atenção';
  return '';
}

module.exports = {
  RISK_AREAS_PREF_KEY,
  RISK_LEVELS,
  DAYTIME_START_HOUR,
  DAYTIME_END_HOUR,
  normalizeRiskMatchText,
  normalizeRiskLevel,
  normalizeRiskArea,
  normalizeRiskAreasList,
  readRiskAreasPref,
  writeRiskAreasPref,
  createRiskArea,
  matchDeliveryRiskArea,
  riskPinColorForLevel,
  isDaytimeHours,
  preferDaytimeRiskOrder,
  summarizeRouteRisk,
  riskLevelBadgeLabel
};
