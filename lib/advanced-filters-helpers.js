'use strict';

/**
 * Filtros avançados da lista de entregas — lógica pura (sem DOM).
 *
 * A regra de negócio vivia numa classe ESM em src/js/, fora da cobertura de
 * testes (src/js não é importável pelo Node: pacote CommonJS com sintaxe
 * ESM em arquivos .js). Aqui ela fica testável; src/js/advanced-filters.js
 * é só o adapter stateful que persiste os presets no localStorage.
 */

require('./search-helpers.js');

const { filterDeliveriesByText } = require('./search-helpers.js');
const { extractDistrict } = require('./map-helpers.js');
const SAVED_FILTERS_KEY = 'rotaflow_saved_filters';
const FILTER_KEYS = ['status', 'search', 'district', 'priority', 'hasPhotos', 'failReason'];

/**
 * Campos de uma entrega que os filtros avançados leem.
 * @typedef {Delivery} FilterableDelivery
 * @property {*} [id]
 * @property {string} [status]
 * @property {string} [endereco]
 * @property {boolean} [priority]
 * @property {string} [failReason]
 * @property {string[]} [photoIds]
 * @property {string[]} [photos]
 */

/** Shape canônico dos filtros ativos. */
function defaultActiveFilters() {
  return { status: [], search: '', district: [], priority: null, hasPhotos: null, failReason: [], tipo: [] };
}

/**
 * Fotos da entrega: photoIds é a fonte da verdade (photos pode não estar
 * hidratado fora do painel). Mesma regra de itemListPhotoCount em list-helpers.
 */
function itemPhotoCount(delivery) {
  if (!delivery) return 0;
  if (Array.isArray(delivery.photoIds) && delivery.photoIds.length) return delivery.photoIds.length;
  if (Array.isArray(delivery.photos) && delivery.photos.length) return delivery.photos.length;
  return 0;
}

/**
 * Bairro de um endereço. Parser único em lib/map-helpers.js (compartilhado
 * com as áreas de risco); reexportado aqui pra manter a API do módulo.
 */
function extractDistrictFromAddress(address) {
  return extractDistrict(address);
}

/** Bairros distintos disponíveis pra alimentar o seletor, em ordem alfabética. */
function availableDistricts(deliveries) {
  const set = new Set();
  (Array.isArray(deliveries) ? deliveries : []).forEach((d) => {
    const district = extractDistrict(d && d.endereco);
    if (district) set.add(district);
  });
  return Array.from(set).sort();
}

/**
 * Aplica os filtros ativos. Cada etapa só roda quando há algo pra filtrar,
 * e são todas conjuntivas (AND).
 * @param {FilterableDelivery[]} deliveries
 * @param {any} active state de filtros ativos
 * @returns {FilterableDelivery[]} nova lista filtrada (não muta a entrada)
 */
function applyAdvancedFilters(deliveries, active) {
  const a = active || defaultActiveFilters();
  let filtered = Array.isArray(deliveries) ? deliveries.slice() : [];
  if (a.search) {
    filtered = filterDeliveriesByText(filtered, a.search);
  }
  if (Array.isArray(a.status) && a.status.length) {
    filtered = filtered.filter((d) => a.status.includes(d.status));
  }
  if (Array.isArray(a.district) && a.district.length) {
    filtered = filtered.filter((d) => {
      const bairro = extractDistrict(d.endereco).toLowerCase();
      return a.district.some((f) => bairro.includes(String(f).toLowerCase()));
    });
  }
  if (a.priority) {
    filtered = filtered.filter((d) => (a.priority === 'high' ? d.priority === true : !d.priority));
  }
  if (a.hasPhotos !== null && a.hasPhotos !== undefined) {
    filtered = filtered.filter((d) => itemPhotoCount(d) > 0 === !!a.hasPhotos);
  }
  if (Array.isArray(a.tipo) && a.tipo.length) {
    filtered = filtered.filter((d) => a.tipo.includes(String(d.tipo || 'entrega')));
  }
  if (Array.isArray(a.failReason) && a.failReason.length) {
    filtered = filtered.filter((d) => d.status === 'falhou' && a.failReason.includes(d.failReason));
  }
  return filtered;
}

/** Algum filtro está efetivamente restringindo a lista? */
function hasActiveFilters(active) {
  const a = active || defaultActiveFilters();
  return !!(
    a.search !== ''
    || (Array.isArray(a.status) && a.status.length)
    || (Array.isArray(a.district) && a.district.length)
    || a.priority !== null
    || (a.hasPhotos !== null && a.hasPhotos !== undefined)
    || (Array.isArray(a.failReason) && a.failReason.length)
    || (Array.isArray(a.tipo) && a.tipo.length)
  );
}

/** Quantos chips de filtro aparecem ativos na UI. */
function countActiveFilters(active) {
  const a = active || defaultActiveFilters();
  let count = 0;
  if (a.search) count += 1;
  if (Array.isArray(a.status) && a.status.length) count += 1;
  if (Array.isArray(a.district) && a.district.length) count += 1;
  if (a.priority !== null) count += 1;
  if (a.hasPhotos !== null && a.hasPhotos !== undefined) count += 1;
  if (Array.isArray(a.failReason) && a.failReason.length) count += 1;
  if (Array.isArray(a.tipo) && a.tipo.length) count += 1;
  return count;
}

/** Seta um filtro escalar/array, ignorando chaves fora do shape. */
function setFilterValue(active, key, value) {
  if (active && FILTER_KEYS.includes(key)) active[key] = value;
}

/** Alterna um valor dentro de um filtro array (não-mutação só se não for array). */
function toggleArrayFilter(active, key, value) {
  if (!active || !Array.isArray(active[key])) return;
  const idx = active[key].indexOf(value);
  if (idx >= 0) active[key].splice(idx, 1);
  else active[key].push(value);
}

/** Deep clone do state (presets e state importado nunca compartilham referência). */
function cloneFilters(state) {
  return JSON.parse(JSON.stringify(state || defaultActiveFilters()));
}

/** Lê os presets do storage injetado (localStorage no app, memória no teste). */
function loadSavedFilters(storage) {
  try {
    const saved = storage ? storage.getItem(SAVED_FILTERS_KEY) : null;
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function persistSavedFilters(storage, savedFilters) {
  try {
    if (storage) storage.setItem(SAVED_FILTERS_KEY, JSON.stringify(savedFilters || {}));
  } catch (e) {}
}

module.exports = {
  SAVED_FILTERS_KEY,
  defaultActiveFilters,
  extractDistrict: extractDistrictFromAddress,
  availableDistricts,
  applyAdvancedFilters,
  hasActiveFilters,
  countActiveFilters,
  setFilterValue,
  toggleArrayFilter,
  cloneFilters,
  loadSavedFilters,
  persistSavedFilters
};
