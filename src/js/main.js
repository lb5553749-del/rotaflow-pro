// ============================================================
//  RotaFlow Pro — app do motorista (bundle: npm run build → build/app.js)
//  Código ainda é majoritariamente um script único; módulos extraídos ficam em src/js/.
//  Nada aqui é global: o que outro script precisar (ex.: callback do Maps) vai em `window`.
// ============================================================
import '../../native/bridge.js';
import '../../native/push-sender.js';
import {
    haversineDistance as haversineDistanceShared
} from '../../lib/track-schema.js';
import {
    hasMapCoords,
    normalizeDeliveryCoords
} from '../../lib/routing-helpers.js';
import {
    isMutedPin,
    shortStreetAddress
} from '../../lib/map-helpers.js';
import { routeDayStats } from '../../lib/history-helpers.js';
import { escapeHtml } from '../../lib/html.js';
import { getSequentialId, nextGeneratedId, seedIdCounterFromLists } from '../../lib/ids.js';
import {
    formatPhoneNumber,
    formatPhoneShort,
    normalizeStoredPhone,
    getWhatsAppPhoneDigits,
    getWhatsAppLink,
    getWhatsAppAppLink
} from '../../lib/phone-helpers.js';
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
    initMap,
    PORTO_VELHO_CENTER
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
    refreshRouteKeepOrder,
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
    startNewRoute
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
    PHOTO_MAX_PER_ITEM,
    idbGetPhoto,
    idbDeletePhoto,
    enqueuePhotoOp,
    yieldToUiFrame
} from './photo-store.js';
import {
    configureItemPhotos,
    remainingPhotoSlots,
    isDuplicatePhotoSave,
    markPhotoSaved,
    scheduleOrphanPhotoPrune,
    persistPhotoDataUrl,
    addPhotoDataUrlToItem,
    hydrateAllPhotos,
    ensureItemPhotos,
    applyRestoredCameraPhoto,
    scheduleBackgroundPhotoMigrate,
    scheduleListPhotoHydration,
    releaseInMemoryPhotosExcept,
    itemPhotoScope,
    photoFingerprint
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
    FAIL_REASON_LABELS,
    FAIL_REASON_OPTIONS,
    findActiveDeliveryByAddress
} from '../../lib/list-helpers.js';
import {
    configureBackupStore,
    readBackupMeta
} from './backup-store.js';

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
let tempPhones = [];
// Auth: currentUser / authReady / userProfile em src/js/auth.js (getters).

const APP_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='104' fill='%230f172a'/%3E%3Cpath d='M148 388C148 300 372 330 372 200' fill='none' stroke='%233b82f6' stroke-width='30' stroke-linecap='round' stroke-dasharray='4 46'/%3E%3Ccircle cx='148' cy='388' r='46' fill='%2322c55e'/%3E%3Ccircle cx='372' cy='176' r='46' fill='%23ef4444'/%3E%3C/svg%3E";

function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

function switchSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.sidebar-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab);
    });
}

function closeAllOverflowMenus() {
    document.querySelectorAll('.overflow-wrap.open').forEach(el => {
        el.classList.remove('open');
        const trigger = el.querySelector('.overflow-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.delivery-item.menu-open, .agenda-item.menu-open').forEach(el => {
        el.classList.remove('menu-open');
    });
}

function openOverflowWrap(wrap) {
    if (!wrap) return;
    wrap.classList.add('open');
    const trigger = wrap.querySelector('.overflow-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    const row = wrap.closest('.delivery-item, .agenda-item');
    if (row) row.classList.add('menu-open');
}

function setupOverflowMenus() {
    const routeBtn = document.getElementById('routeToolsMenuBtn');
    const routeWrap = document.getElementById('routeToolsMenuWrap');
    if (routeBtn && routeWrap && !routeBtn.dataset.ready) {
        routeBtn.dataset.ready = '1';
        routeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wasOpen = routeWrap.classList.contains('open');
            closeAllOverflowMenus();
            if (!wasOpen) openOverflowWrap(routeWrap);
        });
        routeWrap.querySelectorAll('.overflow-panel button').forEach(btn => {
            btn.addEventListener('click', () => closeAllOverflowMenus());
        });
    }
    if (!document.documentElement.dataset.overflowOutsideReady) {
        document.documentElement.dataset.overflowOutsideReady = '1';
        // pointerdown: no Android o click sintético às vezes chega depois e fechava o menu na hora
        document.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.overflow-wrap')) return;
            closeAllOverflowMenus();
        }, true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllOverflowMenus();
        });
    }
    if (!document.documentElement.dataset.emptyCtaReady) {
        document.documentElement.dataset.emptyCtaReady = '1';
        document.addEventListener('click', (e) => {
            const cta = e.target.closest('[data-empty-cta]');
            if (!cta) return;
            const tab = cta.dataset.emptyCta;
            if (tab) switchSidebarTab(tab);
        });
    }
}

// ========== UTILITÁRIOS ==========
// Telefone, escape HTML e ids sequenciais vivem em lib/ (testáveis, sem DOM).

async function openExternalUrl(url) {
    if (!url) return false;
    try {
        if (isNativeApp() && window.RotaFlowCap && typeof window.RotaFlowCap.openUrl === 'function') {
            return !!(await window.RotaFlowCap.openUrl(url));
        }
    } catch (_) {
        if (isNativeApp()) return false;
    }
    try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
    } catch (_) {}
    try {
        window.location.href = url;
        return true;
    } catch (_) {
        return false;
    }
}

async function openWhatsAppChat(phone, msg) {
    if (!getWhatsAppPhoneDigits(phone)) return false;
    const webLink = getWhatsAppLink(phone, msg);
    if (webLink && await openExternalUrl(webLink)) return true;
    if (isNativeApp()) {
        const appLink = getWhatsAppAppLink(phone, msg);
        if (appLink && await openExternalUrl(appLink)) return true;
    }
    return false;
}

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

function haversineDistance(lat1, lon1, lat2, lon2) {
    return haversineDistanceShared(lat1, lon1, lat2, lon2);
}

// ========== RASTREIO DO CLIENTE ==========
// Implementação em src/js/tracking.js (configureTracking no boot).

// ========== MIGRAÇÃO E PERSISTÊNCIA ==========
function migrateTelefones(obj) {
    if (!obj) return;
    if (obj.telefones && Array.isArray(obj.telefones) && obj.telefones.length > 0 && typeof obj.telefones[0] === 'string') {
        obj.telefones = obj.telefones.map(num => ({ numero: num, label: '' }));
    }
    if (!obj.telefones) obj.telefones = [];
    if (obj.telefone && typeof obj.telefone === 'string') {
        obj.telefones.push({ numero: obj.telefone, label: '' });
        delete obj.telefone;
    }
    obj.telefones.forEach(p => { p.numero = normalizeStoredPhone(p.numero); });
    return obj;
}
function migrateFavorito(obj) {
    if (obj.favorito === undefined) obj.favorito = false;
    return obj;
}

configurePhotoStore({ getUid: currentUid });
configureBackupStore({ getUid: currentUid, storageKey, isNativeApp });
function updateSyncBadge() {
    const el = document.getElementById('syncBadge');
    if (el) el.className = 'sync-badge';
}

// Auth local/sessão/logout: src/js/auth.js (configureAuth no boot).
// Captura multi-foto nativa/web: src/js/camera.js (configureCamera no boot).
// Persistência de fotos no item: src/js/item-photos.js (configureItemPhotos no boot).

let cameraRestoreHandlerReady = false;

/** Evita tela preta ao voltar do 2º plano (WebView transparente + Maps nativo). */
let recoverUiResumeTimer = null;
let recoverUiLastAt = 0;
function recoverUiAfterResume() {
    // Debounce: resume + appStateChange + visibility disparam em sequência.
    const now = Date.now();
    if (now - recoverUiLastAt < 80) {
        clearTimeout(recoverUiResumeTimer);
        recoverUiResumeTimer = setTimeout(recoverUiAfterResumeNow, 100);
        return;
    }
    recoverUiAfterResumeNow();
}
function recoverUiAfterResumeNow() {
    recoverUiLastAt = Date.now();
    try {
        document.documentElement.style.visibility = 'visible';
        document.body.style.visibility = 'visible';
        document.body.style.opacity = '1';
        const app = document.querySelector('.app-container');
        if (app) {
            app.style.visibility = 'visible';
            app.style.opacity = '1';
            app.style.display = '';
        }
        // Força reflow — WebView às vezes fica com frame preto após resume
        void document.body.offsetHeight;
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.style.visibility = 'visible';
            mapEl.style.opacity = '1';
            mapEl.style.display = 'block';
        }
        if (useNativeMap && nativeGoogleMap && typeof nativeGoogleMap.setCamera === 'function') {
            const center = (map && typeof map.getCenter === 'function') ? map.getCenter() : null;
            const zoom = (map && typeof map.getZoom === 'function') ? map.getZoom() : nativeMapZoom;
            const c = center
                ? { lat: typeof center.lat === 'function' ? center.lat() : center.lat, lng: typeof center.lng === 'function' ? center.lng() : center.lng }
                : null;
            if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
                nativeGoogleMap.setCamera({
                    coordinate: c,
                    zoom: zoom || nativeMapZoom || 12,
                    animate: false
                }).catch(() => {});
            }
        } else if (map && typeof google !== 'undefined' && google.maps && typeof google.maps.event?.trigger === 'function') {
            try { google.maps.event.trigger(map, 'resize'); } catch (_) {}
        }
        requestAnimationFrame(() => {
            try { window.dispatchEvent(new Event('resize')); } catch (_) {}
            // Segundo passe — Home/lock/câmera → mapa às vezes precisa de 2 frames
            setTimeout(() => {
                try {
                    void document.body.offsetHeight;
                    if (map && typeof google !== 'undefined' && google.maps?.event?.trigger) {
                        google.maps.event.trigger(map, 'resize');
                    }
                    window.dispatchEvent(new Event('resize'));
                } catch (_) {}
            }, 180);
        });
    } catch (e) {
        console.warn('recoverUiAfterResume', e);
    }
}

async function setupCameraRestoreHandler() {
    if (cameraRestoreHandlerReady) return;
    if (!isNativeApp() || !window.RotaFlowCap?.App?.addListener) return;
    cameraRestoreHandlerReady = true;
    try {
        await window.RotaFlowCap.App.addListener('appRestoredResult', async (event) => {
            try {
                recoverUiAfterResume();
                if (!event || event.pluginId !== 'Camera' || !event.success) return;
                await enqueuePhotoOp(() => applyRestoredCameraPhoto(event.data));
                recoverUiAfterResume();
            } catch (e) {
                console.warn('appRestoredResult', e);
            }
        });
        await window.RotaFlowCap.App.addListener('resume', () => {
            recoverUiAfterResume();
            setTimeout(recoverUiAfterResume, 200);
            if (gpsEnabled) {
                startBackgroundGpsWatch();
                syncBackgroundGpsTargets();
            }
        });
        await window.RotaFlowCap.App.addListener('appStateChange', (state) => {
            if (state && state.isActive) {
                recoverUiAfterResume();
                if (gpsEnabled) {
                    startBackgroundGpsWatch();
                    syncBackgroundGpsTargets();
                }
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') recoverUiAfterResume();
        });
    } catch (e) {
        console.warn('setupCameraRestoreHandler', e);
        cameraRestoreHandlerReady = false;
    }
}

// ========== ROTAS MÚLTIPLAS ==========
// Implementação em src/js/routes.js (configureRoutes no boot).

// ========== PERSISTÊNCIA ==========
// Implementação em src/js/persist.js (configurePersist no boot).

function configureExtractedModules() {
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
        showPromptModal
    });
    configureHistory({
        getDeliveries: () => deliveries,
        setDeliveries: (next) => { deliveries = Array.isArray(next) ? next : []; },
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        setRouteActive: (v) => { routeActive = !!v; },
        setRouteMetrics: (m) => { routeMetrics = m; },
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
let undoSnackbarTimer = null;
let undoSnackbarTargetId = null;

function hideUndoSnackbar() {
    clearTimeout(undoSnackbarTimer);
    undoSnackbarTimer = null;
    undoSnackbarTargetId = null;
    const el = document.getElementById('undoSnackbar');
    if (el) el.hidden = true;
}

function showUndoSnackbar(deliveryId, message) {
    const el = document.getElementById('undoSnackbar');
    const text = document.getElementById('undoSnackbarText');
    if (!el || !text) return;
    undoSnackbarTargetId = deliveryId;
    text.textContent = message;
    el.hidden = false;
    clearTimeout(undoSnackbarTimer);
    undoSnackbarTimer = setTimeout(hideUndoSnackbar, 6000);
}

function setupUndoSnackbar() {
    document.getElementById('undoSnackbarBtn')?.addEventListener('click', () => {
        if (undoSnackbarTargetId == null) return;
        const id = undoSnackbarTargetId;
        hideUndoSnackbar();
        undoDeliveryStatus(id, { keepPanel: true, keepMinimized: true });
    });
}

/** uid cujos dados já estão em memória (evita o 2º loadStorage no initMap). */
let storageLoadedUid = null;

/** Parte de loadStorage que depende do mapa — o initMap só precisa disto se os dados já carregaram. */
function refreshMapAfterStorageLoad() {
    if (map) rebuildMarkers(false);
    updateProgressAndEstimates();
    updateOptimizeFabVisibility();
}

function findAgendaItemForDelivery(delivery) {
    if (!delivery || !delivery.endereco) return null;
    const key = String(delivery.endereco).toLowerCase();
    return agenda.find(item => String(item.endereco || '').toLowerCase() === key) || null;
}

function syncFavoritoToAgenda(delivery) {
    const agendaItem = findAgendaItemForDelivery(delivery);
    if (agendaItem && agendaItem.favorito !== delivery.favorito) {
        agendaItem.favorito = delivery.favorito;
        saveStorage();
        renderAgendaList();
        return true;
    }
    return false;
}
function syncAgendaByDelivery(delivery) {
    const agendaItem = findAgendaItemForDelivery(delivery);
    if (agendaItem) {
        let changed = false;
        const str1 = JSON.stringify(delivery.telefones || []);
        const str2 = JSON.stringify(agendaItem.telefones || []);
        if (str1 !== str2) {
            agendaItem.telefones = delivery.telefones || [];
            changed = true;
        }
        if (agendaItem.favorito !== delivery.favorito) {
            agendaItem.favorito = delivery.favorito;
            changed = true;
        }
        if (changed) {
            saveStorage();
            renderAgendaList();
            showToast("Agenda atualizada");
        }
    }
}

// ========== VALIDAÇÃO DE ENDEREÇO DUPLICADO NA ROTA ==========
let duplicateCheckTimer = null;
function checkAddressDuplicate() {
    const addressInput = document.getElementById('address');
    const warningDiv = document.getElementById('addressWarning');
    const warningText = document.getElementById('addressWarningText');
    const address = addressInput.value.trim().toLowerCase();
    if (!address) {
        warningDiv.classList.remove('show');
        addressInput.classList.remove('duplicate');
        return;
    }
    const found = findActiveRouteByAddress(address);
    if (found) {
        warningText.textContent = `Este endereço já está na rota (ID ${found.sequentialId})`;
        warningDiv.classList.add('show');
        addressInput.classList.add('duplicate');
        warningDiv.onclick = () => {
            document.getElementById('customerName').value = found.nome;
            document.getElementById('address').value = found.endereco;
            tempPhones = found.telefones || [];
            renderTempPhones();
            document.getElementById('pacotes').value = found.pacotes || 1;
            warningDiv.classList.remove('show');
            addressInput.classList.remove('duplicate');
            showToast(`Dados da entrega ${found.sequentialId} preenchidos`);
        };
    } else {
        warningDiv.classList.remove('show');
        addressInput.classList.remove('duplicate');
        warningDiv.onclick = null;
    }
}

// Marcadores (CRUD/rebuild/highlight/fit): src/js/map-markers.js

function updateDeliveryStats() {
    const total = deliveries.length;
    const badge = document.getElementById('deliveryCountBadge');
    if (badge) badge.innerHTML = total;
    updateProgressAndEstimates();
    updateOptimizeFabVisibility();
}

/** ETA da parada: preferir dados da otimização; senão heurística GPS→parada. */
function estimateStopEta(stop) {
    if (!stop || !isActiveStop(stop)) return null;
    if (typeof stop.etaSeconds === 'number' && stop.etaSeconds >= 0
        && routeActive && routeMetrics
        && routeMetrics.signature === routeSignature(pendingStops())) {
        return { seconds: stop.etaSeconds, source: 'route' };
    }
    if (typeof stop.legSeconds === 'number' && stop.legSeconds >= 0
        && routeActive && routeMetrics
        && routeMetrics.signature === routeSignature(pendingStops())) {
        return { seconds: stop.legSeconds, source: 'leg' };
    }
    if (startPoint && hasMapCoords(stop)) {
        const km = haversineDistance(startPoint.lat, startPoint.lng, Number(stop.lat), Number(stop.lng));
        if (Number.isFinite(km)) {
            // ~25 km/h média urbana — aproximação honesta, não Directions.
            const seconds = Math.max(60, Math.round((km / 25) * 3600));
            return { seconds, source: 'approx' };
        }
    }
    return null;
}

function isMapMenuOpen() {
    const app = document.getElementById('appContainer');
    return !!(app && !app.classList.contains('sidebar-hidden'));
}

function hideMapSelectedChip() {
    const chip = document.getElementById('mapNextChip');
    if (!chip) return;
    chip.hidden = true;
    chip.classList.remove('is-visible');
    chip._selectedId = null;
}

/** HUD da parada selecionada no mapa — só aparece com pin/seleção ativa, some com o menu. */
function updateMapNextChip() {
    const chip = document.getElementById('mapNextChip');
    const nameEl = document.getElementById('mapNextChipName');
    const clientEl = document.getElementById('mapNextChipClient');
    const labelEl = document.getElementById('mapNextChipLabel');
    const etaEl = document.getElementById('mapNextChipEta');
    if (!chip || !nameEl) return;

    const selected = currentSelectedDelivery;
    const panel = document.getElementById('deliveryPanel');
    const panelOpen = !!(panel && panel.classList.contains('open') && selected);

    if (!selected || !panelOpen || isMapMenuOpen()) {
        hideMapSelectedChip();
        return;
    }

    // ID + nome em destaque; rua quieta (3ª linha)
    const idText = String(selected.sequentialId || '—');
    const nome = String(selected.nome || '').trim() || 'Cliente';
    const street = shortStreetAddress(selected.endereco);
    nameEl.textContent = idText;
    if (clientEl) clientEl.textContent = nome;
    if (labelEl) labelEl.textContent = street !== '—' ? street : 'Endereço não informado';

    const eta = estimateStopEta(selected);
    if (etaEl) {
        if (eta) {
            const prefix = eta.source === 'approx' ? '~' : '';
            etaEl.textContent = prefix + formatDuration(eta.seconds);
            etaEl.hidden = false;
            etaEl.removeAttribute('hidden');
        } else {
            etaEl.textContent = '';
            etaEl.hidden = true;
        }
    }

    chip.hidden = false;
    chip.classList.add('is-visible');
    chip._selectedId = selected.id;
    chip.title = [idText, nome, street !== '—' ? street : ''].filter(Boolean).join(' · ')
        || selected.endereco
        || 'Parada selecionada';
    chip.setAttribute('aria-label', `Focar mapa na parada ${idText}, ${nome}${street !== '—' ? `, ${street}` : ''}`);
}

function updateDaySummary() {
    const root = document.getElementById('daySummary');
    if (!root) return;
    const stats = routeDayStats(deliveries);
    const elE = document.getElementById('daySumEntregue');
    const elF = document.getElementById('daySumFalhou');
    const elKm = document.getElementById('daySumKm');
    const kmItem = document.getElementById('daySumKmItem');
    if (elE) elE.textContent = String(stats.entregue);
    if (elF) elF.textContent = String(stats.falhou);

    let kmText = '—';
    const pending = pendingStops();
    if (routeActive && routeMetrics && routeMetrics.signature === routeSignature(pending)
        && typeof routeMetrics.meters === 'number' && routeMetrics.meters >= 0) {
        kmText = formatKm(routeMetrics.meters) + ' rest.';
    }
    if (elKm) elKm.textContent = kmText;
    if (kmItem) kmItem.title = kmText === '—'
        ? 'Quilometragem disponível após otimizar a rota'
        : 'Distância restante da rota otimizada';

    root.hidden = deliveries.length === 0;
    renderRouteSwitcher();
}

function updateProgressAndEstimates() {
    updateDaySummary();
    updateMapNextChip();
    maybeShowBackupReminder();
}

function updateLastIdDisplay(deliveryId) {
    const container = document.getElementById('lastIdContainer');
    const valueSpan = document.getElementById('lastIdValue');
    if (!container || !valueSpan) return;
    if (deliveryId) {
        valueSpan.innerText = deliveryId;
        container.classList.add('show');
        container.style.display = '';
    } else {
        valueSpan.innerText = '—';
        container.classList.remove('show');
        container.style.display = '';
    }
}

// ========== LIMPEZA DO FORMULÁRIO ==========
function clearForm() {
    document.getElementById("customerName").value = "";
    document.getElementById("address").value = "";
    document.getElementById("newPhoneInput").value = "";
    document.getElementById("newPhoneLabel").value = "";
    tempPhones = [];
    renderTempPhones();
    document.getElementById("pacotes").value = "1";
    document.getElementById("saveToAgendaCheckbox").checked = false;
    document.getElementById("nameSuggestions").style.display = 'none';
    document.getElementById('addressWarning').classList.remove('show');
    document.getElementById('address').classList.remove('duplicate');
}

// ========== PAINEL INFERIOR ==========
/** Centra o mapa na entrega (JS Maps ou facade nativa Capacitor). */
function focusMapOnDelivery(delivery, opts = {}) {
    if (!map || !delivery || !hasMapCoords(delivery)) return;
    const lat = Number(delivery.lat);
    const lng = Number(delivery.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    const targetZoom = Number.isFinite(opts.zoom) ? opts.zoom : 16;
    try {
        if (useNativeMap && nativeGoogleMap && typeof nativeGoogleMap.setCamera === 'function') {
            const cur = typeof map.getZoom === 'function' ? map.getZoom() : null;
            const zoom = (cur == null || cur < targetZoom - 0.35 || opts.forceZoom)
                ? targetZoom
                : cur;
            nativeMapZoom = zoom;
            nativeGoogleMap.setCamera({
                coordinate: pos,
                zoom,
                animate: opts.animate !== false
            }).catch((e) => console.warn('focusMapOnDelivery native', e));
            return;
        }
        map.panTo(pos);
        const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
        if (z == null || z < targetZoom - 0.35 || opts.forceZoom) {
            map.setZoom(targetZoom);
        }
    } catch (e) {
        console.warn('focusMapOnDelivery', e);
    }
}

// Painel inferior (open/actions/fotos/swipe/nav):
// lib/panel-helpers.js · src/js/delivery-panel.js (configureDeliveryPanel).

async function copyDeliveryPhotoIndexToAgenda(agendaItem, delivery, idx) {
    await ensureItemPhotos(delivery);
    await ensureItemPhotos(agendaItem);
    if (!Array.isArray(delivery.photos) || !delivery.photos[idx]) {
        return { added: false, reason: 'missing' };
    }
    if (!Array.isArray(agendaItem.photos)) agendaItem.photos = [];
    if (!Array.isArray(agendaItem.photoIds)) agendaItem.photoIds = [];

    const srcId = Array.isArray(delivery.photoIds) ? delivery.photoIds[idx] : null;
    if (srcId && agendaItem.photoIds.includes(srcId)) {
        return { added: false, reason: 'dup' };
    }

    const dataUrl = delivery.photos[idx];
    // Nova cópia no IndexedDB para a agenda não depender da foto da entrega.
    const newId = await persistPhotoDataUrl(dataUrl);
    agendaItem.photos.push(dataUrl);
    agendaItem.photoIds.push(newId);
    return { added: true, photoId: newId };
}

/**
 * Salva foto da entrega no cliente correspondente da agenda (match por endereço).
 * @param {object} delivery
 * @param {number|null} photoIndex índice específico; null = última foto
 */
async function saveDeliveryPhotoToAgenda(delivery, photoIndex = null) {
    if (!delivery) {
        showToast('Selecione uma entrega no mapa', true);
        return false;
    }
    await ensureItemPhotos(delivery);
    const count = deliveryPhotoCount(delivery);
    if (!count) {
        showToast('Nenhuma foto nesta entrega', true);
        return false;
    }

    let agendaItem = findAgendaItemForDelivery(delivery);
    if (!agendaItem) {
        // Fluxo existente: cria o cliente na agenda com as fotos da entrega.
        return !!(await saveToAgenda(delivery, true));
    }

    const idx = photoIndex == null ? (delivery.photos.length - 1) : photoIndex;
    if (idx < 0 || idx >= delivery.photos.length) {
        showToast('Foto não encontrada', true);
        return false;
    }

    const result = await copyDeliveryPhotoIndexToAgenda(agendaItem, delivery, idx);
    if (!result.added) {
        showToast(result.reason === 'dup' ? 'Esta foto já está na agenda' : 'Não foi possível salvar a foto', true);
        return false;
    }

    if (!delivery.savedToAgenda) delivery.savedToAgenda = true;
    saveStorage();
    renderAgendaList();
    renderDeliveriesList();
    showToast('Foto salva na agenda');
    return true;
}

/** Atualiza só a lista de entregas depois (badge de fotos) sem travar o thumb. */
function scheduleDeliveriesListPhotoRefresh() {
    const run = () => renderDeliveriesList();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 700 });
    else setTimeout(run, 120);
}

async function addPhotoDataUrlsToDelivery(delivery, dataUrls, opts = {}) {
    if (!delivery || !dataUrls || !dataUrls.length) return 0;
    const { hadOptimistic = false, silent = false } = opts;
    let saved = 0;
    try {
        for (const dataUrl of dataUrls) {
            const id = await addPhotoDataUrlToItem(delivery, dataUrl);
            if (!id) continue; // duplicata (onPhoto + lote / 2º shutter)
            saved += 1;
            // Persistência por foto: sobrevive a kill/troca de cliente a meio do lote.
            persistStorageNow();
            refreshPanelPhotos(delivery);
        }
        if (saved) {
            scheduleDeliveriesListPhotoRefresh();
            if (!silent) {
                showToast(saved > 1 ? `${saved} fotos salvas nesta entrega` : 'Foto salva nesta entrega');
            }
        } else if (hadOptimistic && !silent) {
            refreshPanelPhotos(delivery);
        }
        return saved;
    } catch (e) {
        if (hadOptimistic || saved) refreshPanelPhotos(delivery);
        if (saved) {
            scheduleDeliveriesListPhotoRefresh();
            if (!silent) showToast(`${saved} foto(s) salvas; algumas falharam`, true);
            return saved;
        }
        if (String(e?.message || e) === 'photo-limit') {
            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
        } else if (!silent) {
            showToast('Não foi possível adicionar a foto', true);
        }
        return saved;
    }
}

async function capturePhotoForSelectedDelivery(mode = 'camera') {
    const delivery = currentSelectedDelivery;
    if (!delivery) {
        showToast('Selecione uma entrega no mapa', true);
        return;
    }
    const slots = remainingPhotoSlots(delivery);
    if (slots <= 0) {
        showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
        return;
    }
    const cameraInput = document.getElementById('panelCameraInput');
    const galleryInput = document.getElementById('panelGalleryInput');
    const fileInput = mode === 'gallery' ? galleryInput : cameraInput;
    let optimisticEl = null;
    let optimisticUrl = null;
    let savedIncremental = 0;
    let lastErr = null;
    const urls = await pickPhotoDataUrls(mode, {
        fileInput,
        multiple: mode === 'gallery',
        maxPhotos: slots,
        pendingTarget: { kind: 'delivery', sequentialId: delivery.sequentialId },
        onPreview: (previewUrl) => {
            if (!previewUrl || optimisticEl) return;
            optimisticUrl = previewUrl;
            optimisticEl = showOptimisticPanelPhoto(delivery, previewUrl);
        },
        onPhoto: async (dataUrl, n, total) => {
            try {
                const id = await addPhotoDataUrlToItem(delivery, dataUrl);
                if (!id) return; // já gravada (dedupe)
                savedIncremental += 1;
                persistStorageNow();
                if (optimisticEl) {
                    try { optimisticEl.remove(); } catch (_) {}
                    optimisticEl = null;
                }
                refreshPanelPhotos(delivery);
                if (total && total > 1) {
                    showToast(`A guardar fotos… ${n}/${total}`);
                }
            } catch (e) {
                lastErr = e;
                if (String(e?.message || e) === 'photo-limit') throw e;
                console.warn('incremental photo save', e);
            }
        }
    });
    // Segurança: lote final com dedupe — cobre corrida onPhoto vs Concluir e caminhos sem onPhoto.
    let batchSaved = 0;
    if (urls.length) {
        batchSaved = await addPhotoDataUrlsToDelivery(delivery, urls, {
            hadOptimistic: !!optimisticEl,
            silent: savedIncremental > 0
        }) || 0;
    }
    const totalSaved = savedIncremental + batchSaved;
    if (totalSaved > 0) {
        scheduleDeliveriesListPhotoRefresh();
        if (savedIncremental > 0) {
            showToast(totalSaved > 1 ? `${totalSaved} fotos salvas nesta entrega` : 'Foto salva nesta entrega');
        }
    } else if (optimisticEl) {
        optimisticEl.remove();
        updatePanelMiniPhotoUi(delivery);
        if (lastErr && String(lastErr?.message || lastErr) === 'photo-limit') {
            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
        }
    }
    if (optimisticUrl && String(optimisticUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(optimisticUrl); } catch (_) {}
    }
}

function setupPanelPhotoCapture() {
    const cameraBtn = document.getElementById('panelCameraBtn');
    const galleryBtn = document.getElementById('panelGalleryBtn');
    const saveAgendaBtn = document.getElementById('panelSavePhotoAgendaBtn');
    if (!cameraBtn || cameraBtn.dataset.ready) return;
    cameraBtn.dataset.ready = '1';

    cameraBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await capturePhotoForSelectedDelivery('camera');
    });
    galleryBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await capturePhotoForSelectedDelivery('gallery');
    });
    if (saveAgendaBtn) {
        saveAgendaBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await saveDeliveryPhotoToAgenda(currentSelectedDelivery, null);
        });
    }
}

// ========== INFO NA TELA DE BLOQUEIO (nativo, sem alerta) ==========
let lockScreenBridgeReady = false;

function getScreenEvents() {
    return window.RotaFlowCap?.ScreenEvents || null;
}

function lockScreenStopPayload(delivery) {
    if (!delivery || delivery.status === 'entregue' || delivery.status === 'falhou') return null;
    const idLabel = String(delivery.sequentialId || '—');
    const qty = Math.max(1, Number(delivery.pacotes) || 1);
    const qtyLabel = qty === 1 ? '1 pacote' : `${qty} pacotes`;
    const street = shortStreetAddress(delivery.endereco);
    const nome = String(delivery.nome || '').trim();
    const body = nome ? `${nome} · ${street}` : street;
    return {
        title: `Indo para ${idLabel} · ${qtyLabel}`,
        body: body || 'Entrega em andamento'
    };
}

async function ensureLockScreenPermission() {
    if (!isNativeApp()) return false;
    // Reusa o plugin de notificações só para pedir POST_NOTIFICATIONS uma vez
    const LN = window.RotaFlowCap?.LocalNotifications;
    if (!LN) return true;
    try {
        let perm = await LN.checkPermissions();
        if (perm?.display !== 'granted') {
            perm = await LN.requestPermissions();
        }
        return perm?.display === 'granted';
    } catch (_) {
        return false;
    }
}

async function clearActiveStopNotification() {
    if (!isNativeApp()) return;
    const SE = getScreenEvents();
    if (!SE?.clearActiveStop) return;
    try {
        await SE.clearActiveStop();
    } catch (e) {
        console.warn('clearActiveStop', e);
    }
}

/** Memoriza no nativo; a notificação só aparece em SCREEN_OFF. */
async function syncActiveStopNotification(delivery) {
    if (!isNativeApp()) return;
    const SE = getScreenEvents();
    if (!SE?.setActiveStop) return;
    const payload = lockScreenStopPayload(delivery);
    try {
        if (!payload) {
            await SE.clearActiveStop();
            return;
        }
        await SE.setActiveStop(payload);
    } catch (e) {
        console.warn('setActiveStop', e);
    }
}

async function setupScreenLockNotificationBridge() {
    if (!isNativeApp() || lockScreenBridgeReady) return;
    const SE = getScreenEvents();
    if (!SE) return;
    lockScreenBridgeReady = true;
    try {
        await SE.ping?.();
    } catch (e) {
        console.warn('ScreenEvents ping', e);
    }
    await ensureLockScreenPermission();
    // Se já houver entrega selecionada, sincroniza
    if (currentSelectedDelivery) {
        syncActiveStopNotification(currentSelectedDelivery);
    }
}

function adjustPacotes(delta) {
    if (!currentSelectedDelivery) return;
    const newValue = (currentSelectedDelivery.pacotes || 1) + delta;
    if (newValue < 1) return;
    currentSelectedDelivery.pacotes = newValue;
    const pacotesSpan = document.getElementById('panelPacotesValue');
    pacotesSpan.innerText = newValue;
    if (newValue >= 2) {
        pacotesSpan.classList.add('pacotes-highlight');
    } else {
        pacotesSpan.classList.remove('pacotes-highlight');
    }
    const miniQty = document.getElementById('panelMiniQty');
    if (miniQty) {
        miniQty.textContent = String(newValue);
        miniQty.classList.toggle('pacotes-highlight', newValue >= 2);
    }
    const panel = document.getElementById('deliveryPanel');
    if (newValue >= 2) {
        panel.classList.add('red-bg');
    } else {
        panel.classList.remove('red-bg');
    }
    saveStorage();
    const marker = getMarker(currentSelectedDelivery.sequentialId);
    if (marker) {
        updateMarkerIcon(marker, currentSelectedDelivery);
    }
    renderDeliveriesList();
    syncActiveStopNotification(currentSelectedDelivery);
    showToast(`Quantidade de pacotes atualizada para ${newValue}`);
}

async function editObservation() {
    if (!currentSelectedDelivery) return;
    const currentObs = currentSelectedDelivery.notes || '';
    const newObs = await showPromptModal({
        title: 'Observação',
        message: 'Informe a observação desta entrega:',
        defaultValue: currentObs,
        placeholder: 'Ex.: deixar com o porteiro',
        multiline: true
    });
    if (newObs !== null) {
        currentSelectedDelivery.notes = newObs.trim();
        document.getElementById('panelObsText').innerText = currentSelectedDelivery.notes || 'Nenhuma observação';
        saveStorage();
        renderDeliveriesList();
        showToast("Observação salva com sucesso");
    }
}

function editPhonesPanel() {
    if (!currentSelectedDelivery) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const phones = currentSelectedDelivery.telefones || [];
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:480px;">
            <h3 class="modal-title">Editar telefones</h3>
            <div class="modal-form-group">
                <label class="modal-field-label">Telefones</label>
                <div id="phoneListModal" class="modal-phone-list"></div>
                <div class="modal-add-phone">
                    <input type="text" id="newPhoneLabelModal" placeholder="Identificação">
                    <input type="tel" id="newPhoneModal" placeholder="(69) 99999-9999">
                    <button type="button" id="addPhoneModalBtn" class="modal-add-phone-btn" aria-label="Adicionar telefone"><i class="fas fa-plus"></i></button>
                </div>
            </div>
            <div class="modal-buttons">
                <button type="button" class="modal-confirm" id="savePhonesModal">Salvar</button>
                <button type="button" class="modal-cancel" id="cancelPhonesModal">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    function refreshPhoneList() {
        const list = overlay.querySelector('#phoneListModal');
        list.innerHTML = phones.map((p, i) =>
            `<div class="modal-phone-row">
                <input type="text" class="edit-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Identificação">
                <input type="tel" class="edit-phone-number" data-index="${i}" value="${escapeHtml(p.numero || '')}" placeholder="Número">
                <button type="button" class="remove-phone-modal modal-phone-remove" data-index="${i}" aria-label="Remover telefone"><i class="fas fa-times"></i></button>
            </div>`
        ).join('');
        list.querySelectorAll('.remove-phone-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                phones.splice(idx, 1);
                refreshPhoneList();
            });
        });
        list.querySelectorAll('.edit-phone-label').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (phones[idx]) phones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-phone-number').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (phones[idx]) phones[idx].numero = this.value;
            });
        });
    }
    refreshPhoneList();

    overlay.querySelector('#addPhoneModalBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#newPhoneLabelModal');
        const numInput = overlay.querySelector('#newPhoneModal');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número de telefone inválido", true);
        phones.push({ numero: formatted, label: label || '' });
        refreshPhoneList();
        labelInput.value = '';
        numInput.value = '';
    });

    overlay.querySelector('#savePhonesModal').addEventListener('click', () => {
        const list = overlay.querySelector('#phoneListModal');
        const labels = list.querySelectorAll('.edit-phone-label');
        const numbers = list.querySelectorAll('.edit-phone-number');
        const newPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    newPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        currentSelectedDelivery.telefones = newPhones;
        saveStorage();
        const phoneContainer = document.getElementById('panelPhone');
        if (newPhones.length) {
            phoneContainer.innerHTML = newPhones.map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
        } else {
            phoneContainer.innerText = 'Não informado';
        }
        renderDeliveriesList();
        syncAgendaByDelivery(currentSelectedDelivery);
        showToast("Telefones atualizados");
        overlay.remove();
    });
    overlay.querySelector('#cancelPhonesModal').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#newPhoneModal').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#addPhoneModalBtn').click();
    });
}

// ========== WHATSAPP ==========

function companyDisplayName() {
    const profile = getUserProfile();
    const name = profile && String(profile.empresa || '').trim();
    return name || EMPRESA_PADRAO;
}

function buildDeliveryWhatsAppMessage(delivery, opts = {}) {
    const trackUrl = opts.trackUrl || '';
    const nome = opts.nome != null ? opts.nome : (delivery.nome || 'cliente');
    const empresa = opts.empresa != null ? opts.empresa : companyDisplayName();
    const profile = getUserProfile();
    const template = (profile && profile.mensagemPadrao) || MENSAGEM_WHATSAPP_PADRAO;
    let msg = template
        .replace(/{nome}/g, nome)
        .replace(/{id}/g, delivery.sequentialId)
        .replace(/{pacotes}/g, delivery.pacotes || 1)
        .replace(/{endereco}/g, delivery.endereco || '')
        .replace(/{empresa}/g, empresa)
        .replace(/{obs}/g, delivery.notes ? `📝 Obs: ${delivery.notes}\n` : '')
        .replace(/{km}/g, '')
        .replace(/{min}/g, '')
        .replace(/{link}/g, trackUrl || '');
    // Sem km/ETA na mensagem ao cliente.
    msg = msg
        .replace(/\n?⏱\s*Faltam cerca de[^\n]*/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (trackUrl && !msg.includes(trackUrl)) {
        msg += `\n${trackUrl}`;
    }
    return msg;
}

async function sendWhatsApp(delivery) {
    if (!delivery.telefones || delivery.telefones.length === 0) {
        return showToast("Nenhum telefone cadastrado para esta entrega", true);
    }
    let phoneToUse = delivery.telefones[0];
    if (delivery.telefones.length > 1) {
        const choice = await showChoiceModal({
            title: 'WhatsApp',
            message: 'Selecione o número para enviar a mensagem:',
            options: delivery.telefones.map(p => ({
                label: (p.label ? p.label + ' · ' : '') + formatPhoneShort(p.numero),
                value: p,
                icon: 'fab fa-whatsapp',
                iconColor: '#25D366'
            }))
        });
        if (!choice) return;
        phoneToUse = choice;
    }
    const trackUrl = prepareTrackingUrl(delivery) || '';
    if (trackUrl) publishTrackingSession(delivery);
    const msg = buildDeliveryWhatsAppMessage(delivery, {
        nome: phoneToUse.label || delivery.nome,
        trackUrl
    });
    if (trackUrl && (!gpsEnabled || !startPoint)) {
        showToast('Link no WhatsApp. Ligue o GPS para o cliente ver você no mapa');
    }
    if (!getWhatsAppPhoneDigits(phoneToUse.numero)) {
        showToast("Número de telefone inválido", true);
        return;
    }
    const opened = await openWhatsAppChat(phoneToUse.numero, msg);
    if (!opened) showToast('Não foi possível abrir o WhatsApp', true);
}

// ========== NOVA ENTREGA - TELEFONES ==========
function renderTempPhones() {
    const container = document.getElementById('phoneTagsContainer');
    container.innerHTML = tempPhones.map(p => {
        const label = p.label ? p.label + ': ' : '';
        return `<span class="phone-tag"><span class="phone-label">${escapeHtml(label)}</span>${escapeHtml(formatPhoneShort(p.numero))} <span class="remove-phone" data-phone="${escapeHtml(p.numero)}">&times;</span></span>`;
    }).join('');
    container.querySelectorAll('.remove-phone').forEach(el => {
        el.addEventListener('click', () => {
            const phone = el.dataset.phone;
            tempPhones = tempPhones.filter(p => p.numero !== phone);
            renderTempPhones();
        });
    });
}

// Lista de entregas: src/js/deliveries-list.js (configureDeliveriesList no boot).

// Modais de edição (entrega/agenda): src/js/edit-modals.js (configureEditModals no boot).
// Helpers puros: lib/edit-helpers.js.

// ========== ADICIONAR DA AGENDA PARA A ROTA (PERMITIDO) ==========
function findActiveRouteByAddress(endereco) {
    return findActiveDeliveryByAddress(deliveries, endereco);
}

function addAgendaToRoute(item) {
    const already = findActiveRouteByAddress(item.endereco);
    if (already) {
        showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
        return;
    }

    const finish = async (lat, lng) => {
        // Cópia própria das fotos — apagar na rota não apaga na agenda.
        const cloned = await cloneItemPhotosForCopy(item);
        const seqId = getSequentialId(nextSequenceNumber);
        deliveries.push({
            id: newId(),
            sequentialId: seqId,
            nome: item.nome,
            endereco: item.endereco,
            telefones: item.telefones || [],
            pacotes: item.pacotes || 1,
            status: "pendente",
            lat,
            lng,
            savedToAgenda: true,
            photos: cloned.photos,
            photoIds: cloned.photoIds,
            notes: item.notes || '',
            favorito: item.favorito || false
        });
        nextSequenceNumber++;
        persistStorageNow();
        renderDeliveriesList();
        renderAgendaList();
        upsertMarker(deliveries[deliveries.length - 1]);
        updateLastIdDisplay(seqId);
        clearRouteOverlay();
        updateProgressAndEstimates();
        showToast(`${item.nome} adicionado à rota (ID ${seqId})`);
    };

    if (hasMapCoords(item)) {
        finish(Number(item.lat), Number(item.lng));
        return;
    }
    if (!geocoder) {
        showToast("Aguarde o mapa carregar completamente", true);
        return;
    }
    showToast("Localizando endereço…");
    geocoder.geocode({ address: item.endereco }, (res, stat) => {
        let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
        if (stat === "OK" && res[0]) {
            lat = res[0].geometry.location.lat();
            lng = res[0].geometry.location.lng();
            item.lat = lat;
            item.lng = lng;
            saveStorage();
        } else {
            showToast("Endereço sem coordenadas precisas. Usando o centro do mapa", true);
        }
        finish(lat, lng);
    });
}

// ========== SALVAR NA AGENDA ==========
async function cloneItemPhotosForCopy(src) {
    await ensureItemPhotos(src);
    const photos = [];
    const photoIds = [];
    const urls = Array.isArray(src.photos) ? src.photos : [];
    const ids = Array.isArray(src.photoIds) ? src.photoIds : [];
    const n = Math.max(urls.length, ids.length);
    for (let i = 0; i < n; i++) {
        let dataUrl = urls[i];
        if (!dataUrl && ids[i]) {
            try { dataUrl = await idbGetPhoto(ids[i]); } catch (_) { dataUrl = null; }
        }
        if (!dataUrl || typeof dataUrl !== 'string') continue;
        try {
            const newId = await persistPhotoDataUrl(dataUrl);
            photos.push(dataUrl);
            photoIds.push(newId);
        } catch (_) {}
    }
    return { photos, photoIds };
}

async function saveToAgenda(del, fromCard = false) {
    const duplicate = findAgendaItemForDelivery(del);
    if (duplicate) {
        showToast(`O endereço "${del.endereco}" já existe na agenda`, true);
        return false;
    }
    // Cópia própria no IndexedDB — agenda e entrega não partilham o mesmo photoId.
    const cloned = await cloneItemPhotosForCopy(del);
    agenda.push({ 
        agendaId: nextAgendaId++, 
        nome: del.nome, 
        endereco: del.endereco, 
        telefones: del.telefones || [], 
        pacotes: del.pacotes, 
        lat: del.lat, 
        lng: del.lng, 
        photos: cloned.photos,
        photoIds: cloned.photoIds,
        notes: del.notes || '',
        favorito: del.favorito || false
    });
    if (!del.savedToAgenda) { del.savedToAgenda = true; saveStorage(); renderDeliveriesList(); }
    saveStorage(); renderAgendaList();
    showToast(`"${del.nome}" salvo na agenda`);
    return true;
}

async function copyFromOtherRoute() {
    if (deliveries.length === 0) return showToast("Não há entregas na rota para copiar", true);
    let count = 0;
    for (const del of deliveries) {
        if (await saveToAgenda(del, false)) count++;
    }
    showToast(`${count} parada${count === 1 ? "" : "s"} adicionada${count === 1 ? "" : "s"} à agenda`);
}

// ========== BACKUP E RESTORE ==========
// Implementação em src/js/backup-ui.js (configureBackupUi no boot).

// ========== LIMPAR ROTA / NOVA ROTA ==========
async function clearRoute() {
    if (!deliveries.length) {
        showToast('A rota já está vazia', true);
        return;
    }
    const stats = routeDayStats(deliveries);
    const pendingNote = stats.pendente > 0
        ? ` Ainda há ${stats.pendente} parada(s) pendente(s).`
        : '';
    const ok = await showConfirmModal({
        title: 'Limpar rota',
        message: `Deseja limpar todas as entregas da rota atual? O dia será salvo no histórico.${pendingNote} A agenda não será alterada.`,
        confirmText: 'Limpar',
        danger: true
    });
    if (!ok) return;
    archiveCurrentRouteDay({ silent: true, clearAfter: true });
    showToast('Rota limpa e dia salvo no histórico');
}

/** Fecha painéis/modais abertos ao abrir o menu lateral (não fecha o próprio sidebar). */
function closeAllOverlaysExceptMenu() {
    closeAllOverflowMenus();
    closeDeliveryPanel();
    hideMapSelectedChip();
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        const cancel = overlay.querySelector(
            '.modal-cancel, #cancelEdit, #cancelProfileBtn, #cancelPhonesModal'
        );
        if (cancel) {
            try { cancel.click(); return; } catch (_) {}
        }
        try { overlay.click(); } catch (_) {}
        try { overlay.remove(); } catch (_) {}
    });
    document.querySelectorAll('.rf-multicam').forEach((el) => {
        try { el.querySelector('.rf-multicam-cancel')?.click(); } catch (_) {}
        try { el.remove(); } catch (_) {}
    });
}

function toggleSidebar() {
    const app = document.getElementById("appContainer");
    const opening = app.classList.contains("sidebar-hidden");
    app.classList.toggle("sidebar-hidden");
    if (opening) closeAllOverlaysExceptMenu();
    updateMapNextChip();
    setTimeout(() => {
        if (map && window.google?.maps?.event) google.maps.event.trigger(map, 'resize');
    }, 200);
}

// ========== PERFIL ==========
function showProfileModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const userProfile = getUserProfile();
    const accountLabelText = getCurrentUser() ? accountLabel() : 'Sem conta';
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:450px;">
            <h3 class="modal-title">Perfil e preferências</h3>
            <div class="form-group">
                <label>Conta</label>
                <div class="profile-account-chip">${escapeHtml(accountLabelText)}</div>
            </div>
            <div class="form-group">
                <label for="profileMotorista">Nome do motorista</label>
                <input type="text" id="profileMotorista" value="${escapeHtml(userProfile.motorista)}" class="edit-input">
            </div>
            <div class="form-group">
                <label for="profileEmpresa">Nome da empresa</label>
                <input type="text" id="profileEmpresa" value="${escapeHtml(userProfile.empresa || EMPRESA_PADRAO)}" class="edit-input" placeholder="${escapeHtml(EMPRESA_PADRAO)}">
                <span class="profile-hint">Usado no WhatsApp como 📦 {empresa}</span>
            </div>
            <div class="form-group">
                <label for="profileMensagem">Mensagem padrão do WhatsApp</label>
                <textarea id="profileMensagem" class="edit-input" rows="8" style="resize:vertical;">${escapeHtml(userProfile.mensagemPadrao)}</textarea>
                <span class="profile-hint">Placeholders: {nome}, {id}, {pacotes}, {endereco}, {empresa}, {obs}, {link}</span>
            </div>
            <div class="form-group">
                <label>Tamanho dos pins no mapa</label>
                <div class="pin-size-options" id="pinSizeOptions">
                    <button type="button" class="pin-size-option${pinSizePref === 'p' ? ' active' : ''}" data-size="p">Pequeno</button>
                    <button type="button" class="pin-size-option${pinSizePref === 'm' ? ' active' : ''}" data-size="m">Médio</button>
                    <button type="button" class="pin-size-option${pinSizePref === 'g' ? ' active' : ''}" data-size="g">Grande</button>
                </div>
            </div>
            <div class="form-group">
                <label>Feedback ao entregar</label>
                <div class="pref-toggle-row">
                    <div>
                        <span>Vibração</span>
                        <small>Ao concluir entrega ou lembrete</small>
                    </div>
                    <input type="checkbox" id="profileVibrate" ${feedbackVibrateEnabled ? 'checked' : ''} aria-label="Ativar vibração">
                </div>
                <div class="pref-toggle-row">
                    <div>
                        <span>Som</span>
                        <small>Beep curto de confirmação</small>
                    </div>
                    <input type="checkbox" id="profileSound" ${feedbackSoundEnabled ? 'checked' : ''} aria-label="Ativar som">
                </div>
            </div>
            <div class="form-group">
                <label>Backup</label>
                <div class="pref-toggle-row">
                    <div>
                        <span>Exportar dados</span>
                        <small id="profileBackupMeta">${escapeHtml((() => {
                            const m = readBackupMeta();
                            if (!m.lastBackupAt) return 'Nenhum backup registrado neste aparelho';
                            try {
                                return 'Último: ' + new Date(m.lastBackupAt).toLocaleString('pt-BR');
                            } catch (_) {
                                return 'Último backup registrado';
                            }
                        })())}</small>
                    </div>
                    <button type="button" class="action-btn backup-agenda-btn" id="profileBackupBtn" style="margin:0;white-space:nowrap;"><i class="fas fa-download"></i> Backup</button>
                </div>
            </div>
            <div class="modal-buttons">
                <button type="button" class="modal-confirm" id="saveProfileBtn">Salvar</button>
                <button type="button" class="modal-cancel" id="cancelProfileBtn">Fechar</button>
            </div>
            <button type="button" class="modal-text-danger" id="logoutProfileBtn">Sair da conta</button>
        </div>
    `;
    document.body.appendChild(overlay);

    let pendingPinSize = pinSizePref;
    overlay.querySelectorAll('.pin-size-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            pendingPinSize = btn.dataset.size;
            overlay.querySelectorAll('.pin-size-option').forEach((b) => b.classList.toggle('active', b === btn));
        });
    });

    document.getElementById('profileBackupBtn')?.addEventListener('click', async () => {
        await backupData();
        const metaEl = document.getElementById('profileBackupMeta');
        const m = readBackupMeta();
        if (metaEl && m.lastBackupAt) {
            try {
                metaEl.textContent = 'Último: ' + new Date(m.lastBackupAt).toLocaleString('pt-BR');
            } catch (_) {}
        }
    });

    document.getElementById('saveProfileBtn').onclick = () => {
        userProfile.motorista = document.getElementById('profileMotorista').value.trim() || 'Motorista';
        userProfile.empresa = document.getElementById('profileEmpresa').value.trim() || EMPRESA_PADRAO;
        userProfile.mensagemPadrao = document.getElementById('profileMensagem').value.trim() || userProfile.mensagemPadrao;
        setPinSizePref(pendingPinSize);
        setFeedbackPrefs({
            vibrate: !!document.getElementById('profileVibrate')?.checked,
            sound: !!document.getElementById('profileSound')?.checked
        });
        saveStorage();
        showToast("Perfil salvo");
        overlay.remove();
    };
    document.getElementById('cancelProfileBtn').onclick = () => overlay.remove();
    document.getElementById('logoutProfileBtn').onclick = () => {
        overlay.remove();
        logoutUser();
    };
}

// ========== SUGESTÕES (SEM BADGE "NA AGENDA") ==========
/** Rank match quality of text vs query (lower = better). */
function suggestionFieldRank(text, query) {
    const t = String(text || '').toLowerCase().trim();
    const q = String(query || '').toLowerCase().trim();
    if (!q || !t.includes(q)) return 10000;

    if (t === q) return 0;

    const isNumericQ = /^\d+$/.test(q);
    const lengthDelta = Math.abs(t.length - q.length);

    if (isNumericQ) {
        // Scan all occurrences; prefer exact number tokens over substrings of longer numbers (80 vs 8050).
        let best = 9000;
        for (let idx = t.indexOf(q); idx !== -1; idx = t.indexOf(q, idx + 1)) {
            const before = idx > 0 ? t[idx - 1] : '';
            const after = idx + q.length < t.length ? t[idx + q.length] : '';
            const beforeDigit = /\d/.test(before);
            const afterDigit = /\d/.test(after);
            let score;
            if (!beforeDigit && !afterDigit) {
                // Number-boundary: "80", "casa 80", "A80", "80-B"
                score = idx === 0 ? 10 : 20;
            } else if (!beforeDigit && afterDigit) {
                // Prefix of a longer number: "8050" when typing "80"
                score = 200 + Math.min(40, lengthDelta);
            } else if (beforeDigit && !afterDigit) {
                // Suffix of a longer number: "180"
                score = 220 + Math.min(40, lengthDelta);
            } else {
                score = 250 + Math.min(40, lengthDelta);
            }
            if (score < best) best = score;
        }
        return best + Math.min(15, lengthDelta);
    }

    if (t.startsWith(q)) return 10 + Math.min(20, lengthDelta);

    // Word-boundary / token start (space, punctuation, hyphen)
    const boundaryRe = new RegExp('(?:^|[\\s\\-_/.,;:#()\\[\\]])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (boundaryRe.test(t)) return 30 + Math.min(20, lengthDelta);

    const pos = t.indexOf(q);
    return 100 + Math.min(50, pos) + Math.min(30, lengthDelta);
}

function suggestionItemRank(item, query) {
    const nome = String(item.nome || '').toLowerCase();
    const end = String(item.endereco || '').toLowerCase();
    const q = String(query || '').toLowerCase();
    const nomeRank = nome.includes(q) ? suggestionFieldRank(nome, q) : 10000;
    const endRank = end.includes(q) ? suggestionFieldRank(end, q) + 8 : 10000; // slight preference for nome
    return Math.min(nomeRank, endRank);
}

function initNameSuggestions() {
    const input = document.getElementById('customerName');
    const suggestionsDiv = document.getElementById('nameSuggestions');
    input.addEventListener('input', debounce(function() {
        const query = this.value.trim().toLowerCase();
        if (query.length < 1) { suggestionsDiv.style.display = 'none'; return; }

        let agendaMatches = agenda.filter(item => 
            item.nome.toLowerCase().includes(query) || 
            item.endereco.toLowerCase().includes(query)
        );

        let routeMatches = deliveries.filter(del => 
            del.nome.toLowerCase().includes(query) || 
            del.endereco.toLowerCase().includes(query)
        );

        let combined = [];

        routeMatches.forEach(del => {
            combined.push({
                type: 'route',
                item: del,
                nome: del.nome,
                endereco: del.endereco,
                telefones: del.telefones || [],
                pacotes: del.pacotes || 1,
                notes: del.notes || '',
                favorito: del.favorito || false,
                sequentialId: del.sequentialId,
                id: del.id
            });
        });

        agendaMatches.forEach(item => {
            const onRoute = findActiveRouteByAddress(item.endereco);
            combined.push({
                type: 'agenda',
                item: item,
                nome: item.nome,
                endereco: item.endereco,
                telefones: item.telefones || [],
                pacotes: item.pacotes || 1,
                notes: item.notes || '',
                favorito: item.favorito || false,
                agendaId: item.agendaId,
                isInRoute: !!onRoute,
                sequentialId: onRoute ? onRoute.sequentialId : null
            });
        });

        const unique = [];
        const seen = new Set();
        combined.forEach(item => {
            const key = item.endereco.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            } else {
                const existingIndex = unique.findIndex(u => u.endereco.toLowerCase() === key);
                if (existingIndex !== -1 && item.type === 'route') {
                    unique[existingIndex] = item;
                }
            }
        });

        const isNumericQuery = /^\d+$/.test(query);
        unique.sort((a, b) => {
            const ra = suggestionItemRank(a, query);
            const rb = suggestionItemRank(b, query);
            if (ra !== rb) return ra - rb;
            if (a.favorito && !b.favorito) return -1;
            if (!a.favorito && b.favorito) return 1;
            if (a.type === 'route' && b.type !== 'route') return -1;
            if (a.type !== 'route' && b.type === 'route') return 1;
            if (isNumericQuery) {
                const lenDiff = String(a.nome || '').length - String(b.nome || '').length;
                if (lenDiff !== 0) return lenDiff;
            }
            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt', { sensitivity: 'base' });
        });

        const limited = unique.slice(0, 50);
        if (limited.length === 0) { suggestionsDiv.style.display = 'none'; return; }

        let html = '';
        limited.forEach(item => {
            const isRoute = item.type === 'route';
            const isAgendaInRoute = item.type === 'agenda' && item.isInRoute;
            const matchedBy = (item.nome.toLowerCase().includes(query) ? 'nome' : 'endereço');
            const icon = matchedBy === 'nome' ? 'fa-user' : 'fa-location-dot';
            const phones = (item.telefones || []).map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
            const favoritoIcon = item.favorito ? '⭐ ' : '';

            let badgeHtml = '';
            if (isRoute) {
                badgeHtml = `<span class="suggestion-badge route">🚀 ID ${item.sequentialId}</span>`;
            } else if (isAgendaInRoute) {
                const routeItem = deliveries.find(d => d.endereco.toLowerCase() === item.endereco.toLowerCase());
                badgeHtml = routeItem ? `<span class="suggestion-badge route">🚀 Na rota (ID ${routeItem.sequentialId})</span>` : `<span class="suggestion-badge route">🚀 Na rota</span>`;
            } else {
                // SEM BADGE para itens da agenda não rota
                badgeHtml = '';
            }

            const routeClass = isRoute ? 'suggestion-route' : 'suggestion-agenda';
            const pacotesVal = item.pacotes || 1;
            const dataIdAttr = isRoute ? `data-id="${item.id}"` : '';

            let actionBtnHtml;
            if (isRoute) {
                actionBtnHtml = `<button class="suggestion-btn-save" data-action="save" data-id="${item.id}" data-pacotes="${pacotesVal}"><i class="fas fa-save"></i> Salvar</button>`;
            } else if (isAgendaInRoute) {
                actionBtnHtml = `<button class="suggestion-btn-add disabled" disabled>🔒 Na rota</button>`;
            } else {
                // Item da agenda que NÃO está na rota => botão "+ Rota" habilitado
                actionBtnHtml = `<button class="suggestion-btn-add" data-name="${escapeHtml(item.nome)}" data-address="${escapeHtml(item.endereco)}" data-phones='${JSON.stringify(item.telefones || [])}' data-pacotes="${pacotesVal}" data-notes="${escapeHtml(item.notes || '')}"><i class="fas fa-plus"></i> Rota</button>`;
            }

            html += `<div class="suggestion-item ${routeClass}" ${dataIdAttr} data-name="${escapeHtml(item.nome)}" data-address="${escapeHtml(item.endereco)}" data-phones='${JSON.stringify(item.telefones || [])}' data-pacotes="${pacotesVal}" data-notes="${escapeHtml(item.notes || '')}" data-isroute="${isRoute}">
                        <div class="suggestion-info">
                            <div><i class="fas ${icon}" style="color:#3b82f6; margin-right:8px;"></i><strong>${favoritoIcon}${escapeHtml(item.nome)}</strong> ${badgeHtml}</div>
                            <div style="font-size:0.7rem; color:#475569;">${escapeHtml(item.endereco)} ${phones ? `<span style="margin-left:6px;">📞 ${escapeHtml(phones)}</span>` : ''}</div>
                            <div style="font-size:0.65rem; color:#3b82f6;">${matchedBy}</div>
                        </div>
                        <div class="suggestion-actions">
                            <div class="suggestion-pacotes-control" data-pacotes="${pacotesVal}">
                                <button class="suggestion-pacotes-minus">−</button>
                                <span class="suggestion-pacotes-value">${pacotesVal}</span>
                                <button class="suggestion-pacotes-plus">+</button>
                            </div>
                            ${actionBtnHtml}
                        </div>
                    </div>`;
        });
        suggestionsDiv.innerHTML = html;
        suggestionsDiv.style.display = 'block';

        document.querySelectorAll('.suggestion-pacotes-control').forEach(control => {
            const minus = control.querySelector('.suggestion-pacotes-minus');
            const plus = control.querySelector('.suggestion-pacotes-plus');
            const valueSpan = control.querySelector('.suggestion-pacotes-value');
            const itemDiv = control.closest('.suggestion-item');
            const actionBtn = itemDiv.querySelector('.suggestion-btn-save, .suggestion-btn-add');

            let currentVal = parseInt(control.dataset.pacotes) || 1;

            function updateValue(newVal) {
                if (newVal < 1) newVal = 1;
                currentVal = newVal;
                valueSpan.textContent = currentVal;
                control.dataset.pacotes = currentVal;
                itemDiv.dataset.pacotes = currentVal;
                if (actionBtn) actionBtn.dataset.pacotes = currentVal;
            }

            minus.addEventListener('click', (e) => {
                e.stopPropagation();
                updateValue(currentVal - 1);
            });
            plus.addEventListener('click', (e) => {
                e.stopPropagation();
                updateValue(currentVal + 1);
            });
        });

        document.querySelectorAll('#nameSuggestions .suggestion-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.suggestion-btn-save') || e.target.closest('.suggestion-btn-add') || e.target.closest('.suggestion-pacotes-control')) return;
                const name = el.dataset.name;
                const address = el.dataset.address;
                const phones = JSON.parse(el.dataset.phones || '[]');
                const pacotes = parseInt(el.dataset.pacotes) || 1;
                const notes = el.dataset.notes || '';

                document.getElementById('customerName').value = name;
                document.getElementById('address').value = address;
                tempPhones = phones;
                renderTempPhones();
                document.getElementById('pacotes').value = pacotes;
                suggestionsDiv.style.display = 'none';
                checkAddressDuplicate();
            });
        });

        document.querySelectorAll('.suggestion-btn-save').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const pacotes = parseInt(btn.dataset.pacotes) || 1;
                const delivery = deliveries.find(d => d.id === id);
                if (delivery) {
                    delivery.pacotes = pacotes;
                    saveStorage();
                    renderDeliveriesList();
                    const marker = getMarker(delivery.sequentialId);
                    if (marker) updateMarkerIcon(marker, delivery);
                    updateDeliveryStats();
                    showToast(`Entrega ${delivery.sequentialId}: pacotes atualizados para ${pacotes}`);
                    suggestionsDiv.style.display = 'none';
                } else {
                    showToast("Entrega não encontrada", true);
                }
            });
        });

        document.querySelectorAll('.suggestion-btn-add:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                const address = btn.dataset.address;
                const phones = JSON.parse(btn.dataset.phones || '[]');
                const pacotes = parseInt(btn.dataset.pacotes) || 1;
                const notes = btn.dataset.notes || '';
                // Verifica se já está na rota (pendente / em rota)
                const already = findActiveRouteByAddress(address);
                if (already) {
                    showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
                    suggestionsDiv.style.display = 'none';
                    return;
                }
                // Permite adicionar mesmo que esteja na agenda
                tempPhones = phones;
                renderTempPhones();
                addDeliveryDirect(name, address, phones, pacotes, notes);
                suggestionsDiv.style.display = 'none';
            });
        });
    }, 180));
    document.addEventListener('click', (e) => {
        if (e.target !== input && !suggestionsDiv.contains(e.target)) suggestionsDiv.style.display = 'none';
    });
}

// ========== ADICIONAR ENTREGA DIRETO (PERMITE AGENDA) ==========
function addDeliveryDirect(nome, endereco, telefones, pacotes, notes) {
    if (!nome || !endereco) { showToast("Preencha nome e endereço para continuar", true); return; }

    // Verifica se já está na rota (pendente / em rota)
    const already = findActiveRouteByAddress(endereco);
    if (already) {
        showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
        return;
    }

    // Permite adicionar mesmo que esteja na agenda (não verifica agenda)

    const known = agenda.find(a => a.endereco.toLowerCase() === endereco.toLowerCase());
    const finish = (lat, lng) => {
        let seqId = getSequentialId(nextSequenceNumber);
        let newDelivery = { 
            id: newId(), 
            sequentialId: seqId, 
            nome, 
            endereco, 
            telefones: telefones || [], 
            pacotes, 
            status: "pendente", 
            lat, 
            lng, 
            savedToAgenda: !!known, 
            photos: known ? [...(known.photos || [])] : [], 
            notes: notes || '',
            favorito: known ? !!known.favorito : false
        };
        deliveries.push(newDelivery);
        nextSequenceNumber++;
        persistStorageNow(); renderDeliveriesList(); upsertMarker(newDelivery);
        updateLastIdDisplay(seqId);
        clearRouteOverlay();
        updateProgressAndEstimates();
        showToast(`Entrega ${seqId} incluída na rota`);
        if (deliveries.length === 1) centerMapOnMarkers();
        clearForm();
    };
    if (known && known.lat && known.lng) {
        finish(known.lat, known.lng);
        return;
    }
    showToast("Localizando endereço…");
    geocoder.geocode({ address: endereco }, (res, stat) => {
        let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
        if (stat === "OK" && res[0]) {
            lat = res[0].geometry.location.lat();
            lng = res[0].geometry.location.lng();
        } else {
            showToast("Endereço não encontrado. Usando o centro do mapa", true);
        }
        finish(lat, lng);
    });
}

// ========== ROTA OTIMIZADA (Directions API) ==========
// Geometria: lib/routing-helpers.js · orquestração: src/js/routing.js (configureRouting).
// GPS / BackgroundGps: src/js/gps.js (configureGps) · helpers: lib/gps-helpers.js.
let startPoint = null;

// Directions/otimização: src/js/routing.js

// ========== MAPA E INICIALIZAÇÃO ==========
// Init nativo/web + Places: src/js/map-layer.js (configureMapLayer, initMap).

/** Interface do motorista. Roda no DOMContentLoaded, sem esperar o callback do Google Maps. */
function initAppUi() {
    if (initAppUi.done) return;
    initAppUi.done = true;
    initNameSuggestions();
    setupNewDeliveryPhoneUI();

    const addressInput = document.getElementById('address');
    if (addressInput) {
        addressInput.addEventListener('input', function() {
            clearTimeout(duplicateCheckTimer);
            duplicateCheckTimer = setTimeout(checkAddressDuplicate, 300);
        });
    }

    bindGalleryChrome();
    document.getElementById('closePanelBtn').addEventListener('click', closeDeliveryPanel);
    document.getElementById('panelPacotesPlus').addEventListener('click', () => adjustPacotes(1));
    document.getElementById('panelPacotesMinus').addEventListener('click', () => adjustPacotes(-1));
    document.getElementById('editObsBtn').addEventListener('click', editObservation);
    document.getElementById('editPhoneBtn').addEventListener('click', editPhonesPanel);
    setupPanelSwipe();
    setupPanelPhotoCapture();
    setupUndoSnackbar();
    setupHistoryListDelegation();
    setupOverflowMenus();
    setupBackupReminderUi();
    setupAutoBackupScheduler();
    document.getElementById('mapNextChip')?.addEventListener('click', () => {
        const selected = currentSelectedDelivery;
        if (!selected) return;
        focusDeliveryInPanel(selected, 0, { keepMinimized: false, pan: true, zoom: 16 });
    });
    if (isNativeApp()) {
        setupScreenLockNotificationBridge();
        setupCameraRestoreHandler();
    }

    document.getElementById('profileBtn').addEventListener('click', showProfileModal);
    bindBackupButtons();

    document.getElementById('optimizeRouteBtn').addEventListener('click', optimizeRoute);
    document.getElementById('optimizeRouteToolBtn')?.addEventListener('click', optimizeRoute);
    updateOptimizeFabVisibility();
    document.getElementById('archiveDayBtn')?.addEventListener('click', () => archiveCurrentRouteDay({ silent: false }));
    document.getElementById('newRouteBtn')?.addEventListener('click', startNewRoute);
    document.getElementById('newRouteMenuBtn')?.addEventListener('click', startNewRoute);
    document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);
    document.getElementById('toggleSidebarBtn').addEventListener('click', toggleSidebar);
    document.getElementById('copyFromRouteBtn').addEventListener('click', copyFromOtherRoute);
    document.getElementById('gpsBtn').addEventListener('click', toggleGps);
    updateGpsButton();
    // No celular nativo o GPS funciona sem HTTPS; no browser precisa de contexto seguro.
    if (gpsEnabled && (isNativeApp() || window.isSecureContext)) {
        enableGpsTracking().then(ok => {
            if (!ok) updateGpsButton();
        });
    } else if (gpsEnabled && !window.isSecureContext) {
        updateGpsButton();
    }

    document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
        btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isGalleryOpen()) closeGallery();
            else closeDeliveryPanel();
        }
        if (isGalleryOpen() && e.key === 'ArrowRight') nextPhoto();
        if (isGalleryOpen() && e.key === 'ArrowLeft') prevPhoto();
    });

    setTimeout(() => {
        if (geocoder) return;
        const loading = document.getElementById('mapLoading');
        if (loading) loading.textContent = 'Mapa indisponível. Lista, agenda e backup continuam funcionando.';
    }, 8000);
}

function setupNewDeliveryPhoneUI() {
    const addBtn = document.getElementById('addPhoneBtn');
    const numInput = document.getElementById('newPhoneInput');
    const labelInput = document.getElementById('newPhoneLabel');
    addBtn.addEventListener('click', () => {
        const numero = numInput.value.trim();
        const label = labelInput.value.trim();
        if (!numero) return showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número de telefone inválido", true);
        tempPhones.push({ numero: formatted, label: label || '' });
        renderTempPhones();
        numInput.value = '';
        labelInput.value = '';
    });
    numInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    renderTempPhones();
}

function geocodeAddressAndUpdate(delivery, newAddress, callback) {
    // Adia 1 frame para não competir com o fecho do modal / gesto.
    if (newAddress === delivery.endereco) { callback?.(true); return; }
    if (!geocoder) {
        showToast('Aguarde o mapa carregar para localizar o endereço', true);
        callback?.(false);
        return;
    }
    showToast("Localizando endereço…");
    const run = () => {
        geocoder.geocode({ address: newAddress }, (res, stat) => {
            if (stat === "OK" && res[0]) {
                delivery.lat = res[0].geometry.location.lat();
                delivery.lng = res[0].geometry.location.lng();
                delivery.endereco = newAddress;
                saveStorage();
                syncTrackingStatus(delivery);
                const marker = getMarker(delivery.sequentialId);
                if (marker) { marker.setPosition({ lat: delivery.lat, lng: delivery.lng }); updateMarkerIcon(marker, delivery); } else { rebuildMarkers(false); }
                renderDeliveriesList();
                showToast("Endereço atualizado");
                callback?.(true);
            } else { showToast("Não foi possível localizar este endereço", true); callback?.(false); }
        });
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 600 });
    else setTimeout(run, 50);
}

async function markDelivered(id, { advance = false } = {}) {
    try {
        let d = deliveries.find(x => x.id === id);
        if (!d || d.status === 'entregue') return;
        const normalsBefore = countNormalActiveStops();
        d.status = 'entregue';
        d.voltarDepois = false;
        delete d.failReason;
        // Libera JPEGs em memória de outras paradas — o backup/auto e o avanço no painel matavam o WebView.
        try { releaseInMemoryPhotosExcept(d.id); } catch (_) {}
        try { saveStorage(); } catch (_) {}
        try { syncTrackingStatus(d); } catch (e) { console.warn('syncTrackingStatus', e); }
        try { sendDeliveredPush(d); } catch (e) { console.warn('sendDeliveredPush', e); }
        try { upsertMarker(d); } catch (e) { console.warn('upsertMarker', e); }
        try { updateDeliveryStats(); } catch (_) {}
        try { renderDeliveriesList(); } catch (_) {}
        try { notifyRouteCompositionChanged({ keepRoute: true }); } catch (_) {}
        try { playDeliveryFeedback(); } catch (_) {}
        try { noteDeliveryCompletedForBackup(); } catch (_) {}
        try { maybeNotifyVoltarDepois(normalsBefore); } catch (_) {}
        if (advance) {
            try { minimizeDeliveryPanel(); } catch (_) {}
            try {
                goToAdjacentDelivery(1, { preferPending: true, keepMinimized: true });
            } catch (e) {
                console.warn('goToAdjacentDelivery', e);
            }
        } else if (currentSelectedDelivery && currentSelectedDelivery.id === id) {
            const mini = !!document.getElementById('deliveryPanel')?.classList.contains('minimized');
            try { await openDeliveryPanel(d, { keepMinimized: mini }); } catch (_) {}
        } else {
            try { syncActiveStopNotification(currentSelectedDelivery); } catch (_) {}
        }
    } catch (e) {
        console.error('markDelivered', e);
        try { showToast('Não foi possível concluir a entrega', true); } catch (_) {}
    }
}

// releaseInMemoryPhotosExcept: src/js/item-photos.js

function undoDeliveryStatus(id, { keepPanel = false, keepMinimized = false } = {}) {
    let d = deliveries.find(d => d.id === id);
    if (!d) return;
    if (d.status !== 'entregue' && d.status !== 'falhou') return;
    d.status = 'pendente';
    d.voltarDepois = false;
    delete d.failReason;
    delete d.deliveredNotified;
    delete d.absentNotified;
    saveStorage();
    syncTrackingStatus(d);
    upsertMarker(d);
    updateDeliveryStats();
    renderDeliveriesList();
    notifyRouteCompositionChanged({ keepRoute: true });
    showToast(`Entrega ${d.sequentialId} reaberta como pendente`);
    if (keepPanel || (currentSelectedDelivery && currentSelectedDelivery.id === id)) {
        openDeliveryPanel(d, { keepMinimized });
    }
}

// ========== NÃO ENTREGUE / VOLTAR DEPOIS ==========
// FAIL_REASON_*: lib/list-helpers.js

let voltarDepoisAlertShown = false;

function playDeliveryFeedback() {
    try {
        if (feedbackVibrateEnabled && navigator.vibrate) navigator.vibrate([35, 25, 45]);
    } catch (e) {}
    if (!feedbackSoundEnabled) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.07;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.stop(ctx.currentTime + 0.13);
        setTimeout(() => { try { ctx.close(); } catch (e) {} }, 250);
    } catch (e) {}
}

async function ensureNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
        const result = await Notification.requestPermission();
        return result === 'granted';
    } catch (e) {
        return false;
    }
}

function countNormalActiveStops() {
    return deliveries.filter(d => isActiveStop(d) && !d.voltarDepois).length;
}

function getVoltarDepoisStops() {
    return deliveries.filter(d => isActiveStop(d) && d.voltarDepois);
}

// Avisa ao terminar a penúltima (ou a última) entrega "normal",
// para o motorista lembrar de voltar às paradas adiadas.
function maybeNotifyVoltarDepois(normalsBefore) {
    const postponed = getVoltarDepoisStops();
    if (!postponed.length) {
        voltarDepoisAlertShown = false;
        return;
    }
    const normalsAfter = countNormalActiveStops();
    // Penúltima: saiu de 2+ normais para 1 (ou 0).
    if (!(normalsBefore > 1 && normalsAfter <= 1)) return;
    if (voltarDepoisAlertShown) return;
    voltarDepoisAlertShown = true;
    notifyVoltarDepoisStops(postponed);
}

function notifyVoltarDepoisStops(list) {
    const items = list || getVoltarDepoisStops();
    if (!items.length) return;

    const names = items.map(d => `${d.sequentialId} · ${d.nome}`).join(', ');
    const msg = items.length === 1
        ? `Lembrete: retornar à entrega ${names}`
        : `Lembrete: retornar a ${items.length} entregas adiadas — ${names}`;
    showToast(msg, true);

    try {
        if (feedbackVibrateEnabled && navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 180]);
    } catch (e) {}

    if (feedbackSoundEnabled) {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) {
                const ctx = new Ctx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = 660;
                gain.gain.value = 0.08;
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc.stop(ctx.currentTime + 0.26);
                setTimeout(() => { try { ctx.close(); } catch (e) {} }, 350);
            }
        } catch (e) {}
    }

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification('RotaFlow — Voltar depois', {
                body: names,
                tag: 'voltar-depois-penultima',
                renotify: true,
                icon: APP_ICON
            });
        } catch (e) {}
    }
}

async function markNotDelivered(id) {
    try {
        const d = deliveries.find(x => x.id === id);
        if (!d || d.status === 'entregue') return;

        const choice = await showChoiceModal({
            title: 'Não entregue',
            message: `Selecione o motivo para a entrega ${d.sequentialId} (${d.nome}):`,
            options: FAIL_REASON_OPTIONS.map(o => ({
                label: o.label,
                value: o.id,
                icon: o.icon,
                iconColor: o.iconColor
            }))
        });
        if (!choice) return;

        const normalsBefore = countNormalActiveStops();

        if (choice === 'voltar-depois') {
            d.status = 'pendente';
            d.voltarDepois = true;
            d.failReason = 'voltar-depois';
            try { await ensureNotificationPermission(); } catch (_) {}
            try { saveStorage(); } catch (_) {}
            try {
                const marker = getMarker(d.sequentialId);
                if (marker) updateMarkerIcon(marker, d);
            } catch (_) {}
            try { updateDeliveryStats(); } catch (_) {}
            try { renderDeliveriesList(); } catch (_) {}
            voltarDepoisAlertShown = false;
            showToast(`Entrega ${d.sequentialId} adiada. Aviso na penúltima parada`);
            try { minimizeDeliveryPanel(); } catch (_) {}
            try { goToAdjacentDelivery(1, { preferPending: true, keepMinimized: true }); } catch (_) {}
            return;
        }

        d.status = 'falhou';
        d.voltarDepois = false;
        d.failReason = choice;
        try { releaseInMemoryPhotosExcept(d.id); } catch (_) {}
        try { saveStorage(); } catch (_) {}
        try { syncTrackingStatus(d); } catch (_) {}
        if (choice === 'ausente') {
            try { sendAbsentPush(d); } catch (_) {}
        }
        try {
            const marker = getMarker(d.sequentialId);
            if (marker) updateMarkerIcon(marker, d);
            else rebuildMarkers(false);
        } catch (_) {}
        try { updateDeliveryStats(); } catch (_) {}
        try { renderDeliveriesList(); } catch (_) {}
        try { notifyRouteCompositionChanged({ keepRoute: true }); } catch (_) {}
        try { noteDeliveryCompletedForBackup(); } catch (_) {}
        showUndoSnackbar(d.id, `Entrega ${d.sequentialId}: ${FAIL_REASON_LABELS[choice] || 'não entregue'}`);
        try { maybeNotifyVoltarDepois(normalsBefore); } catch (_) {}
        try { minimizeDeliveryPanel(); } catch (_) {}
        try { goToAdjacentDelivery(1, { preferPending: true, keepMinimized: true }); } catch (_) {}
    } catch (e) {
        console.error('markNotDelivered', e);
        try { showToast('Não foi possível atualizar a entrega', true); } catch (_) {}
    }
}

// ========== EVENTO DO BOTÃO "ADICIONAR ENTREGA" (FORMULÁRIO MANUAL) ==========
document.addEventListener('DOMContentLoaded', function() {
    initAuthUi();
    initAppUi();
    localStorage.removeItem('rotaflow_reminders');
    voltarDepoisAlertShown = false;
    document.getElementById("routeSearchInput").addEventListener("input", debounce((e) => { routeFilter = e.target.value.toLowerCase(); renderDeliveriesList(); }, 150));
    document.getElementById("agendaSearchInput").addEventListener("input", debounce((e) => { agendaFilter = e.target.value.toLowerCase(); renderAgendaList(); }, 150));

    document.getElementById("addDeliveryBtn").addEventListener('click', function() {
        let nome = document.getElementById("customerName").value.trim();
        let end = document.getElementById("address").value.trim();
        let pacotes = parseInt(document.getElementById("pacotes").value) || 1;
        let saveAgenda = document.getElementById("saveToAgendaCheckbox").checked;
        let telefones = [...tempPhones];
        let notes = "";
        if (!nome || !end) { showToast("Preencha nome e endereço para continuar", true); return; }
        if (!geocoder) { showToast("Aguarde o mapa carregar completamente", true); return; }

        // Verifica se o endereço já está na rota (pendente / em rota)
        const already = findActiveRouteByAddress(end);
        if (already) {
            showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
            return;
        }

        // *** BLOQUEIA SE O ENDEREÇO JÁ ESTIVER NA AGENDA ***
        if (agenda.some(item => item.endereco.toLowerCase() === end.toLowerCase())) {
            showToast("Este endereço já está na agenda. Use '+ Rota' na agenda para incluí-lo.", true);
            return;
        }

        showToast("Localizando endereço…");
        geocoder.geocode({ address: end }, (res, stat) => {
            let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
            if (stat === "OK" && res[0]) {
                lat = res[0].geometry.location.lat();
                lng = res[0].geometry.location.lng();
            } else {
                showToast("Endereço não encontrado. Usando o centro do mapa", true);
            }
            let seqId = getSequentialId(nextSequenceNumber);
            let newDelivery = { 
                id: newId(), 
                sequentialId: seqId, 
                nome, 
                endereco: end, 
                telefones, 
                pacotes, 
                status: "pendente", 
                lat, 
                lng, 
                savedToAgenda: false, 
                photos: [],
                photoIds: [],
                notes: notes,
                favorito: false
            };
            deliveries.push(newDelivery); nextSequenceNumber++;
            persistStorageNow(); renderDeliveriesList(); upsertMarker(newDelivery);
            updateLastIdDisplay(seqId);
            clearRouteOverlay();
            updateProgressAndEstimates();
            if (saveAgenda) {
                const agendaDup = agenda.some(item => item.endereco.toLowerCase() === end.toLowerCase());
                if (agendaDup) {
                    showToast(`Entrega ${seqId} incluída na rota. Endereço já constava na agenda`);
                } else {
                    agenda.push({ agendaId: nextAgendaId++, nome, endereco: end, telefones, pacotes, lat, lng, photos: [], photoIds: [], notes: notes });
                    newDelivery.savedToAgenda = true;
                    saveStorage();
                    renderAgendaList();
                    renderDeliveriesList();
                    showToast(`Entrega ${seqId} incluída na rota e salva na agenda`);
                }
            } else {
                showToast(`Entrega ${seqId} incluída na rota`);
            }
            if (deliveries.length === 1) centerMapOnMarkers();
            clearForm();
        });
    });
});


window.initMap = initMap;
window.addEventListener('beforeunload', persistStorageNow);

if ('serviceWorker' in navigator && !isNativeApp()) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ========== MANIFESTO PWA (embutido, pois o app é um arquivo único) ==========
(function () {
    const dir = location.pathname.replace(/[^/]*$/, '');
    const manifest = {
        name: 'RotaFlow Pro',
        short_name: 'RotaFlow',
        description: 'Gestão de entregas com mapa, rota e agenda',
        start_url: location.pathname + location.search,
        scope: dir,
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'pt-BR',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        icons: [
            { src: APP_ICON, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
            { src: APP_ICON, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = url;
    document.head.appendChild(link);
})();

(function () {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installBtn');
        if (!installBtn) return;
        installBtn.style.display = 'flex';
        installBtn.onclick = () => {
            installBtn.style.display = 'none';
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
        };
    });
})();
