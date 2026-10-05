/**
 * Painel inferior da entrega — open/close/minimize pouco acoplados.
 * Renderização pesada (ações, fotos, swipe binding) permanece em main.js.
 */
import {
    isActiveStop,
    isPreferredNextStop,
    findNextInSequence,
    deliveryProgressInfo as deliveryProgressInfoOf,
    deliveryPhotoCount,
    shouldKeepPanelMinimized,
    adjacentIndexResult,
    panelOpenClassPlan,
    panelCloseClassPlan
} from '../../lib/panel-helpers.js';

let deps = {
    getDeliveries: () => [],
    getCurrentSelected: () => null,
    setCurrentSelected: () => {},
    ensureItemPhotos: async () => {},
    refreshPanelPhotos: () => {},
    resetHighlightedMarker: () => {},
    hideMapSelectedChip: () => {}
};

let panelSwipeConsumedUntil = 0;

export function configureDeliveryPanel(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export {
    isActiveStop,
    isPreferredNextStop,
    findNextInSequence,
    deliveryPhotoCount,
    shouldKeepPanelMinimized,
    adjacentIndexResult
};

export function deliveryProgressInfo(delivery) {
    return deliveryProgressInfoOf(delivery, deps.getDeliveries(), isActiveStop);
}

export function wasPanelSwipeJustConsumed(now = Date.now()) {
    return now < panelSwipeConsumedUntil;
}

export function markPanelSwipeConsumed(ms = 400, now = Date.now()) {
    panelSwipeConsumedUntil = now + ms;
}

export function withMiniActionGuard(handler) {
    return (e) => {
        if (wasPanelSwipeJustConsumed()) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        handler(e);
    };
}

export function minimizeDeliveryPanel() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel || !panel.classList.contains('open')) return;
    panel.classList.add('minimized');
}

export function expandDeliveryPanel() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel || !panel.classList.contains('open')) return;
    panel.classList.remove('minimized');
    const d = deps.getCurrentSelected();
    if (!d) return;
    // Se abriu em modo mini sem hidratar fotos, completa ao expandir.
    deps.ensureItemPhotos(d).then(() => {
        if (deps.getCurrentSelected() && deps.getCurrentSelected().id === d.id) {
            deps.refreshPanelPhotos(d);
        }
    }).catch(() => {});
}

/**
 * Aplica classes de fechamento e limpa seleção/destaque.
 * Não mexe em notificações nativas (fica no caller).
 */
export function closeDeliveryPanelShell() {
    const panel = document.getElementById('deliveryPanel');
    if (panel) {
        const plan = panelCloseClassPlan();
        panel.classList.toggle('open', plan.open);
        panel.classList.toggle('minimized', plan.minimized);
        panel.classList.toggle('red-bg', plan.redBg);
    }
    deps.setCurrentSelected(null);
    deps.resetHighlightedMarker();
    deps.hideMapSelectedChip();
}

/**
 * Aplica classes de abertura (conteúdo HTML continua no caller).
 * @param {object} delivery
 * @param {boolean} [stayMini]
 */
export function applyDeliveryPanelOpenClasses(delivery, stayMini = false) {
    const panel = document.getElementById('deliveryPanel');
    if (!panel) return null;
    const plan = panelOpenClassPlan(delivery, stayMini);
    panel.classList.toggle('open', plan.open);
    panel.classList.toggle('minimized', plan.minimized);
    panel.classList.toggle('red-bg', plan.redBg);
    return panel;
}

export { panelOpenClassPlan, panelCloseClassPlan };
