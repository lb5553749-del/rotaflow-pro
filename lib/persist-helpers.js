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

module.exports = {
  cloneWithoutHeavyPhotos,
  createEmptyRoute,
  normalizeRouteRecord,
  hydrateRoutesFromData,
  buildPersistPayload
};
