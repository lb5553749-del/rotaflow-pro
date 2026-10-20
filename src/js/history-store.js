/**
 * Estado do histórico de dias arquivados (localStorage) — parte que roda no boot.
 *
 * Existe separado de `history.js` porque `persist.js` chama `loadHistory()` durante o
 * boot e grava o estado logo em seguida: se o estado não estiver hidratado nesse
 * momento, o `persistStorageNow()` grava histórico VAZIO e o usuário perde os dias
 * arquivados. Por isso estado + persistência ficam aqui (baratos, sem DOM) e só a
 * interface (render, delegação, modais) fica no módulo carregado sob demanda.
 */
import {
    HISTORY_MAX_DAYS,
    localDateKey,
    formatHistoryDate,
    routeDayStats
} from '../../lib/history-helpers.js';

let routeHistory = [];

let deps = {
    getRouteHistory: () => routeHistory,
    setRouteHistory: (h) => { routeHistory = Array.isArray(h) ? h : []; },
    getAuthReady: () => false,
    getCurrentUser: () => null,
    storageKey: (base) => `rotaflow_${base}_guest`
};

export function configureHistoryStore(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export { HISTORY_MAX_DAYS, localDateKey, formatHistoryDate, routeDayStats };

export function getRouteHistory() {
    return deps.getRouteHistory();
}

export function setRouteHistory(next) {
    deps.setRouteHistory(next);
}

/** Persiste os N dias mais recentes. No-op enquanto o usuário não está autenticado. */
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

/** Hidrata o estado a partir do localStorage. Chamado no boot (persist.js). */
export function loadHistory() {
    let loaded = [];
    try {
        const raw = localStorage.getItem(deps.storageKey('history'));
        if (raw) loaded = JSON.parse(raw) || [];
        if (!Array.isArray(loaded)) loaded = [];
    } catch (_) {
        loaded = [];
    }
    deps.setRouteHistory(loaded);
    return loaded;
}

export function findHistoryEntry(historyId) {
    return deps.getRouteHistory().find((h) => h.id === historyId) || null;
}

/** Insere no topo, persiste e devolve a lista nova (usado pelo arquivamento do dia). */
export function addHistoryEntry(entry, prependFn) {
    const next = prependFn(deps.getRouteHistory(), entry);
    deps.setRouteHistory(next);
    persistHistory();
    return deps.getRouteHistory();
}

/** Remove um dia, persiste e devolve a lista nova. */
export function removeHistoryEntry(historyId) {
    deps.setRouteHistory(deps.getRouteHistory().filter((h) => h.id !== historyId));
    persistHistory();
    return deps.getRouteHistory();
}
