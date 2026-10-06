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
import {
    configureNameSuggestions,
    initNameSuggestions
} from './name-suggestions.js';
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
    configureProfile,
    showProfileModal
} from './profile.js';
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
    focusDeliveryInPanel
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
    configureHistory,
    loadHistory,
    getRouteHistory,
    archiveCurrentRouteDay,
    renderHistoryList,
    setupHistoryListDelegation
} from './history.js';
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
import {
    configureBackupUi,
    maybeShowBackupReminder,
    setupBackupReminderUi,
    noteDeliveryCompletedForBackup,
    maybeAutoBackupOnDayChange,
    setupAutoBackupScheduler,
    backupData,
    bindBackupButtons
} from './backup-ui.js';
import {
    configurePhotoStore,
    idbGetPhoto,
    idbDeletePhoto,
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
    configureEditModals,
    showEditDeliveryModal,
    editDeliveryInRoute,
    showEditAgendaModal,
    editAgendaItem
} from './edit-modals.js';
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
function updateSyncBadge() {
    const el = document.getElementById('syncBadge');
    if (el) el.className = 'sync-badge';
}

// Auth local/sessão/logout: src/js/auth.js (configureAuth no boot).
// Captura multi-foto nativa/web: src/js/camera.js (configureCamera no boot).
// Persistência de fotos no item: src/js/item-photos.js (configureItemPhotos no boot).

// Resume UI / restore câmera: src/js/resume-ui.js (configureResumeUi no boot).
// Lock screen / ScreenEvents: src/js/lock-screen.js (configureLockScreen no boot).

// ========== ROTAS MÚLTIPLAS ==========
// Implementação em src/js/routes.js (configureRoutes no boot).

// ========== PERSISTÊNCIA ==========
// Implementação em src/js/persist.js (configurePersist no boot).

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
    configureProfile({
        getUserProfile,
        getCurrentUser,
        accountLabel,
        getPinSizePref: () => pinSizePref,
        getFeedbackVibrateEnabled: () => feedbackVibrateEnabled,
        getFeedbackSoundEnabled: () => feedbackSoundEnabled,
        setPinSizePref,
        setFeedbackPrefs,
        saveStorage,
        backupData,
        logoutUser,
        showToast
    });
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
    configureNameSuggestions({
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
    configureNotDelivered({
        getDeliveries: () => deliveries,
        isActiveStop,
        getFeedbackVibrateEnabled: () => feedbackVibrateEnabled,
        getFeedbackSoundEnabled: () => feedbackSoundEnabled,
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
        setNativeMapZoom: (z) => { nativeMapZoom = z; }
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
        saveDeliveryPhotoToAgenda
    });
    configurePanelEditActions({
        getCurrentSelectedDelivery: () => currentSelectedDelivery,
        showToast,
        showPromptModal,
        saveStorage,
        getMarker,
        updateMarkerIcon,
        renderDeliveriesList,
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
        maybeNotifyVoltarDepois
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
        syncAgendaByDelivery,
        syncActiveStopNotification,
        getAgenda: () => agenda,
        setAgendaItemAt: (idx, item) => { agenda[idx] = item; },
        getGeocoder: () => geocoder,
        renderAgendaList
    });
    configureMapPins({
        getPinSizePref: () => pinSizePref,
        countActivePins: () => deliveries.filter((d) => shouldShowOnMap(d) && !isMutedPin(d)).length
    });
    configureMapMarkers({
        getMap: () => map,
        getUseNativeMap: () => useNativeMap,
        getDeliveries: () => deliveries,
        openDeliveryPanel,
        updateDeliveryStats
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
        scheduleDeliveriesListPhotoRefresh
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
        getTravelMode: () => google.maps.TravelMode.DRIVING
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
        isBgGpsStarted
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
        updateSyncBadge,
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
        loadHistory,
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
    configureHistory({
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
    configureBackupUi({
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
    initNameSuggestions,
    setupNewDeliveryPhoneUI,
    setupAddressDuplicateCheck,
    bindGalleryChrome,
    closeDeliveryPanel,
    adjustPacotes,
    editObservation,
    editPhonesPanel,
    setupPanelSwipe,
    setupPanelPhotoCapture,
    setupUndoSnackbar,
    setupHistoryListDelegation,
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
    switchSidebarTab,
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
