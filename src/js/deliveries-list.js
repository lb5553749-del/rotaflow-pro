/**
 * Lista de entregas da rota — render virtualizado + delegação de ações.
 * Helpers puros em lib/list-helpers.js; main injeta estado via configureDeliveriesList().
 */
import {
    DELIVERY_LIST_FULL_RENDER_MAX,
    DELIVERY_LIST_ROW_EST,
    DELIVERY_LIST_BUFFER,
    buildDeliveryListItemHtml,
    emptyListStateHtml,
    virtualScrollRange,
    joinVirtualListHtml
} from '../../lib/list-helpers.js';
import { advancedFilters } from './advanced-filters.js';
import { updateFiltersUI, updateDistrictsOptions } from './filters-ui.js';

let deps = {
    getDeliveries: () => [],
    setDeliveries: () => {},
    getRouteFilter: () => '',
    updateDeliveryStats: () => {},
    closeAllOverflowMenus: () => {},
    openOverflowWrap: () => {},
    getMarker: () => null,
    highlightMarker: () => {},
    openDeliveryPanel: () => {},
    saveStorage: () => {},
    persistStorageNow: () => false,
    syncFavoritoToAgenda: () => {},
    showToast: () => {},
    sendWhatsApp: () => {},
    shareTrackingLink: () => {},
    showEditDeliveryModal: () => {},
    editDeliveryInRoute: () => {},
    clearRouteOverlay: () => {},
    updateProgressAndEstimates: () => {},
    showConfirmModal: async () => false,
    closeTrackingSession: () => {},
    removeMarkerById: () => {},
    saveToAgenda: async () => false,
    upsertMarker: () => {},
    syncTrackingStatus: () => {},
    notifyRouteCompositionChanged: () => {},
    sendDeliveredPush: () => {},
    playDeliveryFeedback: () => {},
    noteDeliveryCompletedForBackup: () => {},
    countNormalActiveStops: () => 0,
    maybeNotifyVoltarDepois: () => {},
    getRiskLevelForDelivery: () => null,
    setRiskLevelFromList: () => {},
    rebuildMarkers: () => {}
};

let renderDeliveriesQueued = false;
const deliveryListVirtual = { filtered: [], start: -1, end: -1, scrollBound: false };
let deliveryListDelegationReady = false;

export function configureDeliveriesList(opts) {
    deps = { ...deps, ...(opts || {}) };
}

function getDeliveryListScrollParent(container) {
    return container?.closest('.sidebar-panel') || container;
}

export function renderDeliveriesList() {
    if (renderDeliveriesQueued) return;
    renderDeliveriesQueued = true;
    requestAnimationFrame(() => {
        renderDeliveriesQueued = false;
        renderDeliveriesListNow();
    });
}

function ensureDeliveryListVirtualScroll(container) {
    if (deliveryListVirtual.scrollBound || !container) return;
    deliveryListVirtual.scrollBound = true;
    const scrollEl = getDeliveryListScrollParent(container);
    let ticking = false;
    scrollEl.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            if (deliveryListVirtual.filtered.length <= DELIVERY_LIST_FULL_RENDER_MAX) return;
            deps.closeAllOverflowMenus();
            paintDeliveryListWindow(container, false);
        });
    }, { passive: true });
}

function paintDeliveryListWindow(container, force) {
    const filtered = deliveryListVirtual.filtered;
    const total = filtered.length;
    if (!total) return;

    const scrollEl = getDeliveryListScrollParent(container);
    const range = virtualScrollRange({
        total,
        fullRenderMax: DELIVERY_LIST_FULL_RENDER_MAX,
        rowEst: DELIVERY_LIST_ROW_EST,
        buffer: DELIVERY_LIST_BUFFER,
        scrollTop: scrollEl.scrollTop || 0,
        viewH: scrollEl.clientHeight || 600
    });

    if (!force
        && !range.full
        && range.start === deliveryListVirtual.start
        && range.end === deliveryListVirtual.end) {
        return;
    }

    deliveryListVirtual.start = range.start;
    deliveryListVirtual.end = range.end;
    let rowHtmls;
    if (range.full) {
        rowHtmls = filtered.map((d) => buildDeliveryListItemHtml(d, {
            riskLevel: deps.getRiskLevelForDelivery(d)
        }));
    } else {
        rowHtmls = new Array(total);
        for (let i = range.start; i < range.end; i++) {
            rowHtmls[i] = buildDeliveryListItemHtml(filtered[i], {
                riskLevel: deps.getRiskLevelForDelivery(filtered[i])
            });
        }
    }
    container.innerHTML = joinVirtualListHtml(rowHtmls, range, DELIVERY_LIST_ROW_EST);
}

function renderDeliveriesListNow() {
    const container = document.getElementById('deliveriesList');
    if (!container) return;
    ensureDeliveryListDelegation(container);
    ensureDeliveryListVirtualScroll(container);
    deps.updateDeliveryStats();

    // Aplica filtros avançados (incluindo busca de texto)
    const deliveries = deps.getDeliveries();
    const filtered = advancedFilters.applyFilters(deliveries);

    // Atualiza UI dos filtros
    const panelRota = document.getElementById('panelRota');
    if (panelRota) {
        updateFiltersUI(panelRota);
        updateDistrictsOptions(panelRota, deliveries);
    }

    if (filtered.length === 0) {
        deliveryListVirtual.filtered = [];
        deliveryListVirtual.start = -1;
        deliveryListVirtual.end = -1;
        container.innerHTML = emptyListStateHtml('deliveries', advancedFilters.hasActiveFilters());
        return;
    }

    deliveryListVirtual.filtered = filtered;
    deliveryListVirtual.start = -1;
    deliveryListVirtual.end = -1;
    paintDeliveryListWindow(container, true);
}

function ensureDeliveryListDelegation(container) {
    if (deliveryListDelegationReady || !container) return;
    deliveryListDelegationReady = true;

    container.addEventListener('click', async (e) => {
        const actionEl = e.target.closest('[data-action]');
        const item = e.target.closest('.delivery-item');
        if (!item) return;
        const id = parseInt(item.dataset.id, 10);
        const deliveries = deps.getDeliveries();
        const delivery = deliveries.find((d) => d.id === id);
        if (!delivery) return;

        const action = actionEl ? actionEl.dataset.action : 'open';
        if (action === 'open' || !actionEl) {
            if (e.target.closest('button, a, select, input')) return;
            deps.closeAllOverflowMenus();
            const marker = deps.getMarker(delivery.sequentialId);
            if (marker) deps.highlightMarker(marker, delivery);
            deps.openDeliveryPanel(delivery);
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (action === 'menu') {
            const wrap = actionEl.closest('.overflow-wrap');
            const wasOpen = wrap && wrap.classList.contains('open');
            deps.closeAllOverflowMenus();
            if (wrap && !wasOpen) deps.openOverflowWrap(wrap);
            return;
        }

        deps.closeAllOverflowMenus();

        if (action === 'fav') {
            delivery.favorito = !delivery.favorito;
            deps.saveStorage();
            deps.syncFavoritoToAgenda(delivery);
            renderDeliveriesList();
            deps.showToast(delivery.favorito ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
            return;
        }
        if (action === 'whatsapp') {
            deps.sendWhatsApp(delivery);
            return;
        }
        if (action === 'track') {
            deps.shareTrackingLink(delivery);
            return;
        }
        if (action === 'edit') {
            deps.showEditDeliveryModal(delivery, (updated) => deps.editDeliveryInRoute(delivery, updated));
            return;
        }
        if (action === 'up') {
            const list = deps.getDeliveries();
            const idx = list.findIndex((d) => d.id === id);
            if (idx > 0) {
                [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
                deps.setDeliveries(list);
                deps.saveStorage();
                deps.clearRouteOverlay();
                renderDeliveriesList();
                deps.updateProgressAndEstimates();
            }
            return;
        }
        if (action === 'down') {
            const list = deps.getDeliveries();
            const idx = list.findIndex((d) => d.id === id);
            if (idx >= 0 && idx < list.length - 1) {
                [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
                deps.setDeliveries(list);
                deps.saveStorage();
                deps.clearRouteOverlay();
                renderDeliveriesList();
                deps.updateProgressAndEstimates();
            }
            return;
        }
        if (action === 'remove') {
            const ok = await deps.showConfirmModal({
                title: 'Remover entrega',
                message: `Deseja remover a entrega ${delivery.sequentialId} (${delivery.nome}) da rota?`,
                confirmText: 'Remover',
                danger: true
            });
            if (!ok) return;
            deps.closeTrackingSession(delivery, 'encerrado');
            deps.setDeliveries(deps.getDeliveries().filter((d) => d.id !== id));
            deps.persistStorageNow();
            deps.clearRouteOverlay();
            deps.removeMarkerById(delivery.sequentialId);
            renderDeliveriesList();
            deps.updateProgressAndEstimates();
            deps.showToast('Entrega removida da rota');
            return;
        }
        if (action === 'risk-amarelo') {
            deps.setRiskLevelFromList(delivery, 'amarelo');
            deps.rebuildMarkers(false);
            renderDeliveriesList();
            return;
        }
        if (action === 'risk-vermelho') {
            deps.setRiskLevelFromList(delivery, 'vermelho');
            deps.rebuildMarkers(false);
            renderDeliveriesList();
            return;
        }
        if (action === 'risk-clear') {
            deps.setRiskLevelFromList(delivery, null);
            deps.rebuildMarkers(false);
            renderDeliveriesList();
            return;
        }
        if (action === 'agenda') {
            await deps.saveToAgenda(delivery, true);
        }
    });

    container.addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-action="status"]');
        if (!sel) return;
        const id = parseInt(sel.dataset.id, 10);
        const d = deps.getDeliveries().find((x) => x.id === id);
        if (!d) return;
        const oldStatus = d.status;
        const normalsBefore = deps.countNormalActiveStops();
        d.status = sel.value;
        if (d.status === 'entregue' || d.status === 'falhou') {
            d.voltarDepois = false;
            if (d.status === 'entregue') delete d.failReason;
        }
        if (d.status !== 'entregue') delete d.deliveredNotified;
        if (d.status !== 'falhou' || d.failReason !== 'ausente') delete d.absentNotified;
        deps.saveStorage();
        if (oldStatus !== d.status) {
            deps.upsertMarker(d);
            deps.syncTrackingStatus(d);
        }
        deps.updateDeliveryStats();
        renderDeliveriesList();
        if (oldStatus !== d.status && (d.status === 'entregue' || oldStatus === 'entregue' || d.status === 'falhou' || oldStatus === 'falhou')) {
            deps.notifyRouteCompositionChanged({ keepRoute: true });
        }
        if (oldStatus !== d.status && (d.status === 'entregue' || d.status === 'falhou')) {
            if (d.status === 'entregue') {
                deps.sendDeliveredPush(d);
                deps.playDeliveryFeedback();
            }
            deps.noteDeliveryCompletedForBackup();
            deps.maybeNotifyVoltarDepois(normalsBefore);
        }
    });
}
