/**
 * Directions / otimização de rota (Google Directions + fallback por proximidade).
 * main.js injeta estado, GPS, persistência e UI via configureRouting().
 */
import {
    MAX_WAYPOINTS,
    pendingStops as pendingStopsOf,
    routeSignature as routeSignatureOf,
    orderByProximity as orderByProximityOf,
    chunkPoints,
    applyStopOrder as applyStopOrderOn,
    planDirectionsLegs,
    orderedFromDirectionsPlan,
    buildRoutePoints,
    clearStopRouteFields,
    applyLegsToOrdered,
    assignCumulativeEtas,
    assignRouteOrderIndexes,
    buildRouteMetrics,
    shouldShowOptimizeFab,
    directionsErrorMessage
} from '../../lib/routing-helpers.js';
import { formatKm, formatDuration } from '../../lib/track-schema.js';

let deps = {
    getDeliveries: () => [],
    getStartPoint: () => null,
    getRouteActive: () => false,
    setRouteActive: () => {},
    getRouteMetrics: () => null,
    setRouteMetrics: () => {},
    requestStartPoint: async () => null,
    showStartMarker: () => {},
    saveStorage: () => {},
    renderDeliveriesList: () => {},
    rebuildMarkers: () => {},
    centerMapOnMarkers: () => {},
    switchSidebarTab: () => {},
    refreshActiveTrackSessions: async () => {},
    updateProgressAndEstimates: () => {},
    syncBackgroundGpsTargets: () => {},
    showToast: () => {},
    yieldToUiFrame: async () => {},
    getTravelMode: () => (typeof google !== 'undefined' && google.maps ? google.maps.TravelMode.DRIVING : 'DRIVING')
};

export function configureRouting(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export { MAX_WAYPOINTS, directionsErrorMessage, formatKm, formatDuration };

let directionsService = null;
let routeRenderers = [];
let optimizing = false;
let routeRefreshTimer = null;

export function setDirectionsService(svc) {
    directionsService = svc;
}

export function getDirectionsService() {
    return directionsService;
}

export function isOptimizingRoute() {
    return optimizing;
}

export function pendingStops() {
    return pendingStopsOf(deps.getDeliveries());
}

export function routeSignature(stops) {
    return routeSignatureOf(stops, deps.getStartPoint());
}

function orderByProximity(stops) {
    return orderByProximityOf(stops, deps.getStartPoint());
}

function applyStopOrder(ordered) {
    applyStopOrderOn(deps.getDeliveries(), ordered);
}

function routeDirections(request) {
    return new Promise((resolve, reject) => {
        if (!directionsService) return reject(new Error('NO_DIRECTIONS'));
        directionsService.route(request, (result, status) => {
            if (status === 'OK' && result) resolve(result);
            else reject(new Error(status));
        });
    });
}

async function orderByDirections(stops) {
    const plan = planDirectionsLegs(stops, deps.getStartPoint());
    const result = await routeDirections({
        origin: plan.origin,
        destination: { lat: plan.end.lat, lng: plan.end.lng },
        waypoints: plan.waypoints.map((s) => ({ location: { lat: s.lat, lng: s.lng }, stopover: true })),
        optimizeWaypoints: true,
        travelMode: deps.getTravelMode()
    });
    const order = result.routes[0].waypoint_order || plan.waypoints.map((_, i) => i);
    return { ordered: orderedFromDirectionsPlan(plan, order), result };
}

export function clearRouteOverlay() {
    routeRenderers.forEach((r) => r.setMap(null));
    routeRenderers = [];
    deps.setRouteMetrics(null);
    deps.setRouteActive(false);
    clearStopRouteFields(deps.getDeliveries());
    updateOptimizeFabVisibility();
    deps.updateProgressAndEstimates();
}

export function updateOptimizeFabVisibility() {
    const pending = pendingStops();
    const signature = routeSignature(pending);
    const show = shouldShowOptimizeFab(
        pending.length,
        deps.getRouteActive(),
        deps.getRouteMetrics(),
        signature
    );
    const label = 'Otimizar rota';
    const shortLabel = 'Otimizar';
    const idleIcon = 'fas fa-route';

    const fab = document.getElementById('optimizeRouteBtn');
    if (fab) {
        fab.classList.toggle('rf-fab-hidden', !show);
        fab.classList.remove('is-optimized');
        fab.removeAttribute('hidden');
        fab.style.display = '';
        fab.style.opacity = '';
        fab.style.visibility = '';
        fab.style.pointerEvents = '';
        fab.setAttribute('aria-hidden', show ? 'false' : 'true');
        fab.title = label;
        fab.setAttribute('aria-label', label);
        if (!optimizing) {
            fab.disabled = false;
            const icon = fab.querySelector('i');
            if (icon) icon.className = idleIcon;
        }
    }

    const tool = document.getElementById('optimizeRouteToolBtn');
    if (tool) {
        tool.classList.toggle('rf-tool-hidden', !show);
        tool.classList.remove('is-optimized');
        tool.setAttribute('aria-hidden', show ? 'false' : 'true');
        tool.title = label;
        tool.setAttribute('aria-label', label);
        const text = tool.querySelector('.rt-label');
        if (text) text.textContent = shortLabel;
        if (!optimizing) {
            tool.disabled = false;
            const icon = tool.querySelector('.rt-icon i');
            if (icon) icon.className = idleIcon;
        }
    }
}

function setOptimizeControlsBusy(busy) {
    const fab = document.getElementById('optimizeRouteBtn');
    const tool = document.getElementById('optimizeRouteToolBtn');
    [fab, tool].forEach((btn) => {
        if (!btn) return;
        btn.disabled = !!busy;
        if (busy) {
            btn.classList.remove('rf-fab-hidden', 'rf-tool-hidden', 'is-optimized');
            btn.removeAttribute('hidden');
            btn.setAttribute('aria-hidden', 'false');
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-spinner fa-spin';
        }
    });
}

export async function renderRoute(ordered, precomputed) {
    ordered.forEach((d) => {
        delete d.legMeters;
        delete d.legSeconds;
        delete d.etaMeters;
        delete d.etaSeconds;
    });

    const startPoint = deps.getStartPoint();
    const points = buildRoutePoints(ordered, startPoint);

    let results = precomputed ? [precomputed] : [];
    if (!precomputed) {
        for (const chunk of chunkPoints(points)) {
            results.push(await routeDirections({
                origin: chunk[0],
                destination: chunk[chunk.length - 1],
                waypoints: chunk.slice(1, -1).map((p) => ({ location: p, stopover: true })),
                travelMode: deps.getTravelMode()
            }));
        }
    }

    // Por enquanto não desenha a linha azul no mapa — só calcula km/tempo.
    routeRenderers.forEach((r) => r.setMap(null));
    routeRenderers = [];

    const legs = results.reduce((acc, r) => acc.concat(r.routes[0].legs), []);
    const { meters, seconds } = applyLegsToOrdered(ordered, legs, !!startPoint);
    assignRouteOrderIndexes(deps.getDeliveries(), ordered);
    assignCumulativeEtas(ordered);
    deps.setRouteMetrics(buildRouteMetrics(routeSignature(pendingStops()), meters, seconds));
    deps.setRouteActive(true);
    updateOptimizeFabVisibility();
}

function fitMapToRoute() {
    deps.centerMapOnMarkers();
}

export async function optimizeRoute() {
    if (optimizing) return;
    if (!directionsService) return deps.showToast('Aguarde o mapa carregar completamente', true);
    const stops = pendingStops();
    if (stops.length < 2) return deps.showToast('São necessárias pelo menos 2 entregas pendentes', true);

    optimizing = true;
    setOptimizeControlsBusy(true);
    await deps.yieldToUiFrame();
    await new Promise((r) => setTimeout(r, 0));

    try {
        await deps.requestStartPoint();
        deps.showStartMarker();
        await deps.yieldToUiFrame();

        let ordered;
        let precomputed = null;
        if (stops.length <= MAX_WAYPOINTS + 1) {
            const planned = await orderByDirections(stops);
            ordered = planned.ordered;
            precomputed = planned.result;
        } else {
            ordered = orderByProximity(stops);
            deps.showToast(`${stops.length} paradas: ordem por proximidade; distância calculada pelas ruas`);
        }

        applyStopOrder(ordered);
        await deps.yieldToUiFrame();
        await renderRoute(ordered, precomputed);
        deps.saveStorage();
        deps.renderDeliveriesList();
        deps.rebuildMarkers(false);
        fitMapToRoute();
        deps.switchSidebarTab('rota');
        const kickTracks = () => deps.refreshActiveTrackSessions({ force: true }).catch(() => {});
        if (typeof requestIdleCallback === 'function') requestIdleCallback(kickTracks, { timeout: 2500 });
        else setTimeout(kickTracks, 400);
        const metrics = deps.getRouteMetrics();
        const origem = deps.getStartPoint() ? 'sua localização' : 'a 1ª entrega';
        deps.showToast(
            `Rota otimizada (partida: ${origem}): ${formatKm(metrics.meters)} · ${formatDuration(metrics.seconds)}`
        );
    } catch (e) {
        clearRouteOverlay();
        deps.renderDeliveriesList();
        deps.showToast(directionsErrorMessage(e), true);
    } finally {
        optimizing = false;
        setOptimizeControlsBusy(false);
        updateOptimizeFabVisibility();
    }
}

export async function refreshRouteKeepOrder() {
    if (optimizing || !directionsService || !deps.getRouteActive()) return;
    const stops = pendingStops();
    if (stops.length < 2) {
        clearRouteOverlay();
        deps.updateProgressAndEstimates();
        deps.renderDeliveriesList();
        deps.refreshActiveTrackSessions({ force: true }).catch(() => {});
        return;
    }
    try {
        await deps.requestStartPoint();
        deps.showStartMarker();
        await renderRoute(stops, null);
        deps.renderDeliveriesList();
        deps.updateProgressAndEstimates();
        deps.refreshActiveTrackSessions({ force: true }).catch(() => {});
    } catch (e) {
        clearRouteOverlay();
        deps.updateProgressAndEstimates();
        deps.renderDeliveriesList();
        deps.refreshActiveTrackSessions({ force: true }).catch(() => {});
    }
}

export function scheduleRouteRefresh() {
    if (!deps.getRouteActive()) return;
    clearTimeout(routeRefreshTimer);
    routeRefreshTimer = setTimeout(() => { refreshRouteKeepOrder(); }, 400);
}

export function notifyRouteCompositionChanged({ keepRoute = false } = {}) {
    deps.syncBackgroundGpsTargets();
    if (keepRoute && deps.getRouteActive()) scheduleRouteRefresh();
    else {
        clearRouteOverlay();
        deps.updateProgressAndEstimates();
        deps.refreshActiveTrackSessions({ force: true }).catch(() => {});
    }
}
