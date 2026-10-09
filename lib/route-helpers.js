'use strict';

/**
 * Pure helpers for multi-route create / switch / rename / list (no DOM).
 */

/**
 * Next default name: "Rota N" where N is max existing + 1.
 * @param {Array<{ name?: string }>} routes
 * @returns {string}
 */
function nextRouteName(routes) {
  let max = 0;
  for (const r of routes || []) {
    const m = /^Rota\s+(\d+)$/i.exec(String(r.name || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `Rota ${max + 1}`;
}

/**
 * Mirror in-memory active route fields back into the routes[] array.
 * Returns a new state object (does not mutate input arrays/objects).
 *
 * @param {{
 *   routes?: object[],
 *   activeRouteId?: string|null,
 *   deliveries?: object[],
 *   nextSequenceNumber?: number,
 *   routeActive?: boolean,
 *   routeMetrics?: object|null
 * }} state
 * @param {(name?: string) => object} createEmptyRoute
 * @returns {{ routes: object[], activeRouteId: string }}
 */
function syncActiveRouteState(state, createEmptyRoute) {
  const routes = Array.isArray(state?.routes) ? state.routes : [];
  const deliveries = Array.isArray(state?.deliveries) ? state.deliveries : [];
  const nextSequenceNumber = state?.nextSequenceNumber || 1;
  const routeActive = !!state?.routeActive;
  const routeMetrics = state?.routeMetrics || null;

  if (!routes.length) {
    const boot = createEmptyRoute('Rota 1');
    boot.deliveries = deliveries;
    boot.nextSequenceNumber = nextSequenceNumber;
    boot.routeActive = routeActive;
    boot.routeMetrics = routeMetrics;
    return { routes: [boot], activeRouteId: boot.id };
  }

  let activeRouteId = state?.activeRouteId;
  let active = routes.find((r) => r && r.id === activeRouteId);
  if (!active) {
    active = routes[0];
    activeRouteId = active.id;
  }

  const routesOut = routes.map((r) => {
    if (!r || r.id !== activeRouteId) return r;
    return {
      ...r,
      deliveries,
      nextSequenceNumber,
      routeActive,
      routeMetrics
    };
  });
  return { routes: routesOut, activeRouteId };
}

/**
 * @param {object[]} routes
 * @param {string} routeId
 * @returns {object|null}
 */
function findRouteById(routes, routeId) {
  if (!routeId) return null;
  return (routes || []).find((r) => r && r.id === routeId) || null;
}

/**
 * Chip model for the route switcher UI.
 * @param {object[]} routes
 * @param {string|null} activeRouteId
 * @param {number} activeDeliveriesCount
 * @returns {Array<{ id: string, name: string, count: number, active: boolean }>}
 */
function routeSwitcherItems(routes, activeRouteId, activeDeliveriesCount) {
  return (routes || []).map((r) => ({
    id: r.id,
    name: r.name || 'Rota',
    count: r.id === activeRouteId
      ? (activeDeliveriesCount || 0)
      : ((r.deliveries && r.deliveries.length) || 0),
    active: r.id === activeRouteId
  }));
}

/**
 * @param {string} name
 * @param {number} [maxLen=40]
 * @returns {string}
 */
function sanitizeRouteName(name, maxLen = 40) {
  const s = String(name || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.slice(0, maxLen);
}

/**
 * Rename a route in the list (immutable).
 * @param {object[]} routes
 * @param {string} routeId
 * @param {string} newName
 * @returns {{ ok: true, routes: object[], name: string } | { ok: false, reason: string }}
 */
function renameRouteInList(routes, routeId, newName) {
  const name = sanitizeRouteName(newName);
  if (!name) return { ok: false, reason: 'empty' };
  const list = Array.isArray(routes) ? routes : [];
  if (!list.some((r) => r && r.id === routeId)) {
    return { ok: false, reason: 'missing' };
  }
  return {
    ok: true,
    name,
    routes: list.map((r) => (r && r.id === routeId ? { ...r, name } : r))
  };
}

/**
 * Append a new empty route after syncing the current one.
 * @param {{
 *   routes?: object[],
 *   activeRouteId?: string|null,
 *   deliveries?: object[],
 *   nextSequenceNumber?: number,
 *   routeActive?: boolean,
 *   routeMetrics?: object|null
 * }} state
 * @param {(name?: string) => object} createEmptyRoute
 * @returns {{ routes: object[], previousName: string, route: object }}
 */
function appendEmptyRoute(state, createEmptyRoute) {
  const synced = syncActiveRouteState(state, createEmptyRoute);
  const previous = findRouteById(synced.routes, synced.activeRouteId);
  const previousName = (previous && previous.name) || 'Rota atual';
  const route = createEmptyRoute();
  return {
    routes: synced.routes.concat([route]),
    previousName,
    route
  };
}

/**
 * Append an imported route (route-export backup) without touching existing ones.
 * Regenerates the id when it is missing or already taken on this device.
 * @param {object[]} routes
 * @param {object} route
 * @param {() => string} [idFactory]
 * @returns {{ routes: object[], route: object }}
 */
function mergeImportedRoute(routes, route, idFactory) {
  const list = Array.isArray(routes) ? routes.slice() : [];
  const imported = { ...(route && typeof route === 'object' ? route : {}) };
  const clash = !imported.id || list.some((r) => r && r.id === imported.id);
  if (clash) {
    imported.id = typeof idFactory === 'function'
      ? idFactory()
      : `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  list.push(imported);
  return { routes: list, route: imported };
}

module.exports = {
  nextRouteName,
  syncActiveRouteState,
  findRouteById,
  routeSwitcherItems,
  sanitizeRouteName,
  renameRouteInList,
  appendEmptyRoute,
  mergeImportedRoute
};
