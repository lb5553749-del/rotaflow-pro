/**
 * Rotas múltiplas — criar / trocar / renomear / listar (switcher).
 * main.js injeta estado, mapa, persistência e UI via configureRoutes().
 */
import {
    createEmptyRoute as createEmptyRoutePure,
    normalizeRouteRecord as normalizeRouteRecordPure,
    hydrateRoutesFromData as hydrateRoutesState
} from '../../lib/persist-helpers.js';
import {
    nextRouteName as nextRouteNameOf,
    syncActiveRouteState,
    findRouteById,
    routeSwitcherItems,
    renameRouteInList,
    appendEmptyRoute,
    sanitizeRouteName
} from '../../lib/route-helpers.js';
import { routeDayStats } from '../../lib/history-helpers.js';
import { escapeHtml } from '../../lib/html.js';

let deps = {
    getRoutes: () => [],
    setRoutes: () => {},
    getActiveRouteId: () => null,
    setActiveRouteId: () => {},
    getDeliveries: () => [],
    setDeliveries: () => {},
    getNextSequenceNumber: () => 1,
    setNextSequenceNumber: () => {},
    getRouteActive: () => false,
    setRouteActive: () => {},
    getRouteMetrics: () => null,
    setRouteMetrics: () => {},
    migrateTelefones: () => {},
    migrateFavorito: () => {},
    normalizeDeliveryCoords: () => {},
    seedIdCounter: () => {},
    closeDeliveryPanel: () => {},
    clearActiveStopNotification: () => {},
    rebuildMarkers: () => {},
    scheduleRouteRefresh: () => {},
    updateOptimizeFabVisibility: () => {},
    updateProgressAndEstimates: () => {},
    renderDeliveriesList: () => {},
    updateLastIdDisplay: () => {},
    updateDaySummary: () => {},
    persistStorageNow: () => false,
    showToast: () => {},
    showConfirmModal: async () => false,
    showPromptModal: async () => null,
    archiveCurrentRouteDay: () => {}
};

export function configureRoutes(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export {
    nextRouteNameOf as nextRouteName,
    findRouteById,
    routeSwitcherItems,
    sanitizeRouteName,
    renameRouteInList
};

function migrateDeliveryFields(d) {
    deps.migrateTelefones(d);
    deps.migrateFavorito(d);
    if (d.pacotes === undefined) d.pacotes = 1;
    if (d.savedToAgenda === undefined) d.savedToAgenda = false;
    if (!d.photos) d.photos = [];
    if (!d.photoIds) d.photoIds = [];
    if (d.notes === undefined) d.notes = '';
    deps.normalizeDeliveryCoords(d);
}

export function createEmptyRoute(name) {
    const routes = deps.getRoutes();
    return createEmptyRoutePure(name || nextRouteNameOf(routes));
}

export function normalizeRouteRecord(raw) {
    return normalizeRouteRecordPure(raw, migrateDeliveryFields);
}

/** Espelha a rota ativa (deliveries em memória) de volta no array `routes`. */
export function syncActiveRouteIntoRoutes() {
    const synced = syncActiveRouteState({
        routes: deps.getRoutes(),
        activeRouteId: deps.getActiveRouteId(),
        deliveries: deps.getDeliveries(),
        nextSequenceNumber: deps.getNextSequenceNumber(),
        routeActive: deps.getRouteActive(),
        routeMetrics: deps.getRouteMetrics()
    }, createEmptyRoute);
    deps.setRoutes(synced.routes);
    deps.setActiveRouteId(synced.activeRouteId);
}

function clearMapRouteLines() {
    // Overlay Directions vive em routing.js; a linha azul não é desenhada no mapa.
}

export function applyLoadedRouteState(route, { refreshMap = true } = {}) {
    if (!route) return;
    deps.setActiveRouteId(route.id);
    const deliveries = route.deliveries || [];
    deps.setDeliveries(deliveries);
    deps.setNextSequenceNumber(route.nextSequenceNumber || (deliveries.length + 1));
    deps.setRouteActive(!!route.routeActive);
    deps.setRouteMetrics(route.routeMetrics || null);
    deps.seedIdCounter();
    deps.closeDeliveryPanel();
    deps.clearActiveStopNotification();
    clearMapRouteLines();
    if (refreshMap) {
        deps.rebuildMarkers(false);
        if (route.routeActive) deps.scheduleRouteRefresh();
        else {
            deps.updateOptimizeFabVisibility();
            deps.updateProgressAndEstimates();
        }
    }
    deps.renderDeliveriesList();
    renderRouteSwitcher();
    deps.updateLastIdDisplay(deliveries.length ? deliveries[deliveries.length - 1].sequentialId : null);
    deps.updateDaySummary();
}

/** Aceita o schema atual (`routes[]`) e o antigo (só `deliveries`) — ver lib/persist-helpers.js. */
export function hydrateRoutesFromData(data) {
    const state = hydrateRoutesState(data, {
        migrateDeliveryFields,
        normalizeRouteRecord,
        createEmptyRoute
    });
    deps.setRoutes(state.routes);
    deps.setActiveRouteId(state.activeRouteId);
    deps.setDeliveries(state.deliveries);
    deps.setNextSequenceNumber(state.nextSequenceNumber);
    deps.setRouteActive(state.routeActive);
    deps.setRouteMetrics(state.routeMetrics);
}

export function renderRouteSwitcher() {
    const el = document.getElementById('routeSwitcher');
    if (!el) return;
    const routes = deps.getRoutes();
    if (routes.length <= 1) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    el.hidden = false;
    const items = routeSwitcherItems(
        routes,
        deps.getActiveRouteId(),
        deps.getDeliveries().length
    );
    el.innerHTML = items.map((r) => (
        `<button type="button" class="route-chip${r.active ? ' is-active' : ''}" role="tab" aria-selected="${r.active ? 'true' : 'false'}" data-route-id="${escapeHtml(r.id)}" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}<span class="route-chip-count">${r.count}</span></button>`
    )).join('');
    el.querySelectorAll('[data-route-id]').forEach((btn) => {
        const id = btn.getAttribute('data-route-id');
        btn.addEventListener('click', () => switchToRoute(id));
        btn.addEventListener('dblclick', (e) => {
            e.preventDefault();
            renameRoute(id);
        });
    });
}

export function switchToRoute(routeId) {
    if (!routeId || routeId === deps.getActiveRouteId()) return;
    const target = findRouteById(deps.getRoutes(), routeId);
    if (!target) return;
    syncActiveRouteIntoRoutes();
    applyLoadedRouteState(target);
    deps.persistStorageNow();
    deps.showToast(`Alternado para ${target.name}`);
}

export async function startNewRoute() {
    syncActiveRouteIntoRoutes();
    if (!deps.getDeliveries().length) {
        deps.showToast('A rota atual já está vazia — adicione paradas ou troque de rota', true);
        return;
    }
    const ok = await deps.showConfirmModal({
        title: 'Nova rota',
        message: 'Criar outra rota vazia? A rota atual permanece intacta (entregas, status, fotos e otimização). A agenda não muda.',
        confirmText: 'Criar rota'
    });
    if (!ok) return;
    const { routes, previousName, route } = appendEmptyRoute({
        routes: deps.getRoutes(),
        activeRouteId: deps.getActiveRouteId(),
        deliveries: deps.getDeliveries(),
        nextSequenceNumber: deps.getNextSequenceNumber(),
        routeActive: deps.getRouteActive(),
        routeMetrics: deps.getRouteMetrics()
    }, createEmptyRoute);
    deps.setRoutes(routes);
    applyLoadedRouteState(route);
    deps.persistStorageNow();
    deps.showToast(`${route.name} criada — ${previousName} continua disponível`);
}

export async function clearRoute() {
    const deliveries = deps.getDeliveries();
    if (!deliveries.length) {
        deps.showToast('A rota já está vazia', true);
        return;
    }
    const stats = routeDayStats(deliveries);
    const pendingNote = stats.pendente > 0
        ? ` Ainda há ${stats.pendente} parada(s) pendente(s).`
        : '';
    const ok = await deps.showConfirmModal({
        title: 'Limpar rota',
        message: `Deseja limpar todas as entregas da rota atual? O dia será salvo no histórico.${pendingNote} A agenda não será alterada.`,
        confirmText: 'Limpar',
        danger: true
    });
    if (!ok) return;
    deps.archiveCurrentRouteDay({ silent: true, clearAfter: true });
    deps.showToast('Rota limpa e dia salvo no histórico');
}

export async function renameRoute(routeId) {
    const id = routeId || deps.getActiveRouteId();
    const target = findRouteById(deps.getRoutes(), id);
    if (!target) return false;
    const value = await deps.showPromptModal({
        title: 'Renomear rota',
        message: 'Nome da rota (máx. 40 caracteres).',
        defaultValue: target.name || '',
        placeholder: 'Ex.: Centro manhã'
    });
    if (value == null) return false;
    const result = renameRouteInList(deps.getRoutes(), id, value);
    if (!result.ok) {
        if (result.reason === 'empty') {
            deps.showToast('Informe um nome para a rota', true);
        }
        return false;
    }
    deps.setRoutes(result.routes);
    renderRouteSwitcher();
    deps.persistStorageNow();
    deps.showToast(`Rota renomeada para ${result.name}`);
    return true;
}
