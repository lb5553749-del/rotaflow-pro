'use strict';

/**
 * Pure helpers for multi-route hydrate / persist (testable without DOM).
 */

require('./types.js');

function cloneWithoutHeavyPhotos(list) {
  return (list || []).map((item) => {
    const copy = { ...item };
    if (Array.isArray(item.photos)) {
      copy.photoIds = Array.isArray(item.photoIds) ? [...item.photoIds] : [];
    }
    delete copy.photos;
    return copy;
  });
}

function createEmptyRoute(name, idFactory) {
  const id = typeof idFactory === 'function'
    ? idFactory()
    : `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: name || 'Rota 1',
    deliveries: [],
    nextSequenceNumber: 1,
    routeActive: false,
    routeMetrics: null,
    createdAt: Date.now()
  };
}

function normalizeRouteRecord(raw, migrateDeliveryFields) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const deliveriesList = Array.isArray(r.deliveries) ? r.deliveries : [];
  if (typeof migrateDeliveryFields === 'function') {
    deliveriesList.forEach(migrateDeliveryFields);
  }
  return {
    id: r.id || `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: r.name || 'Rota 1',
    deliveries: deliveriesList,
    nextSequenceNumber: r.nextSequenceNumber || (deliveriesList.length + 1),
    routeActive: !!r.routeActive,
    routeMetrics: r.routeMetrics || null,
    createdAt: r.createdAt || Date.now()
  };
}

/**
 * @param {object|null} data
 * @param {{ migrateDeliveryFields?: Function, normalizeRouteRecord?: Function, createEmptyRoute?: Function }} [deps]
 * @returns {{ routes: object[], activeRouteId: string, deliveries: object[], nextSequenceNumber: number, routeActive: boolean, routeMetrics: object|null }}
 */
function hydrateRoutesFromData(data, deps = {}) {
  const migrate = deps.migrateDeliveryFields || (() => {});
  const normalize = deps.normalizeRouteRecord
    || ((raw) => normalizeRouteRecord(raw, migrate));
  const emptyRoute = deps.createEmptyRoute
    || ((name) => createEmptyRoute(name));

  if (data && Array.isArray(data.routes) && data.routes.length) {
    const routes = data.routes.map(normalize);
    const preferred = data.activeRouteId;
    const active = routes.find((r) => r.id === preferred) || routes[0];
    return {
      routes,
      activeRouteId: active.id,
      deliveries: active.deliveries,
      nextSequenceNumber: active.nextSequenceNumber || (active.deliveries.length + 1),
      routeActive: !!active.routeActive,
      routeMetrics: active.routeMetrics || null
    };
  }

  const list = Array.isArray(data?.deliveries) ? data.deliveries : [];
  list.forEach(migrate);
  const boot = emptyRoute('Rota 1');
  boot.deliveries = list;
  boot.nextSequenceNumber = data?.nextSequenceNumber || (list.length + 1);
  return {
    routes: [boot],
    activeRouteId: boot.id,
    deliveries: boot.deliveries,
    nextSequenceNumber: boot.nextSequenceNumber,
    routeActive: false,
    routeMetrics: null
  };
}

/**
 * Payload gravado no localStorage. Só `routes[]` — sem o espelho legado `deliveries`
 * (a rota ativa já está em routes; dados/backups antigos migram em hydrateRoutesFromData).
 */
function buildPersistPayload({ routes, activeRouteId, nextSequenceNumber, agenda, nextAgendaId }) {
  return {
    data: {
      routes: (routes || []).map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt || Date.now(),
        nextSequenceNumber: r.nextSequenceNumber || 1,
        routeActive: !!r.routeActive,
        routeMetrics: r.routeMetrics || null,
        deliveries: cloneWithoutHeavyPhotos(r.deliveries || [])
      })),
      activeRouteId,
      nextSequenceNumber
    },
    agenda: {
      agenda: cloneWithoutHeavyPhotos(agenda),
      nextAgendaId
    }
  };
}

/**
 * Copia chaves legadas sem uid (`rotaflow_data`) para as chaves por uid.
 * Só quando ainda não há data keyed e o uid é guest/local.
 * @param {{ getItem: Function, setItem: Function }} storage
 * @param {(base: string) => string} storageKey
 * @returns {boolean} true se migrou
 */
function migrateLegacyLocalStorageKeys(storage, storageKey) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storageKey !== 'function') {
    return false;
  }
  if (storage.getItem(storageKey('data'))) return false;
  const legacyData = storage.getItem('rotaflow_data');
  if (!legacyData) return false;
  storage.setItem(storageKey('data'), legacyData);
  const legacyAgenda = storage.getItem('rotaflow_agenda');
  if (legacyAgenda) storage.setItem(storageKey('agenda'), legacyAgenda);
  const legacyProfile = storage.getItem('rotaflow_profile');
  if (legacyProfile) storage.setItem(storageKey('profile'), legacyProfile);
  return true;
}

/**
 * Defaults de campos de item de agenda (sem telefones/coords — isso fica no caller).
 * @param {object} item
 * @returns {object}
 */
function normalizeAgendaItemDefaults(item) {
  if (!item || typeof item !== 'object') return item;
  if (item.pacotes === undefined) item.pacotes = 1;
  if (!item.photos) item.photos = [];
  if (!item.photoIds) item.photoIds = [];
  if (item.notes === undefined) item.notes = '';
  return item;
}

/**
 * @param {object|null} data
 * @returns {{ agenda: object[], nextAgendaId: number }}
 */
function parseAgendaStorage(data) {
  const agenda = Array.isArray(data?.agenda) ? data.agenda : [];
  const nextAgendaId = data?.nextAgendaId || 1;
  return { agenda, nextAgendaId };
}

/**
 * Migra template WhatsApp legado (km/ETA, saudação curta, Correx hardcoded).
 * @param {string|null|undefined} message
 * @param {string} defaultMessage
 * @returns {{ message: string, changed: boolean }}
 */
function migrateWhatsAppTemplate(message, defaultMessage) {
  if (!message) {
    return { message: defaultMessage || '', changed: true };
  }
  const beforeMsg = message;
  let next = message;
  const alreadyNew = /Estamos chegando em breve/.test(beforeMsg)
    && /\{endereco\}/.test(beforeMsg)
    && /\{link\}/.test(beforeMsg);
  const looksShort =
    /Acompanhe sua entrega/.test(beforeMsg) || /em tempo real/.test(beforeMsg);
  const looksLegacy =
    /\{km\}|\{min\}|Faltam cerca de/.test(beforeMsg)
    || (/Sua encomenda \(/.test(beforeMsg) && !alreadyNew);
  if (!alreadyNew && (looksShort || looksLegacy || !beforeMsg.trim())) {
    next = defaultMessage || '';
  } else if (!alreadyNew) {
    next = beforeMsg
      .replace(/\n?⏱\s*Faltam cerca de[^\n]*/g, '')
      .replace(/\n?[^\n]*\{km\}[^\n]*/g, '')
      .replace(/\n?[^\n]*\{min\}[^\n]*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!/\{link\}/.test(next)) {
      next = next.replace(/\s*$/, '\n{link}');
    }
  }
  if (/📦\s*Correx express/i.test(next) && !/\{empresa\}/.test(next)) {
    next = next.replace(/📦\s*Correx express/gi, '📦 {empresa}');
  }
  return { message: next, changed: next !== beforeMsg };
}

/**
 * Garante empresa padrão no perfil.
 * @param {object} profile
 * @param {string} defaultEmpresa
 * @returns {{ profile: object, changed: boolean }}
 */
function ensureProfileEmpresa(profile, defaultEmpresa) {
  const p = profile && typeof profile === 'object' ? profile : {};
  if (!p.empresa || !String(p.empresa).trim()) {
    return { profile: { ...p, empresa: defaultEmpresa || '' }, changed: true };
  }
  return { profile: p, changed: false };
}

module.exports = {
  cloneWithoutHeavyPhotos,
  createEmptyRoute,
  normalizeRouteRecord,
  hydrateRoutesFromData,
  buildPersistPayload,
  migrateLegacyLocalStorageKeys,
  normalizeAgendaItemDefaults,
  parseAgendaStorage,
  migrateWhatsAppTemplate,
  ensureProfileEmpresa
};
