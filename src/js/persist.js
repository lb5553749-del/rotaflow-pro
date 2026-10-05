/**
 * Persistência localStorage — save/load/hydrate orquestração.
 * Reutiliza lib/persist-helpers.js; fotos pesadas ficam só no IndexedDB.
 * main.js injeta estado, rotas, agenda e UI via configurePersist().
 */
import {
    buildPersistPayload,
    migrateLegacyLocalStorageKeys,
    normalizeAgendaItemDefaults,
    parseAgendaStorage,
    migrateWhatsAppTemplate,
    ensureProfileEmpresa
} from '../../lib/persist-helpers.js';

let deps = {
    getAuthReady: () => false,
    getCurrentUser: () => null,
    currentUid: () => 'guest',
    storageKey: (base) => `rotaflow_${base}_guest`,
    getRoutes: () => [],
    getActiveRouteId: () => null,
    getNextSequenceNumber: () => 1,
    getAgenda: () => [],
    setAgenda: () => {},
    getNextAgendaId: () => 1,
    setNextAgendaId: () => {},
    getUserProfile: () => ({}),
    setUserProfile: () => {},
    resetMemoryState: () => {},
    syncActiveRouteIntoRoutes: () => {},
    hydrateRoutesFromData: () => {},
    migrateTelefones: () => {},
    migrateFavorito: () => {},
    normalizeDeliveryCoords: () => {},
    empresaPadrao: () => '',
    mensagemWhatsappPadrao: () => '',
    scheduleBackgroundPhotoMigrate: () => {},
    loadHistory: () => {},
    scheduleOrphanPhotoPrune: () => {},
    seedIdCounter: () => {},
    updateAgendaCountBadge: () => {},
    updateDeliveryStats: () => {},
    renderDeliveriesList: () => {},
    renderRouteSwitcher: () => {},
    renderAgendaList: () => {},
    renderHistoryList: () => {},
    scheduleListPhotoHydration: () => {},
    setStorageLoadedUid: () => {},
    refreshMapAfterStorageLoad: () => {},
    showToast: () => {}
};

let storageFull = false;
let saveTimer = null;

export function configurePersist(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function isStorageFull() {
    return storageFull;
}

export function persistStorageNow() {
    if (!deps.getAuthReady() || !deps.getCurrentUser()) return false;
    try {
        deps.syncActiveRouteIntoRoutes();
        // Só `routes[]` — o espelho `deliveries` saiu; dados antigos migram em hydrateRoutesFromData.
        const payload = buildPersistPayload({
            routes: deps.getRoutes(),
            activeRouteId: deps.getActiveRouteId(),
            nextSequenceNumber: deps.getNextSequenceNumber(),
            agenda: deps.getAgenda(),
            nextAgendaId: deps.getNextAgendaId()
        });
        localStorage.setItem(deps.storageKey('data'), JSON.stringify(payload.data));
        localStorage.setItem(deps.storageKey('agenda'), JSON.stringify(payload.agenda));
        localStorage.setItem(deps.storageKey('profile'), JSON.stringify(deps.getUserProfile()));
        localStorage.setItem(deps.storageKey('updatedAt'), String(Date.now()));
        if (storageFull) {
            storageFull = false;
            deps.showToast('Espaço liberado. Dados salvos com sucesso');
        }
        return true;
    } catch (e) {
        if (!storageFull) {
            storageFull = true;
            deps.showToast('Armazenamento insuficiente. Remova dados antigos ou faça um backup', true);
        }
        return false;
    }
}

export function saveStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistStorageNow, 80);
}

function maybeMigrateLegacyKeys() {
    const user = deps.getCurrentUser();
    const uid = deps.currentUid();
    if (uid !== 'guest' && !(user && user.provider === 'local')) return;
    migrateLegacyLocalStorageKeys(localStorage, deps.storageKey);
}

function loadAgendaFromStorage() {
    const savedAgenda = localStorage.getItem(deps.storageKey('agenda'));
    if (!savedAgenda) {
        deps.setAgenda([]);
        deps.setNextAgendaId(1);
        return;
    }
    try {
        const data = JSON.parse(savedAgenda);
        const parsed = parseAgendaStorage(data);
        parsed.agenda.forEach((a) => {
            deps.migrateTelefones(a);
            deps.migrateFavorito(a);
            normalizeAgendaItemDefaults(a);
            deps.normalizeDeliveryCoords(a);
        });
        deps.setAgenda(parsed.agenda);
        deps.setNextAgendaId(parsed.nextAgendaId);
    } catch (e) {
        deps.setAgenda([]);
        deps.setNextAgendaId(1);
    }
}

function loadAndMigrateProfile() {
    let userProfile = deps.getUserProfile() || {};
    const savedProfile = localStorage.getItem(deps.storageKey('profile'));
    if (savedProfile) {
        try { userProfile = JSON.parse(savedProfile); } catch (e) { /* keep */ }
    }

    const empresaPadrao = deps.empresaPadrao();
    const msgPadrao = deps.mensagemWhatsappPadrao();
    const withEmpresa = ensureProfileEmpresa(userProfile, empresaPadrao);
    userProfile = withEmpresa.profile;

    const migrated = migrateWhatsAppTemplate(userProfile.mensagemPadrao, msgPadrao);
    userProfile = { ...userProfile, mensagemPadrao: migrated.message };
    deps.setUserProfile(userProfile);

    if (withEmpresa.changed || migrated.changed) {
        try {
            localStorage.setItem(deps.storageKey('profile'), JSON.stringify(userProfile));
        } catch (e) { /* quota */ }
    }
}

export async function loadStorage() {
    deps.resetMemoryState();
    maybeMigrateLegacyKeys();

    const saved = localStorage.getItem(deps.storageKey('data'));
    if (saved) {
        try {
            deps.hydrateRoutesFromData(JSON.parse(saved));
        } catch (e) {
            deps.hydrateRoutesFromData({});
        }
    } else {
        deps.hydrateRoutesFromData({});
    }

    loadAgendaFromStorage();
    loadAndMigrateProfile();

    // Fotos sob demanda (painel/lista), não no boot.
    deps.scheduleBackgroundPhotoMigrate();
    deps.loadHistory();
    // Housekeeping IDB em idle: órfãs + fotos de rotas finalizadas > TTL (30d).
    deps.scheduleOrphanPhotoPrune();
    persistStorageNow();

    deps.seedIdCounter();
    deps.updateAgendaCountBadge();
    deps.updateDeliveryStats();
    deps.renderDeliveriesList();
    deps.renderRouteSwitcher();
    deps.renderAgendaList();
    deps.renderHistoryList();
    deps.scheduleListPhotoHydration();
    deps.setStorageLoadedUid(deps.currentUid());
    deps.refreshMapAfterStorageLoad();
}
