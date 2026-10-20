// ============================================================
//  RotaFlow Pro — bootstrap/wiring do app do motorista
//  (bundle: npm run build → build/app.js). Estado compartilhado + configure*
//  dos módulos em src/js/ e lib/; lógica de domínio vive nos módulos.
//  Nada aqui é global: o que outro script precisar (ex.: callback do Maps) vai em `window`.
// ============================================================
import '../../native/bridge.js';
import '../../native/push-sender.js';
import {
    normalizeDeliveryCoords
} from '../../lib/routing-helpers.js';
import {
    isMutedPin
} from '../../lib/map-helpers.js';
import {
    configureFormPhones,
    setTempPhones,
    renderTempPhones,
    setupNewDeliveryPhoneUI
} from './form-phones.js';
import { getSequentialId, nextGeneratedId, seedIdCounterFromLists } from '../../lib/ids.js';
import {
    formatPhoneShort
} from '../../lib/phone-helpers.js';
import {
    configureWhatsApp,
    openExternalUrl,
    openWhatsAppChat,
    buildDeliveryWhatsAppMessage,
    sendWhatsApp
} from './whatsapp.js';
import {
    configureSidebar,
    switchSidebarTab,
    closeAllOverflowMenus,
    openOverflowWrap,
    setupOverflowMenus,
    toggleSidebar
} from './sidebar.js';
import {
    configureRiskAreas,
    loadRiskAreas,
    getRiskAreas,
    riskLevelForDelivery,
    setRiskLevelFromList,
    showRiskAreasModal
} from './risk-areas.js';
import {
    configureVehicleMode,
    loadVehicleMode,
    isVehicleModeEnabled,
    setVehicleModeEnabled,
    buildNavigationUrls
} from './vehicle-mode.js';
import {
    configureHaptics,
    playDeliveryHaptic,
    playNearHaptic
} from './haptics.js';
import {
    preferDaytimeRiskOrder,
    summarizeRouteRisk
} from '../../lib/risk-area-helpers.js';
import {
    configureResumeUi,
    recoverUiAfterResume,
    setupCameraRestoreHandler
} from './resume-ui.js';
import {
    configureLockScreen,
    clearActiveStopNotification,
    syncActiveStopNotification,
    setupScreenLockNotificationBridge
} from './lock-screen.js';
import {
    openGallery,
    closeGallery,
    nextPhoto,
    prevPhoto,
    isGalleryOpen,
    bindGalleryChrome
} from './gallery.js';
import {
    showToast,
    showConfirmModal,
    showPromptModal,
    showChoiceModal
} from './modals.js';
import {
    configureMapPins
} from './map-pins.js';
import {
    configureMapLayer,
    initMap
} from './map-layer.js';
import {
    configureMapMarkers,
    shouldShowOnMap,
    getMarker,
    upsertMarker,
    removeMarkerById,
    highlightMarker,
    updateMarkerIcon,
    rebuildMarkers,
    centerMapOnMarkers,
    clearHighlightedMarker
} from './map-markers.js';
import {
    configureDeliveryPanel,
    isActiveStop,
    deliveryPhotoCount,
    minimizeDeliveryPanel,
    closeDeliveryPanel,
    openDeliveryPanel,
    setupPanelSwipe,
    refreshPanelPhotos,
    updatePanelMiniPhotoUi,
    showOptimisticPanelPhoto,
    goToAdjacentDelivery,
    focusDeliveryInPanel,
    renderDeliveryPanelActions,
    setupFabRailClearance
} from './delivery-panel.js';
import {
    configureRouting,
    pendingStops,
    routeSignature,
    clearRouteOverlay,
    updateOptimizeFabVisibility,
    optimizeRoute,
    scheduleRouteRefresh,
    notifyRouteCompositionChanged,
    formatKm,
    formatDuration
} from './routing.js';
import {
    configureGps,
    updateGpsButton,
    startBackgroundGpsWatch,
    syncBackgroundGpsTargets,
    enableGpsTracking,
    toggleGps,
    requestStartPoint,
    showStartMarker,
    isBgGpsStarted
} from './gps.js';
import {
    configureTracking,
    prepareTrackingUrl,
    publishTrackingSession,
    syncTrackingStatus,
    closeTrackingSession,
    maybeMarkNearCustomer,
    sendDeliveredPush,
    sendAbsentPush,
    publishDriverGpsFromWatch,
    shareTrackingLink,
    refreshActiveTrackSessions,
    trackStatusFor
} from './tracking.js';
import {
    configureHistoryStore,
    loadHistory as loadHistoryFromStorage,
    getRouteHistory
} from './history-store.js';
import { loadHistory as loadHistoryModule } from './lazy-modules.js';
import {
    configureRoutes,
    syncActiveRouteIntoRoutes,
    hydrateRoutesFromData,
    renderRouteSwitcher,
    startNewRoute,
    clearRoute
} from './routes.js';
import {
    configurePersist,
    persistStorageNow,
    saveStorage,
    loadStorage
} from './persist.js';
import {
    configureAuth,
    getCurrentUser,
    getAuthReady,
    getUserProfile,
    setUserProfile,
    currentUid,
    storageKey,
    accountLabel,
    initAuthUi,
    logoutUser,
    EMPRESA_PADRAO,
    MENSAGEM_WHATSAPP_PADRAO
} from './auth.js';
import {
    configureCamera,
    pickPhotoDataUrls
} from './camera.js';
import { bindBackupButtons as bindBackupButtonsEager } from './backup-bindings.js';
import {
    configurePhotoStore,
    idbGetPhoto,
    idbDeletePhoto,
    idbPutPhoto,
    idbExportPhotoDataUrl,
    enqueuePhotoOp,
    yieldToUiFrame
} from './photo-store.js';
import {
    configureItemPhotos,
    remainingPhotoSlots,
    scheduleOrphanPhotoPrune,
    persistPhotoDataUrl,
    addPhotoDataUrlToItem,
    hydrateAllPhotos,
    ensureItemPhotos,
    applyRestoredCameraPhoto,
    scheduleBackgroundPhotoMigrate,
    scheduleListPhotoHydration,
    releaseInMemoryPhotosExcept
} from './item-photos.js';
import {
    configureDeliveriesList,
    renderDeliveriesList
} from './deliveries-list.js';
import {
    configureAgendaList,
    renderAgendaList
} from './agenda-list.js';
import {
    configureBackupStore
} from './backup-store.js';
import {
    configureNotDelivered,
    playDeliveryFeedback,
    countNormalActiveStops,
    maybeNotifyVoltarDepois,
    markNotDelivered,
    resetVoltarDepoisAlert
} from './not-delivered.js';
import {
    configureUndoSnackbar,
    showUndoSnackbar,
    setupUndoSnackbar
} from './undo-snackbar.js';
import {
    configureAddDeliveryForm,
    setupAddressDuplicateCheck,
    checkAddressDuplicate,
    addDeliveryDirect,
    setupAddDeliveryForm
} from './add-delivery-form.js';
import {
    configureAgendaRoute,
    findActiveRouteByAddress,
    syncFavoritoToAgenda,
    syncAgendaByDelivery,
    addAgendaToRoute,
    saveToAgenda,
    copyFromOtherRoute,
    saveDeliveryPhotoToAgenda
} from './agenda-route.js';
import {
    migrateTelefones,
    migrateFavorito
} from '../../lib/migrate-helpers.js';
import {
    configureRouteUi,
    updateDeliveryStats,
    estimateStopEta,
    hideMapSelectedChip,
    updateMapNextChip,
    updateDaySummary,
    updateProgressAndEstimates,
    updateLastIdDisplay,
    focusMapOnDelivery
} from './route-ui.js';
import {
    configureDeliveryStatus,
    geocodeAddressAndUpdate,
    markDelivered,
    undoDeliveryStatus
} from './delivery-status.js';
import {
    configurePanelCapture,
    scheduleDeliveriesListPhotoRefresh,
    capturePhotoForSelectedDelivery,
    capturePhotoForDelivery,
    setupPanelPhotoCapture
} from './panel-capture.js';
import {
    configurePanelEditActions,
    adjustPacotes,
    editObservation,
    editPhonesPanel
} from './panel-edit-actions.js';
import {
    configureAppBoot,
    setupDomContentLoadedBoot,
    setupRuntimeBoot
} from './app-boot.js';

// --- App local ---
if (location.hostname === '127.0.0.1') {
    location.replace(location.href.replace('://127.0.0.1', '://localhost'));
}

let map, geocoder, autocomplete;
let deliveries = [], agenda = [];
let routes = [];
let activeRouteId = null;
let nextSequenceNumber = 1, nextAgendaId = 1;
let routeMetrics = null;
let routeActive = false;
let startPoint = null;
let gpsAccuracyMeters = 0;

// ---------------------------------------------------------------------------
// Histórico: estado/persistência no boot (history-store.js), UI sob demanda.
// Carregar o render só quando a aba abre evita ~6 KB no caminho crítico — a
// lista nem está visível no boot. `renderHistoryList` marca "sujo" se a UI
// ainda não existe, e a aba executa o render pendente ao abrir.
// ---------------------------------------------------------------------------
let historyUi = null;
let historyUiDirty = false;
let historyDepsConfigured = false;

function historyUiDeps() {
    return {
        getDeliveries: () => deliveries,
        setDeliveries: (next) => { deliveries = Array.isArray(next) ? next : []; },
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        getRouteMetrics: () => routeMetrics,
        setRouteMetrics: (m) => { routeMetrics = m; },
        setRouteActive: (v) => { routeActive = !!v; },
        getUserProfile,
        showToast,
        showConfirmModal,
        persistStorageNow,
        saveStorage,
        getSequentialId,
        newId,
        seedIdCounter,
        closeTrackingSession,
        trackStatusFor,
        clearRouteOverlay,
        renderDeliveriesList,
        renderRouteSwitcher,
        rebuildMarkers,
        updateLastIdDisplay,
        closeDeliveryPanel,
        clearActiveStopNotification,
        renderAgendaList,
        switchSidebarTab
    };
}

async function ensureHistoryUi() {
    if (!historyUi) {
        const mod = await loadHistoryModule();
        if (!historyDepsConfigured) {
            mod.configureHistory(historyUiDeps());
            historyDepsConfigured = true;
        }
        mod.setupHistoryListDelegation();
        historyUi = mod;
        if (historyUiDirty) {
            historyUiDirty = false;
            mod.renderHistoryList();
        }
    }
    return historyUi;
}

/** Chamado pela aba Histórico: carrega a UI, configura e renderiza. */
function openHistoryTab() {
    ensureHistoryUi().catch(avisoModuloIndisponivel);
}

/** Wrapper injetado no persist.js — barato no boot, renderiza se a aba já abriu. */
function renderHistoryList() {
    if (!historyUi) {
        historyUiDirty = true;
        return;
    }
    historyUi.renderHistoryList();
}

/** Wrapper do botão "Arquivar dia": carrega a UI antes de arquivar. */
async function archiveCurrentRouteDay(opts) {
    const mod = await ensureHistoryUi();
    return mod.archiveCurrentRouteDay(opts);
}

let useNativeMap = false, nativeGoogleMap = null, nativeMarkerById = new Map();
let nativeMapZoom = 12;
function isNativeApp() {
    if (window.RotaFlowCap && typeof window.RotaFlowCap.isNative === 'function' && window.RotaFlowCap.isNative()) {
        return true;
    }
    try {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch (_) {
        return false;
    }
}

// Facade/shims nativos: src/js/map-layer.js (configureMapLayer).

let pinSizePref = (() => {
    try {
        const v = localStorage.getItem('rotaflow_pin_size');
        if (v === 'p' || v === 'm' || v === 'g') return v;
    } catch (_) {}
    return 'p';
})();
let feedbackSoundEnabled = (() => {
    try { return localStorage.getItem('rotaflow_feedback_sound') !== '0'; } catch (_) { return true; }
})();
let feedbackVibrateEnabled = (() => {
    try { return localStorage.getItem('rotaflow_feedback_vibrate') !== '0'; } catch (_) { return true; }
})();
let pinRefreshTimer = null;

function schedulePinSizeRefresh() {
    clearTimeout(pinRefreshTimer);
    pinRefreshTimer = setTimeout(() => {
        if (!map) return;
        for (const del of deliveries) {
            if (!shouldShowOnMap(del)) continue;
            const marker = getMarker(del.sequentialId);
            if (marker) updateMarkerIcon(marker, del);
        }
    }, 120);
}

function setPinSizePref(size) {
    if (size !== 'p' && size !== 'm' && size !== 'g') return;
    pinSizePref = size;
    try { localStorage.setItem('rotaflow_pin_size', size); } catch (_) {}
    schedulePinSizeRefresh();
}

function setFeedbackPrefs({ sound, vibrate } = {}) {
    if (typeof sound === 'boolean') {
        feedbackSoundEnabled = sound;
        try { localStorage.setItem('rotaflow_feedback_sound', sound ? '1' : '0'); } catch (_) {}
    }
    if (typeof vibrate === 'boolean') {
        feedbackVibrateEnabled = vibrate;
        try { localStorage.setItem('rotaflow_feedback_vibrate', vibrate ? '1' : '0'); } catch (_) {}
    }
}

// Marcadores: src/js/map-markers.js (configureMapMarkers).
// shouldShowOnMap / getMarker / upsert / rebuild / highlight vêm do módulo.

let gpsEnabled = localStorage.getItem('rotaflow_gps') !== '0';
let routeFilter = "", agendaFilter = "";
let currentSelectedDelivery = null;
// tempPhones: src/js/form-phones.js (getTempPhones / setTempPhones).
// Auth: currentUser / authReady / userProfile em src/js/auth.js (getters).

const APP_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='104' fill='%230f172a'/%3E%3Cpath d='M148 388C148 300 372 330 372 200' fill='none' stroke='%233b82f6' stroke-width='30' stroke-linecap='round' stroke-dasharray='4 46'/%3E%3Ccircle cx='148' cy='388' r='46' fill='%2322c55e'/%3E%3Ccircle cx='372' cy='176' r='46' fill='%23ef4444'/%3E%3C/svg%3E";

function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

// Sidebar / overflow: src/js/sidebar.js (configureSidebar no boot).

// ========== UTILITÁRIOS ==========
// Telefone, escape HTML e ids sequenciais vivem em lib/ (testáveis, sem DOM).
// WhatsApp / openExternalUrl: src/js/whatsapp.js (configureWhatsApp no boot).

// Toast/modais: src/js/modals.js

/** Catch silent crashes / rejected promises + Crashlytics (nativo). Rate-limited toast. */
(function installGlobalErrorHooks() {
    let lastToastAt = 0;
    const IGNORE = /ResizeObserver|Script error\.?$|Failed to fetch|NetworkError|Load failed|AbortError|user denied|cancel|QuotaExceeded/i;
    function report(kind, detail) {
        try { console.error('[RotaFlow]', kind, detail); } catch (_) {}
        const msg = String((detail && (detail.message || detail.reason || detail.stack)) || detail || '');
        try {
            if (window.RotaFlowCap && typeof window.RotaFlowCap.reportNonFatal === 'function') {
                window.RotaFlowCap.reportNonFatal(kind + ': ' + msg.slice(0, 180), msg.slice(0, 500));
            }
        } catch (_) {}
        if (!msg || IGNORE.test(msg)) return;
        const now = Date.now();
        if (now - lastToastAt < 10000) return;
        lastToastAt = now;
        try { showToast('Algo falhou — tente de novo', true); } catch (_) {}
    }
    window.addEventListener('error', (ev) => {
        report('error', ev.error || ev.message);
    });
    window.addEventListener('unhandledrejection', (ev) => {
        report('unhandledrejection', ev.reason);
    });
})();

// Modais: src/js/modals.js

// Identificador único e crescente, mesmo com duas entregas no mesmo milissegundo.
const idState = { lastGeneratedId: 0 };
function newId() {
    return nextGeneratedId(idState);
}

// Impede que um backup restaurado gere IDs repetidos.
function seedIdCounter() {
    const lists = [deliveries, agenda];
    for (const r of routes) {
        if (r && Array.isArray(r.deliveries) && r.deliveries !== deliveries) lists.push(r.deliveries);
    }
    seedIdCounterFromLists(idState, lists);
}

// ========== RASTREIO DO CLIENTE ==========
// Implementação em src/js/tracking.js (configureTracking no boot).

// ========== MIGRAÇÃO E PERSISTÊNCIA ==========
// migrateTelefones / migrateFavorito: lib/migrate-helpers.js

configurePhotoStore({ getUid: currentUid });
configureBackupStore({ getUid: currentUid, storageKey, isNativeApp });

// Indicador de sync: src/js/sync-status.js (initSyncStatusUI no boot; eventos ligados em persist.js/backup-ui.js).

// Auth local/sessão/logout: src/js/auth.js (configureAuth no boot).
// Captura multi-foto nativa/web: src/js/camera.js (configureCamera no boot).
// Persistência de fotos no item: src/js/item-photos.js (configureItemPhotos no boot).

// Resume UI / restore câmera: src/js/resume-ui.js (configureResumeUi no boot).
// Lock screen / ScreenEvents: src/js/lock-screen.js (configureLockScreen no boot).

// ========== ROTAS MÚLTIPLAS ==========
// Implementação em src/js/routes.js (configureRoutes no boot).

// ========== PERSISTÊNCIA ==========
// Implementação em src/js/persist.js (configurePersist no boot).

// ========== EDIT MODALS (lazy) ==========
// 30 KB só usado quando o motorista edita uma entrega ou parada da agenda.
// Carregado sob demanda; a configuração das deps acontece na primeira chamada.
let editModalsReady = false;

async function ensureEditModals() {
    if (editModalsReady) return;
    editModalsReady = true;
    const { configureEditModals } = await import('./edit-modals.js');
    configureEditModals({
        showToast,
        persistStorageNow,
        saveStorage,
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        refreshPanelPhotos,
        scheduleDeliveriesListPhotoRefresh,
        geocodeAddressAndUpdate,
        getMarker,
        updateMarkerIcon,
        rebuildMarkers,
        updateDeliveryStats,
        renderDeliveriesList,
        renderDeliveryPanelActions,
        syncAgendaByDelivery,
        syncActiveStopNotification,
        getAgenda: () => agenda,
        setAgendaItemAt: (idx, item) => { agenda[idx] = item; },
        getGeocoder: () => geocoder,
        renderAgendaList
    });
}

async function showEditDeliveryModal(delivery, onDone) {
    await ensureEditModals();
    const m = await import('./edit-modals.js');
    return m.showEditDeliveryModal(delivery, onDone);
}

async function editDeliveryInRoute(delivery, updates) {
    await ensureEditModals();
    const m = await import('./edit-modals.js');
    return m.editDeliveryInRoute(delivery, updates);
}

async function showEditAgendaModal(item, onDone) {
    await ensureEditModals();
    const m = await import('./edit-modals.js');
    return m.showEditAgendaModal(item, onDone);
}

async function editAgendaItem(id, updates) {
    await ensureEditModals();
    const m = await import('./edit-modals.js');
    return m.editAgendaItem(id, updates);
}

// ========== MÓDULOS DE UI CARREGADOS SOB DEMANDA (patch 06) ==========
//  Perfil (10 KB), sugestões de nome (7 KB) e backup/restore (12,5 KB) só existem
//  quando o motorista usa o recurso. Mesmo padrão do edit-modals: um `ensure*()`
//  memoizado que configura as deps na primeira carga + wrappers com o nome antigo,
//  então nenhum outro módulo precisou mudar.
//  Chamadas que acontecem no boot (lembrete de backup, agendador, sugestões de
//  nome) são **agendadas para o primeiro idle** em vez de puxar o chunk na hora.

/**
 * Roda `fn` no primeiro idle — opcionalmente só depois de `delay` ms, para não
 * competir com o boot. O handle é cancelável (usado quando o motorista clica no
 * botão antes do agendamento disparar).
 * @param {Function} fn
 * @param {{ delay?: number, timeout?: number }} [opts]
 */
function scheduleIdle(fn, opts = {}) {
    const { delay = 0, timeout = 2500 } = opts;
    const handle = { idle: null, timer: null };
    const agendar = () => {
        if (typeof requestIdleCallback === 'function') {
            handle.idle = requestIdleCallback(fn, { timeout });
        } else {
            handle.timer = setTimeout(fn, 400);
        }
    };
    if (delay > 0) handle.timer = setTimeout(agendar, delay);
    else agendar();
    return handle;
}

function cancelScheduledIdle(handle) {
    if (!handle) return;
    if (handle.idle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(handle.idle);
    if (handle.timer !== null) clearTimeout(handle.timer);
}

/** Primeiro carregamento de módulo pesado no boot espera este tempo. */
const IDLE_BOOT_DELAY_MS = 5000;

/**
 * Um `import()` sob demanda pode falhar quando o aparelho está sem rede e o chunk
 * nunca foi baixado. Antes isso virava erro silencioso (promise rejeitada sem dono);
 * agora o motorista vê o motivo. O service worker já precacheia as telas críticas
 * (backup, histórico, edição), então este aviso é o caso raro.
 */
function avisoModuloIndisponivel(err) {
    console.warn('módulo sob demanda indisponível', err);
    try {
        showToast('Sem conexão: este recurso ainda não foi baixado no aparelho', true);
    } catch (_) {}
}


// ---------- PERFIL ----------
let profileModulePromise = null;

function ensureProfile() {
    if (!profileModulePromise) {
        profileModulePromise = import('./profile.js').then((mod) => {
            mod.configureProfile({
                getUserProfile,
                getCurrentUser,
                accountLabel,
                getPinSizePref: () => pinSizePref,
                getFeedbackVibrateEnabled: () => feedbackVibrateEnabled,
                getFeedbackSoundEnabled: () => feedbackSoundEnabled,
                getVehicleModeEnabled: () => isVehicleModeEnabled(),
                setPinSizePref,
                setFeedbackPrefs,
                setVehicleModeEnabled,
                showRiskAreasModal,
                saveStorage,
                backupData,
                logoutUser,
                showToast
            });
            return mod;
        });
    }
    return profileModulePromise;
}

/** Abre o modal de perfil (carrega o módulo na primeira vez). */
async function showProfileModal() {
    try {
        const mod = await ensureProfile();
        return mod.showProfileModal();
    } catch (err) {
        avisoModuloIndisponivel(err);
    }
}

// ---------- SUGESTÕES DE NOME ----------
let nameSuggestionsModulePromise = null;
let nameSuggestionsInited = false;

function ensureNameSuggestions() {
    if (!nameSuggestionsModulePromise) {
        nameSuggestionsModulePromise = import('./name-suggestions.js').then((mod) => {
            mod.configureNameSuggestions({
                debounce,
                getAgenda: () => agenda,
                getDeliveries: () => deliveries,
                findActiveRouteByAddress,
                setTempPhones,
                renderTempPhones,
                checkAddressDuplicate,
                saveStorage,
                renderDeliveriesList,
                getMarker,
                updateMarkerIcon,
                updateDeliveryStats,
                showToast,
                addDeliveryDirect
            });
            return mod;
        });
    }
    return nameSuggestionsModulePromise;
}

/**
 * Boot: em vez de inicializar o autocomplete agora, só arma o gatilho.
 * O módulo (e o listener de `input` que ele instala) entra quando o motorista
 * encosta no campo "Nome" — antes disso o autocomplete seria inútil.
 */
function setupNameSuggestionsOnDemand() {
    const input = document.getElementById('customerName');
    if (!input) return;
    const load = () => {
        if (nameSuggestionsInited) return;
        nameSuggestionsInited = true;
        ensureNameSuggestions()
            .then((mod) => mod.initNameSuggestions())
            .catch(() => { nameSuggestionsInited = false; });
    };
    input.addEventListener('focus', load, { once: true });
    input.addEventListener('touchstart', load, { once: true, passive: true });
}

// ---------- BACKUP / RESTORE ----------
let backupModulePromise = null;
let backupIdleHandle = null;
/** Chamadas feitas antes do módulo existir (ex.: lembrete no boot). */
let backupPending = [];

function startBackupLoad() {
    if (!backupModulePromise) {
        cancelScheduledIdle(backupIdleHandle);
        backupIdleHandle = null;
        backupModulePromise = import('./backup-ui.js').then((mod) => {
            mod.configureBackupUi({
                getDeliveries: () => deliveries,
                getAgenda: () => agenda,
                setAgenda: (a) => { agenda = Array.isArray(a) ? a : []; },
                getRoutes: () => routes,
                getActiveRouteId: () => activeRouteId,
                getNextSequenceNumber: () => nextSequenceNumber,
                setNextAgendaId: (n) => { nextAgendaId = n; },
                getNextAgendaId: () => nextAgendaId,
                getUserProfile,
                setUserProfile,
                persistStorageNow,
                syncActiveRouteIntoRoutes,
                isNativeApp,
                showToast,
                showConfirmModal,
                showChoiceModal,
                hydrateRoutesFromData,
                migrateTelefones,
                migrateFavorito,
                normalizeDeliveryCoords,
                hydrateAllPhotos,
                exportPhotoDataUrl: idbExportPhotoDataUrl,
                idbPutPhoto,
                yieldToUiFrame,
                seedIdCounter,
                clearRouteOverlay,
                renderDeliveriesList,
                renderRouteSwitcher,
                renderAgendaList,
                rebuildMarkers,
                updateDeliveryStats,
                updateOptimizeFabVisibility,
                updateLastIdDisplay,
                getAuthReady,
                recoverUiAfterResume
            });
            // Roda o que ficou pendente (lembrete, agendador, contador).
            const fila = backupPending;
            backupPending = [];
            for (const [metodo, args] of fila) {
                try { mod[metodo](...args); } catch (_) {}
            }
            return mod;
        });
    }
    return backupModulePromise;
}

/**
 * Executa uma função do backup-ui.
 * @param {string} metodo nome exportado em backup-ui.js
 * @param {any[]} args
 * @param {{ now?: boolean }} [opts] `now`: ação do usuário, carrega já; senão agenda no idle
 */
function backupCall(metodo, args = [], opts = {}) {
    if (backupModulePromise) {
        return backupModulePromise.then((mod) => mod[metodo](...args)).catch(() => {});
    }
    if (opts.now) {
        return startBackupLoad()
            .then((mod) => mod[metodo](...args))
            .catch(avisoModuloIndisponivel);
    }
    // Dedupe: o boot chama o lembrete a cada render; repetir a mesma chamada
    // na fila não muda nada e só faria trabalho dobrado no flush.
    const jaNaFila = backupPending.some(([m, a]) => m === metodo && a === args);
    if (!jaNaFila) backupPending.push([metodo, args]);
    if (!backupIdleHandle) {
        backupIdleHandle = scheduleIdle(() => {
            backupIdleHandle = null;
            startBackupLoad().catch(() => {});
        }, { delay: IDLE_BOOT_DELAY_MS });
    }
    return Promise.resolve();
}

// Wrappers com os nomes que os outros módulos já usavam via deps.
function backupData() { return backupCall('backupData', [], { now: true }); }
function maybeShowBackupReminder() { return backupCall('maybeShowBackupReminder'); }
function setupBackupReminderUi() { return backupCall('setupBackupReminderUi'); }
function setupAutoBackupScheduler() { return backupCall('setupAutoBackupScheduler'); }
function noteDeliveryCompletedForBackup() { return backupCall('noteDeliveryCompletedForBackup'); }
function maybeAutoBackupOnDayChange() { return backupCall('maybeAutoBackupOnDayChange'); }

/** Boot: liga os botões na hora; o módulo de verdade vem no uso (ou no idle). */
function bindBackupButtons() {
    bindBackupButtonsEager({
        backupData,
        restoreData: (file) => backupCall('restoreData', [file], { now: true }),
        backupAgenda: () => backupCall('backupAgenda', [], { now: true }),
        restoreAgenda: (file) => backupCall('restoreAgenda', [file], { now: true }),
        restoreFromJson: (json) => backupCall('restoreFromJson', [json], { now: true })
    });
}

function configureExtractedModules() {
    configureWhatsApp({
        isNativeApp,
        getUserProfile,
        showToast,
        showChoiceModal,
        prepareTrackingUrl,
        publishTrackingSession,
        getGpsEnabled: () => gpsEnabled,
        getStartPoint: () => startPoint
    });
    configureSidebar({
        closeDeliveryPanel,
        hideMapSelectedChip,
        updateMapNextChip,
        getMap: () => map
    });
    configureRiskAreas({
        getStorage: () => (typeof localStorage !== 'undefined' ? localStorage : null),
        showToast,
        onAreasChanged: () => {
            try { rebuildMarkers(false); } catch (_) {}
            try { renderDeliveriesList(); } catch (_) {}
        }
    });
    configureVehicleMode({
        getStorage: () => (typeof localStorage !== 'undefined' ? localStorage : null),
        showToast
    });
    configureHaptics({
        getFeedbackVibrateEnabled: () => feedbackVibrateEnabled,
        isNativeApp
    });
    loadRiskAreas();
    loadVehicleMode();
    configureResumeUi({
        isNativeApp,
        getUseNativeMap: () => useNativeMap,
        getNativeGoogleMap: () => nativeGoogleMap,
        getMap: () => map,
        getNativeMapZoom: () => nativeMapZoom,
        enqueuePhotoOp,
        applyRestoredCameraPhoto,
        getGpsEnabled: () => gpsEnabled,
        startBackgroundGpsWatch,
        syncBackgroundGpsTargets
    });
    configureLockScreen({
        isNativeApp,
        getCurrentSelectedDelivery: () => currentSelectedDelivery
    });
    configureFormPhones({
        showToast
    });
    configureNotDelivered({
        getDeliveries: () => deliveries,
        isActiveStop,
        getFeedbackVibrateEnabled: () => feedbackVibrateEnabled,
        getFeedbackSoundEnabled: () => feedbackSoundEnabled,
        playDeliveryHaptic,
        getAppIcon: () => APP_ICON,
        showToast,
        showChoiceModal,
        saveStorage,
        getMarker,
        updateMarkerIcon,
        rebuildMarkers,
        updateDeliveryStats,
        renderDeliveriesList,
        releaseInMemoryPhotosExcept,
        syncTrackingStatus,
        sendAbsentPush,
        notifyRouteCompositionChanged,
        noteDeliveryCompletedForBackup,
        showUndoSnackbar,
        minimizeDeliveryPanel,
        goToAdjacentDelivery
    });
    configureUndoSnackbar({
        undoDeliveryStatus
    });
    configureAddDeliveryForm({
        getAgenda: () => agenda,
        getDeliveries: () => deliveries,
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        getNextAgendaId: () => nextAgendaId,
        setNextAgendaId: (n) => { nextAgendaId = n; },
        pushDelivery: (d) => { deliveries.push(d); },
        pushAgendaItem: (item) => { agenda.push(item); },
        findActiveRouteByAddress,
        getGeocoder: () => geocoder,
        newId,
        showToast,
        persistStorageNow,
        saveStorage,
        renderDeliveriesList,
        renderAgendaList,
        upsertMarker,
        updateLastIdDisplay,
        clearRouteOverlay,
        updateProgressAndEstimates,
        centerMapOnMarkers
    });
    configureAgendaRoute({
        getAgenda: () => agenda,
        pushAgendaItem: (item) => { agenda.push(item); },
        getNextAgendaId: () => nextAgendaId,
        setNextAgendaId: (n) => { nextAgendaId = n; },
        getDeliveries: () => deliveries,
        pushDelivery: (d) => { deliveries.push(d); },
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        getGeocoder: () => geocoder,
        newId,
        showToast,
        persistStorageNow,
        saveStorage,
        renderDeliveriesList,
        renderAgendaList,
        upsertMarker,
        updateLastIdDisplay,
        clearRouteOverlay,
        updateProgressAndEstimates,
        ensureItemPhotos,
        idbGetPhoto,
        persistPhotoDataUrl,
        deliveryPhotoCount
    });
    configureRouteUi({
        getDeliveries: () => deliveries,
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        getRouteActive: () => routeActive,
        getRouteMetrics: () => routeMetrics,
        getStartPoint: () => startPoint,
        isActiveStop,
        pendingStops,
        routeSignature,
        formatDuration,
        formatKm,
        updateOptimizeFabVisibility,
        maybeShowBackupReminder,
        renderRouteSwitcher,
        getMap: () => map,
        getUseNativeMap: () => useNativeMap,
        getNativeGoogleMap: () => nativeGoogleMap,
        setNativeMapZoom: (z) => { nativeMapZoom = z; },
        getRiskLevelForDelivery: riskLevelForDelivery
    });
    configureDeliveryStatus({
        getDeliveries: () => deliveries,
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        getGeocoder: () => geocoder,
        showToast,
        saveStorage,
        syncTrackingStatus,
        getMarker,
        updateMarkerIcon,
        rebuildMarkers,
        renderDeliveriesList,
        releaseInMemoryPhotosExcept,
        sendDeliveredPush,
        upsertMarker,
        updateDeliveryStats,
        notifyRouteCompositionChanged,
        playDeliveryFeedback,
        noteDeliveryCompletedForBackup,
        countNormalActiveStops,
        maybeNotifyVoltarDepois,
        minimizeDeliveryPanel,
        goToAdjacentDelivery,
        openDeliveryPanel,
        syncActiveStopNotification
    });
    configurePanelCapture({
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        showToast,
        remainingPhotoSlots,
        pickPhotoDataUrls,
        addPhotoDataUrlToItem,
        persistStorageNow,
        refreshPanelPhotos,
        showOptimisticPanelPhoto,
        updatePanelMiniPhotoUi,
        renderDeliveriesList,
        saveDeliveryPhotoToAgenda,
        panelShowsDelivery: (delivery) => {
            const selected = currentSelectedDelivery;
            return !!(selected && delivery && selected.id === delivery.id);
        }
    });
    configurePanelEditActions({
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        showToast,
        showPromptModal,
        saveStorage,
        getMarker,
        updateMarkerIcon,
        renderDeliveriesList,
        renderDeliveryPanelActions,
        syncActiveStopNotification,
        syncAgendaByDelivery
    });
    configureItemPhotos({
        currentUid,
        getRoutes: () => routes,
        getAgenda: () => agenda,
        getDeliveries: () => deliveries,
        getActiveRouteId: () => activeRouteId,
        getRouteHistory,
        syncActiveRouteIntoRoutes,
        persistStorageNow,
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        refreshPanelPhotos,
        renderDeliveriesList,
        renderAgendaList,
        showToast
    });
    configureDeliveriesList({
        getDeliveries: () => deliveries,
        setDeliveries: (next) => { deliveries = Array.isArray(next) ? next : []; },
        getRouteFilter: () => routeFilter,
        updateDeliveryStats,
        closeAllOverflowMenus,
        openOverflowWrap,
        getMarker,
        highlightMarker,
        openDeliveryPanel,
        saveStorage,
        persistStorageNow,
        syncFavoritoToAgenda,
        showToast,
        sendWhatsApp,
        shareTrackingLink,
        captureDeliveryPhoto: (delivery, mode, triggerBtn) => capturePhotoForDelivery(delivery, mode, triggerBtn),
        showEditDeliveryModal,
        editDeliveryInRoute,
        clearRouteOverlay,
        updateProgressAndEstimates,
        showConfirmModal,
        closeTrackingSession,
        removeMarkerById,
        saveToAgenda,
        upsertMarker,
        syncTrackingStatus,
        notifyRouteCompositionChanged,
        sendDeliveredPush,
        playDeliveryFeedback,
        noteDeliveryCompletedForBackup,
        countNormalActiveStops,
        maybeNotifyVoltarDepois,
        getRiskLevelForDelivery: riskLevelForDelivery,
        setRiskLevelFromList,
        rebuildMarkers
    });
    configureAgendaList({
        getAgenda: () => agenda,
        setAgenda: (a) => { agenda = Array.isArray(a) ? a : []; },
        getAgendaFilter: () => agendaFilter,
        getDeliveries: () => deliveries,
        closeAllOverflowMenus,
        openOverflowWrap,
        addAgendaToRoute,
        showConfirmModal,
        saveStorage,
        persistStorageNow,
        showToast,
        showEditAgendaModal,
        editAgendaItem
    });
    // edit-modals.js é lazy: configurado na primeira chamada (ensureEditModals).
    configureMapPins({
        getPinSizePref: () => pinSizePref,
        countActivePins: () => deliveries.filter((d) => shouldShowOnMap(d) && !isMutedPin(d)).length,
        getRiskLevelForDelivery: riskLevelForDelivery
    });
    configureMapMarkers({
        getMap: () => map,
        getUseNativeMap: () => useNativeMap,
        getDeliveries: () => deliveries,
        openDeliveryPanel,
        updateDeliveryStats,
        getRiskLevelForDelivery: riskLevelForDelivery
    });
    configureDeliveryPanel({
        getDeliveries: () => deliveries,
        getCurrentSelected: () => currentSelectedDelivery,
        setCurrentSelected: (d) => { currentSelectedDelivery = d; },
        ensureItemPhotos,
        resetHighlightedMarker: clearHighlightedMarker,
        hideMapSelectedChip,
        isNativeApp,
        openExternalUrl,
        sendWhatsApp,
        undoDeliveryStatus,
        markNotDelivered,
        markDelivered,
        capturePhotoForSelectedDelivery,
        showToast,
        syncActiveStopNotification,
        clearActiveStopNotification,
        updateMapNextChip,
        getMarker,
        highlightMarker,
        focusMapOnDelivery,
        openGallery,
        saveDeliveryPhotoToAgenda,
        idbDeletePhoto,
        saveStorage,
        scheduleDeliveriesListPhotoRefresh,
        isVehicleModeEnabled,
        showChoiceModal,
        buildNavigationUrls,
        getRiskLevelForDelivery: riskLevelForDelivery
    });
    configureMapLayer({
        isNativeApp,
        getMap: () => map,
        setMap: (m) => { map = m; },
        getGeocoder: () => geocoder,
        setGeocoder: (g) => { geocoder = g; },
        getAutocomplete: () => autocomplete,
        setAutocomplete: (a) => { autocomplete = a; },
        getUseNativeMap: () => useNativeMap,
        setUseNativeMap: (v) => { useNativeMap = !!v; },
        getNativeGoogleMap: () => nativeGoogleMap,
        setNativeGoogleMap: (m) => { nativeGoogleMap = m; },
        getNativeMarkerById: () => nativeMarkerById,
        setNativeMarkerById: (m) => { nativeMarkerById = m; },
        getNativeMapZoom: () => nativeMapZoom,
        setNativeMapZoom: (z) => { nativeMapZoom = z; },
        getAuthReady,
        getStorageLoadedUid: () => storageLoadedUid,
        currentUid,
        refreshMapAfterStorageLoad,
        loadStorage,
        showStartMarker
    });
    configureGps({
        isNativeApp,
        getStartPoint: () => startPoint,
        setStartPoint: (p) => { startPoint = p; },
        getGpsEnabled: () => gpsEnabled,
        setGpsEnabled: (v) => { gpsEnabled = !!v; },
        getGpsAccuracyMeters: () => gpsAccuracyMeters,
        setGpsAccuracyMeters: (n) => { gpsAccuracyMeters = n; },
        getMap: () => map,
        getUseNativeMap: () => useNativeMap,
        getNativeGoogleMap: () => nativeGoogleMap,
        getDeliveries: () => deliveries,
        isActiveStop,
        maybeMarkNearCustomer,
        publishDriverGpsFromWatch,
        updateMapNextChip,
        updateOptimizeFabVisibility,
        showToast
    });
    configureRouting({
        getDeliveries: () => deliveries,
        getStartPoint: () => startPoint,
        getRouteActive: () => routeActive,
        setRouteActive: (v) => { routeActive = !!v; },
        getRouteMetrics: () => routeMetrics,
        setRouteMetrics: (m) => { routeMetrics = m; },
        requestStartPoint,
        showStartMarker,
        saveStorage,
        renderDeliveriesList,
        rebuildMarkers,
        centerMapOnMarkers,
        switchSidebarTab,
        refreshActiveTrackSessions,
        updateProgressAndEstimates,
        syncBackgroundGpsTargets,
        showToast,
        yieldToUiFrame,
        getTravelMode: () => google.maps.TravelMode.DRIVING,
        getRiskAreas,
        preferDaytimeRiskOrder,
        summarizeRouteRisk
    });
    configureTracking({
        isNativeApp,
        getDeliveries: () => deliveries,
        getUserProfile,
        getStartPoint: () => startPoint,
        getGpsAccuracyMeters: () => gpsAccuracyMeters,
        getGpsEnabled: () => gpsEnabled,
        getRouteActive: () => routeActive,
        getRouteMetrics: () => routeMetrics,
        pendingStops,
        isActiveStop,
        estimateStopEta,
        saveStorage,
        showToast,
        showChoiceModal,
        formatPhoneShort,
        openWhatsAppChat,
        buildDeliveryWhatsAppMessage,
        syncBackgroundGpsTargets,
        isBgGpsStarted,
        playNearHaptic
    });
    configureAuth({
        loadStorage,
        persistStorageNow,
        maybeAutoBackupOnDayChange,
        resetAppAfterLogout: () => {
            storageLoadedUid = null;
            deliveries = [];
            agenda = [];
            routes = [];
            activeRouteId = null;
            nextSequenceNumber = 1;
            routeActive = false;
            routeMetrics = null;
            clearRouteOverlay();
            rebuildMarkers(false);
            renderDeliveriesList();
            renderRouteSwitcher();
            renderAgendaList();
        },
        showToast,
        showConfirmModal
    });
    configureCamera({
        isNativeApp,
        persistStorageNow,
        recoverUiAfterResume,
        showToast
    });
    configurePersist({
        getAuthReady,
        getCurrentUser,
        currentUid,
        storageKey,
        getRoutes: () => routes,
        getActiveRouteId: () => activeRouteId,
        getNextSequenceNumber: () => nextSequenceNumber,
        getAgenda: () => agenda,
        setAgenda: (a) => { agenda = Array.isArray(a) ? a : []; },
        getNextAgendaId: () => nextAgendaId,
        setNextAgendaId: (n) => { nextAgendaId = n; },
        getUserProfile,
        setUserProfile,
        resetMemoryState: () => {
            deliveries = [];
            agenda = [];
            routes = [];
            activeRouteId = null;
            nextSequenceNumber = 1;
            nextAgendaId = 1;
            routeActive = false;
            routeMetrics = null;
        },
        syncActiveRouteIntoRoutes,
        hydrateRoutesFromData,
        migrateTelefones,
        migrateFavorito,
        normalizeDeliveryCoords,
        empresaPadrao: () => EMPRESA_PADRAO,
        mensagemWhatsappPadrao: () => MENSAGEM_WHATSAPP_PADRAO,
        scheduleBackgroundPhotoMigrate,
        loadHistory: loadHistoryFromStorage,
        scheduleOrphanPhotoPrune,
        seedIdCounter,
        updateAgendaCountBadge: () => {
            const el = document.getElementById('agendaCountBadge');
            if (el) el.innerHTML = agenda.length;
        },
        updateDeliveryStats,
        renderDeliveriesList,
        renderRouteSwitcher,
        renderAgendaList,
        renderHistoryList,
        scheduleListPhotoHydration,
        setStorageLoadedUid: (uid) => { storageLoadedUid = uid; },
        refreshMapAfterStorageLoad,
        showToast
    });
    configureRoutes({
        getRoutes: () => routes,
        setRoutes: (next) => { routes = Array.isArray(next) ? next : []; },
        getActiveRouteId: () => activeRouteId,
        setActiveRouteId: (id) => { activeRouteId = id; },
        getDeliveries: () => deliveries,
        setDeliveries: (next) => { deliveries = Array.isArray(next) ? next : []; },
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        getRouteActive: () => routeActive,
        setRouteActive: (v) => { routeActive = !!v; },
        getRouteMetrics: () => routeMetrics,
        setRouteMetrics: (m) => { routeMetrics = m; },
        migrateTelefones,
        migrateFavorito,
        normalizeDeliveryCoords,
        seedIdCounter,
        closeDeliveryPanel,
        clearActiveStopNotification,
        rebuildMarkers,
        scheduleRouteRefresh,
        updateOptimizeFabVisibility,
        updateProgressAndEstimates,
        renderDeliveriesList,
        updateLastIdDisplay,
        updateDaySummary,
        persistStorageNow,
        showToast,
        showConfirmModal,
        showPromptModal,
        archiveCurrentRouteDay
    });
    configureHistoryStore({
        getDeliveries: () => deliveries,
        setDeliveries: (next) => { deliveries = Array.isArray(next) ? next : []; },
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        setRouteActive: (v) => { routeActive = !!v; },
        setRouteMetrics: (m) => { routeMetrics = m; },
        getRouteMetrics: () => routeMetrics,
        getUserProfile,
        getAuthReady,
        getCurrentUser,
        storageKey,
        showToast,
        showConfirmModal,
        persistStorageNow,
        saveStorage,
        getSequentialId,
        newId,
        seedIdCounter,
        closeTrackingSession,
        trackStatusFor,
        clearRouteOverlay,
        renderDeliveriesList,
        renderRouteSwitcher,
        rebuildMarkers,
        updateLastIdDisplay,
        closeDeliveryPanel,
        clearActiveStopNotification,
        renderAgendaList,
        switchSidebarTab
    });
}
configureExtractedModules();

// ========== HISTÓRICO DE DIAS ==========
// Implementação em src/js/history.js (configureHistory no boot).

// ========== DESFAZER RÁPIDO (SNACKBAR) ==========
// Implementação em src/js/undo-snackbar.js (configureUndoSnackbar no boot).

/** uid cujos dados já estão em memória (evita o 2º loadStorage no initMap). */
let storageLoadedUid = null;

/** Parte de loadStorage que depende do mapa — o initMap só precisa disto se os dados já carregaram. */
function refreshMapAfterStorageLoad() {
    if (map) rebuildMarkers(false);
    updateProgressAndEstimates();
    updateOptimizeFabVisibility();
}

// Sync agenda / findAgendaItem: src/js/agenda-route.js (configureAgendaRoute).

// ========== VALIDAÇÃO DE ENDEREÇO DUPLICADO NA ROTA ==========
// checkAddressDuplicate / clearForm / addDeliveryDirect: src/js/add-delivery-form.js

// Marcadores (CRUD/rebuild/highlight/fit): src/js/map-markers.js
// HUD / stats / focusMap: src/js/route-ui.js (configureRouteUi).
// Fotos do painel: src/js/panel-capture.js · edição painel: src/js/panel-edit-actions.js
// Status entregue/undo/geocode: src/js/delivery-status.js

// ========== NÃO ENTREGUE / VOLTAR DEPOIS ==========
// Helpers: lib/not-delivered-helpers.js · UI: src/js/not-delivered.js (configureNotDelivered).

// ========== BOOT ==========
// initAppUi / DOMContentLoaded / PWA / SW: src/js/app-boot.js (configureAppBoot).
configureAppBoot({
    // O autocomplete só carrega quando o motorista encosta no campo Nome.
    initNameSuggestions: setupNameSuggestionsOnDemand,
    setupNewDeliveryPhoneUI,
    setupAddressDuplicateCheck,
    bindGalleryChrome,
    closeDeliveryPanel,
    adjustPacotes,
    editObservation,
    editPhonesPanel,
    setupPanelSwipe,
    setupFabRailClearance,
    setupPanelPhotoCapture,
    setupUndoSnackbar,
    // Delegação do histórico é ligada quando a aba abre (ensureHistoryUi).
    setupHistoryListDelegation: () => {},
    setupOverflowMenus,
    setupBackupReminderUi,
    setupAutoBackupScheduler,
    getCurrentSelectedDelivery: () => currentSelectedDelivery,
    focusDeliveryInPanel,
    isNativeApp,
    setupScreenLockNotificationBridge,
    setupCameraRestoreHandler,
    showProfileModal,
    bindBackupButtons,
    optimizeRoute,
    updateOptimizeFabVisibility,
    archiveCurrentRouteDay,
    startNewRoute,
    clearRoute,
    toggleSidebar,
    copyFromOtherRoute,
    toggleGps,
    updateGpsButton,
    getGpsEnabled: () => gpsEnabled,
    enableGpsTracking,
    switchSidebarTab: (tab) => { switchSidebarTab(tab); if (tab === 'historico') openHistoryTab(); },
    isGalleryOpen,
    closeGallery,
    nextPhoto,
    prevPhoto,
    getGeocoder: () => geocoder,
    initAuthUi,
    resetVoltarDepoisAlert,
    debounce,
    setRouteFilter: (v) => { routeFilter = v; },
    setAgendaFilter: (v) => { agendaFilter = v; },
    renderDeliveriesList,
    renderAgendaList,
    setupAddDeliveryForm,
    initMap,
    persistStorageNow,
    getAppIcon: () => APP_ICON
});
setupDomContentLoadedBoot();
setupRuntimeBoot();
