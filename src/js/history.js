/**
 * Histórico de dias arquivados (localStorage).
 * main.js injeta estado, persistência e renderização via configureHistory().
 */
import { escapeHtml } from '../../lib/html.js';
import {
    HISTORY_MAX_DAYS,
    localDateKey,
    formatHistoryDate,
    routeDayStats,
    snapshotDeliveriesForHistory,
    prependHistoryDay,
    attachHistoryEconomics
} from '../../lib/history-helpers.js';
import {
    calcRouteEconomics,
    formatRouteEconomicsMessage,
    formatBrl
} from '../../lib/cost-helpers.js';

let routeHistory = [];

let deps = {
    getRouteHistory: () => routeHistory,
    setRouteHistory: (h) => { routeHistory = Array.isArray(h) ? h : []; },
    getDeliveries: () => [],
    setDeliveries: () => {},
    getNextSequenceNumber: () => 1,
    setNextSequenceNumber: () => {},
    setRouteActive: () => {},
    setRouteMetrics: () => {},
    getRouteMetrics: () => null,
    getUserProfile: () => ({}),
    getAuthReady: () => false,
    getCurrentUser: () => null,
    storageKey: (base) => `rotaflow_${base}_guest`,
    showToast: () => {},
    showConfirmModal: async () => false,
    persistStorageNow: () => {},
    saveStorage: () => {},
    getSequentialId: (n) => String(n),
    newId: () => Date.now(),
    seedIdCounter: () => {},
    closeTrackingSession: () => {},
    trackStatusFor: () => 'encerrado',
    clearRouteOverlay: () => {},
    renderDeliveriesList: () => {},
    renderRouteSwitcher: () => {},
    rebuildMarkers: () => {},
    updateLastIdDisplay: () => {},
    closeDeliveryPanel: () => {},
    clearActiveStopNotification: () => {},
    renderAgendaList: () => {},
    switchSidebarTab: () => {}
};

export function configureHistory(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export { HISTORY_MAX_DAYS, localDateKey, formatHistoryDate, routeDayStats };

export function getRouteHistory() {
    return deps.getRouteHistory();
}

export function persistHistory() {
    if (!deps.getAuthReady() || !deps.getCurrentUser()) return;
    try {
        localStorage.setItem(
            deps.storageKey('history'),
            JSON.stringify(deps.getRouteHistory().slice(0, HISTORY_MAX_DAYS))
        );
    } catch (e) {
        console.warn('history save', e);
    }
}

export function loadHistory() {
    let routeHistory = [];
    try {
        const raw = localStorage.getItem(deps.storageKey('history'));
        if (raw) routeHistory = JSON.parse(raw) || [];
        if (!Array.isArray(routeHistory)) routeHistory = [];
    } catch (_) {
        routeHistory = [];
    }
    deps.setRouteHistory(routeHistory);
    return routeHistory;
}

export function archiveCurrentRouteDay({ silent = false, clearAfter = false } = {}) {
    const deliveries = deps.getDeliveries();
    if (!deliveries.length) {
        if (!silent) deps.showToast('Não há entregas para arquivar', true);
        return false;
    }
    const dateKey = localDateKey();
    const economics = calcRouteEconomics({
        deliveries,
        profile: deps.getUserProfile(),
        routeMetrics: deps.getRouteMetrics(),
        onlyDelivered: true
    });
    const economicsMessage = formatRouteEconomicsMessage(economics);
    const entry = {
        id: `h_${dateKey}_${Date.now()}`,
        date: dateKey,
        savedAt: Date.now(),
        deliveries: snapshotDeliveriesForHistory(deliveries),
        nextSequenceNumber: deps.getNextSequenceNumber(),
        stats: routeDayStats(deliveries)
    };
    attachHistoryEconomics(entry, { ...economics, message: economicsMessage });
    deps.setRouteHistory(prependHistoryDay(deps.getRouteHistory(), entry));
    persistHistory();
    renderHistoryList();
    if (!silent) {
        const hasFuelPrefs = !!(deps.getUserProfile()?.consumoKmL && deps.getUserProfile()?.precoCombustivel != null);
        const hasRevenue = economics.revenue > 0 || economics.fuelCost > 0 || economics.km > 0;
        if (hasFuelPrefs || hasRevenue) {
            deps.showToast(economicsMessage);
        } else {
            deps.showToast(`Dia ${formatHistoryDate(dateKey)} salvo no histórico`);
        }
    }
    if (clearAfter) {
        deliveries.forEach((d) => deps.closeTrackingSession(
            d,
            d.status === 'entregue' || d.status === 'falhou' ? deps.trackStatusFor(d) : 'encerrado'
        ));
        deps.setDeliveries([]);
        deps.setNextSequenceNumber(1);
        deps.setRouteActive(false);
        deps.setRouteMetrics(null);
        deps.clearRouteOverlay();
        deps.saveStorage();
        deps.renderDeliveriesList();
        deps.renderRouteSwitcher();
        deps.rebuildMarkers(false);
        deps.updateLastIdDisplay(null);
        deps.closeDeliveryPanel();
        deps.clearActiveStopNotification();
        deps.renderAgendaList();
    }
    return true;
}

export async function duplicateHistoryDay(historyId) {
    const entry = deps.getRouteHistory().find((h) => h.id === historyId);
    if (!entry || !entry.deliveries?.length) return;
    const ok = await deps.showConfirmModal({
        title: 'Duplicar dia',
        message: `Adicionar ${entry.deliveries.length} parada(s) de ${formatHistoryDate(entry.date)} na rota de hoje como pendentes?`,
        confirmText: 'Duplicar'
    });
    if (!ok) return;

    let added = 0;
    const deliveries = deps.getDeliveries();
    let nextSequenceNumber = deps.getNextSequenceNumber();
    for (const src of entry.deliveries) {
        const seqId = deps.getSequentialId(nextSequenceNumber);
        nextSequenceNumber++;
        deliveries.push({
            id: deps.newId(),
            sequentialId: seqId,
            nome: src.nome || '',
            endereco: src.endereco || '',
            lat: src.lat,
            lng: src.lng,
            telefones: Array.isArray(src.telefones) ? src.telefones.map((p) => ({ ...p })) : [],
            pacotes: src.pacotes || 1,
            notes: src.notes || '',
            status: 'pendente',
            favorito: !!src.favorito,
            savedToAgenda: !!src.savedToAgenda,
            photos: [],
            photoIds: [],
            voltarDepois: false,
            valor: src.valor,
            janelaInicio: src.janelaInicio,
            janelaFim: src.janelaFim
        });
        added++;
    }
    deps.setNextSequenceNumber(nextSequenceNumber);
    deps.seedIdCounter();
    deps.clearRouteOverlay();
    deps.persistStorageNow();
    deps.renderDeliveriesList();
    deps.rebuildMarkers(true);
    deps.switchSidebarTab('rota');
    deps.showToast(`${added} parada(s) adicionada(s) à rota de hoje`);
}

export async function deleteHistoryDay(historyId) {
    const entry = deps.getRouteHistory().find((h) => h.id === historyId);
    if (!entry) return;
    const ok = await deps.showConfirmModal({
        title: 'Excluir dia',
        message: `Remover ${formatHistoryDate(entry.date)} do histórico?`,
        confirmText: 'Excluir',
        danger: true
    });
    if (!ok) return;
    deps.setRouteHistory(deps.getRouteHistory().filter((h) => h.id !== historyId));
    persistHistory();
    renderHistoryList();
    deps.showToast('Dia removido do histórico');
}

export function renderHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;
    const routeHistory = deps.getRouteHistory();
    if (!routeHistory.length) {
        container.innerHTML = `<div class="empty-state">
            <span class="empty-state-mark" aria-hidden="true"></span>
            <span class="empty-state-title">Nenhum dia arquivado</span>
            <span class="empty-state-msg">Quando o dia terminar, arquive a rota para consultar depois.</span>
            <button type="button" class="empty-state-cta" data-empty-cta="rota"><i class="fas fa-route"></i> Ir para a rota</button>
        </div>`;
        return;
    }
    container.innerHTML = routeHistory.map((h) => {
        const s = h.stats || routeDayStats(h.deliveries || []);
        const eco = h.economics;
        const ecoLine = eco && (eco.km > 0 || eco.revenue > 0 || eco.fuelCost > 0)
            ? `<div class="history-economics">${escapeHtml(eco.message || formatRouteEconomicsMessage(eco))}</div>`
            : '';
        return `<div class="history-item" data-history-id="${escapeHtml(h.id)}">
            <div class="history-item-header">
                <div>
                    <div class="history-item-title">${escapeHtml(formatHistoryDate(h.date))}</div>
                    <div class="history-item-meta">${s.total} parada(s)${eco && eco.netProfit != null ? ` · ${escapeHtml(formatBrl(eco.netProfit))}` : ''}</div>
                </div>
            </div>
            <div class="history-stats">
                <span class="history-stat ok">${s.entregue} entregues</span>
                <span class="history-stat warn">${s.falhou} falhas</span>
                <span class="history-stat">${s.pendente} pendentes</span>
            </div>
            ${ecoLine}
            <div class="history-actions">
                <button type="button" class="action-btn" data-history-action="duplicate"><i class="fas fa-copy"></i> Duplicar p/ hoje</button>
                <button type="button" class="action-btn danger-ghost" data-history-action="delete"><i class="fas fa-trash"></i> Excluir</button>
            </div>
        </div>`;
    }).join('');
}

export function setupHistoryListDelegation() {
    const container = document.getElementById('historyList');
    if (!container || container.dataset.ready) return;
    container.dataset.ready = '1';
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-history-action]');
        const item = e.target.closest('.history-item');
        if (!btn || !item) return;
        const id = item.dataset.historyId;
        if (btn.dataset.historyAction === 'duplicate') duplicateHistoryDay(id);
        if (btn.dataset.historyAction === 'delete') deleteHistoryDay(id);
    });
}
