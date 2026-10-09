/**
 * Wrappers para módulos carregados sob demanda.
 * Esses módulos são pesados e raramente usados no boot inicial.
 */

import { lazyLoad } from './lazy-loader.js';

// ============================================================
// BACKUP UI (22KB) - Usado quando usuário clica em backup/restore
// ============================================================
let backupUiModule = null;

export async function loadBackupUi() {
    if (!backupUiModule) {
        backupUiModule = await lazyLoad('backup-ui', () => import('./backup-ui.js'));
    }
    return backupUiModule;
}

export async function backupData(...args) {
    const mod = await loadBackupUi();
    return mod.backupData(...args);
}

export async function restoreData(...args) {
    const mod = await loadBackupUi();
    return mod.restoreData(...args);
}

// ============================================================
// HISTORY (10KB) - Usado quando usuário abre aba de histórico
// ============================================================
let historyModule = null;

export async function loadHistory() {
    if (!historyModule) {
        historyModule = await lazyLoad('history', () => import('./history.js'));
    }
    return historyModule;
}

export async function renderHistoryList(...args) {
    const mod = await loadHistory();
    return mod.renderHistoryList(...args);
}

export async function archiveCurrentRouteDay(...args) {
    const mod = await loadHistory();
    return mod.archiveCurrentRouteDay(...args);
}

// ============================================================
// EDIT MODALS (30KB) - Usado quando usuário edita uma entrega
// ============================================================
let editModalsModule = null;

export async function loadEditModals() {
    if (!editModalsModule) {
        editModalsModule = await lazyLoad('edit-modals', () => import('./edit-modals.js'));
    }
    return editModalsModule;
}

export async function showEditDeliveryModal(...args) {
    const mod = await loadEditModals();
    return mod.showEditDeliveryModal(...args);
}

export async function showEditAgendaModal(...args) {
    const mod = await loadEditModals();
    return mod.showEditAgendaModal(...args);
}

// ============================================================
// TRACKING (grande, usado menos frequentemente)
// ============================================================
let trackingModule = null;

export async function loadTracking() {
    if (!trackingModule) {
        trackingModule = await lazyLoad('tracking', () => import('./tracking.js'));
    }
    return trackingModule;
}

export async function publishTrackingSession(...args) {
    const mod = await loadTracking();
    return mod.publishTrackingSession(...args);
}

export async function closeTrackingSession(...args) {
    const mod = await loadTracking();
    return mod.closeTrackingSession(...args);
}

export async function shareTrackingLink(...args) {
    const mod = await loadTracking();
    return mod.shareTrackingLink(...args);
}

// ============================================================
// AGENDA ROUTE (usado apenas quando copia da agenda para rota)
// ============================================================
let agendaRouteModule = null;

export async function loadAgendaRoute() {
    if (!agendaRouteModule) {
        agendaRouteModule = await lazyLoad('agenda-route', () => import('./agenda-route.js'));
    }
    return agendaRouteModule;
}

export async function copyFromOtherRoute(...args) {
    const mod = await loadAgendaRoute();
    return mod.copyFromOtherRoute(...args);
}
