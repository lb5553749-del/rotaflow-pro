// ============================================================
//  RotaFlow Pro — app do motorista (bundle: npm run build → build/app.js)
//  Código ainda é majoritariamente um script único; módulos extraídos ficam em src/js/.
//  Nada aqui é global: o que outro script precisar (ex.: callback do Maps) vai em `window`.
// ============================================================
import '../../native/bridge.js';
import '../../native/push-sender.js';
import {
    buildPersistPayload,
    hydrateRoutesFromData as hydrateRoutesState
} from '../../lib/persist-helpers.js';
import {
    photoFingerprint,
    itemPhotoScope,
    remainingPhotoSlots as remainingPhotoSlotsFor,
    slicePhotoIdsForHydrate,
    collectKeepPhotoIds,
    DEFAULT_FINISHED_PHOTO_TTL_DAYS
} from '../../lib/photo-helpers.js';
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
    startNewRoute,
    renderHistoryList,
    setupHistoryListDelegation
} from './history.js';
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
    PHOTO_MULTICAM_MAX_SIDE,
    PHOTO_MULTICAM_JPEG_QUALITY,
    PHOTO_MAX_PER_ITEM,
    newPhotoId,
    revokePhotoObjectUrl,
    revokeDisplayUrl,
    idbPutPhoto,
    idbGetPhoto,
    idbDeletePhoto,
    enqueuePhotoOp,
    setPendingPhotoTarget,
    clearPendingPhotoTarget,
    getPendingPhotoTarget,
    yieldToUiFrame,
    compressImageFile,
    compressDataUrl,
    purgeStalePhotos,
    schedulePhotoHousekeeping
} from './photo-store.js';
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

let storageFull = false;

function currentUid() {
    return (currentUser && currentUser.uid) ? currentUser.uid : 'guest';
}
function storageKey(base) {
    return `rotaflow_${base}_${currentUid()}`;
}
configurePhotoStore({ getUid: currentUid });
configureBackupStore({ getUid: currentUid, storageKey, isNativeApp });
function updateSyncBadge() {
    const el = document.getElementById('syncBadge');
    if (el) el.className = 'sync-badge';
}

function saveAuthSession(user) {
    try { localStorage.setItem('rotaflow_auth_session', JSON.stringify(user)); } catch (e) {}
}
function clearAuthSession() {
    localStorage.removeItem('rotaflow_auth_session');
}
function loadAuthSession() {
    try {
        const raw = localStorage.getItem('rotaflow_auth_session');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function updateUserChip() {
    const chip = document.getElementById('userChip');
    const name = document.getElementById('userChipName');
    const photo = document.getElementById('userChipPhoto');
    if (!chip || !currentUser) return;
    name.textContent = currentUser.displayName || currentUser.email || 'Conta local';
    if (currentUser.photoURL) {
        photo.src = currentUser.photoURL;
        photo.style.display = 'block';
    } else {
        photo.removeAttribute('src');
        photo.style.display = 'none';
    }
    chip.classList.add('show');
    updateSyncBadge();
}
function hideLoginScreen() {
    document.getElementById('loginScreen')?.classList.add('hidden');
}
function showLoginScreen() {
    document.getElementById('loginScreen')?.classList.remove('hidden');
}

async function enterAsUser(user) {
    currentUser = user;
    authReady = true;
    saveAuthSession(user);
    try {
        if (window.RotaFlowCap && typeof window.RotaFlowCap.setCrashlyticsUser === 'function') {
            window.RotaFlowCap.setCrashlyticsUser(user && user.uid);
        }
    } catch (_) {}
    updateUserChip();
    hideLoginScreen();
    await loadStorage();
    showToast(`Bem-vindo, ${user.displayName || 'motorista'}`);
    maybeAutoBackupOnDayChange();
}

async function continueLocally() {
    let localId = localStorage.getItem('rotaflow_local_uid');
    if (!localId) {
        localId = 'local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        localStorage.setItem('rotaflow_local_uid', localId);
    }
    await enterAsUser({
        uid: localId,
        displayName: 'Neste aparelho',
        email: '',
        photoURL: '',
        provider: 'local'
    });
}

async function logoutUser() {
    const ok = await showConfirmModal({
        title: 'Sair',
        message: 'Deseja sair agora? Seus dados permanecem salvos neste aparelho e estarão disponíveis ao retornar.',
        confirmText: 'Sair',
        danger: true
    });
    if (!ok) return;
    persistStorageNow();
    clearAuthSession();
    currentUser = null;
    authReady = false;
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
    document.getElementById('userChip')?.classList.remove('show');
    updateSyncBadge();
    showLoginScreen();
}

function initAuthUi() {
    const localBtn = document.getElementById('loginLocalBtn');
    const hint = document.getElementById('loginHint');
    if (hint) hint.textContent = 'Os dados ficam neste aparelho.';

    localBtn.addEventListener('click', continueLocally);

    const session = loadAuthSession();
    if (session && session.uid && (session.provider === 'local' || !session.provider)) {
        enterAsUser({
            uid: session.uid,
            displayName: session.displayName || 'Neste aparelho',
            email: '',
            photoURL: '',
            provider: 'local'
        });
    } else {
        // Único modo: entra direto neste aparelho.
        continueLocally();
    }
}

let cameraRestoreHandlerReady = false;

/**
 * Housekeeping IndexedDB: remove fotos órfãs e fotos só referenciadas por
 * histórico/rotas finalizadas além do TTL (default 30 dias; configurável).
 */
async function pruneOrphanPhotos(ttlDays = DEFAULT_FINISHED_PHOTO_TTL_DAYS) {
    const uid = currentUid();
    if (!uid) return 0;
    syncActiveRouteIntoRoutes();
    const keepPhotoIds = collectKeepPhotoIds({
        routes,
        agenda,
        history: getRouteHistory(),
        ttlDays
    });
    return purgeStalePhotos({ uid, keepPhotoIds });
}

function scheduleOrphanPhotoPrune() {
    schedulePhotoHousekeeping(() => {
        pruneOrphanPhotos().catch(() => {});
    });
}

function isPhotoPickCancelled(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('cancel') || msg.includes('user denied') || msg.includes('no image') || msg.includes('picker was cancelled');
}

function remainingPhotoSlots(item) {
    return remainingPhotoSlotsFor(item, PHOTO_MAX_PER_ITEM);
}

function canUseNativeMultiCamera() {
    try {
        return !!(isNativeApp()
            && window.RotaFlowCap
            && typeof window.RotaFlowCap.openMultiCamera === 'function');
    } catch (_) {
        return false;
    }
}

function canUseGetUserMediaMulti() {
    try {
        // Never use getUserMedia multi on native + Google Maps — fights the same layer.
        if (isNativeApp()) return false;
        return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    } catch (_) {
        return false;
    }
}

function canUseInAppMultiCamera() {
    return canUseNativeMultiCamera() || canUseGetUserMediaMulti();
}

async function ensureNativeCameraPermission() {
    const Cam = window.RotaFlowCap && window.RotaFlowCap.Camera;
    if (!Cam || typeof Cam.requestPermissions !== 'function') return true;
    try {
        const cur = typeof Cam.checkPermissions === 'function' ? await Cam.checkPermissions() : null;
        if (cur && (cur.camera === 'granted' || cur.camera === 'limited')) return true;
        const next = await Cam.requestPermissions({ permissions: ['camera'] });
        return !!(next && (next.camera === 'granted' || next.camera === 'limited'));
    } catch (e) {
        console.warn('camera permission', e);
        return false;
    }
}

/**
 * Captura um frame do <video> já no tamanho final (JPEG), sem data URL gigante.
 * @param {HTMLVideoElement} video
 * @returns {Promise<string|null>}
 */
async function captureVideoFrameToJpegDataUrl(video) {
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return null;
    const scale = Math.min(1, PHOTO_MULTICAM_MAX_SIDE / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    await yieldToUiFrame();
    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_MULTICAM_JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl && dataUrl.startsWith('data:') ? dataUrl : null;
}

/**
 * Multi-foto no Android: Activity CameraX dedicada (não partilha surface com o mapa).
 * @param {{ maxPhotos?: number, onCapture?: function }} opts
 * @returns {Promise<string[]>} fotos (vazio se cancelar)
 */
async function openNativeMultiCameraCapture(opts = {}) {
    const maxPhotos = Math.max(1, Math.min(PHOTO_MAX_PER_ITEM, Number(opts.maxPhotos) || PHOTO_MAX_PER_ITEM));
    const ok = await ensureNativeCameraPermission();
    if (!ok) {
        showToast('Permissão da câmera necessária', true);
        return [];
    }
    if (!window.RotaFlowCap || typeof window.RotaFlowCap.openMultiCamera !== 'function') {
        return [];
    }
    showToast('Abrindo câmera…');
    // Bridge already compresses multi-cam to PHOTO_MULTICAM_* — do not recompress here.
    // onPhoto: anexar/guardar cada JPEG assim que ficar pronto (não só no buffer final).
    const multi = await window.RotaFlowCap.openMultiCamera({
        maxPhotos,
        onPhoto: typeof opts.onPhoto === 'function' ? opts.onPhoto : null
    });
    try { recoverUiAfterResume(); } catch (_) {}
    const list = Array.isArray(multi) ? multi : [];
    if (list.length && typeof opts.onCapture === 'function') {
        try { opts.onCapture(list[0], list.length); } catch (_) {}
    }
    return list;
}

/**
 * UI fullscreen web: várias fotos via getUserMedia (só PWA/browser — nunca no Android nativo).
 * @param {{ maxPhotos?: number, onCapture?: function }} opts
 * @returns {Promise<string[]|null>} array (incl. vazio se cancelar) ou null se preview indisponível
 */
function openMultiCameraCapture(opts = {}) {
    const maxPhotos = Math.max(1, Math.min(PHOTO_MAX_PER_ITEM, Number(opts.maxPhotos) || PHOTO_MAX_PER_ITEM));
    return new Promise(async (resolve) => {
        let settled = false;
        let stream = null;
        const captured = [];
        const thumbUrls = [];

        const root = document.createElement('div');
        root.className = 'rf-multicam';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Câmera');
        root.innerHTML = `
            <div class="rf-multicam-video-wrap">
                <video playsinline muted autoplay></video>
                <div class="rf-multicam-flash" aria-hidden="true"></div>
                <div class="rf-multicam-top">
                    <button type="button" class="rf-multicam-cancel">Cancelar</button>
                    <span class="rf-multicam-count">0 fotos</span>
                </div>
            </div>
            <div class="rf-multicam-bottom">
                <div class="rf-multicam-side">
                    <div class="rf-multicam-thumbs" aria-live="polite"></div>
                </div>
                <button type="button" class="rf-multicam-shutter" aria-label="Disparar"></button>
                <div class="rf-multicam-side right">
                    <button type="button" class="rf-multicam-done" disabled>Concluir</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        const video = root.querySelector('video');
        const flash = root.querySelector('.rf-multicam-flash');
        const countEl = root.querySelector('.rf-multicam-count');
        const thumbsEl = root.querySelector('.rf-multicam-thumbs');
        const shutterBtn = root.querySelector('.rf-multicam-shutter');
        const doneBtn = root.querySelector('.rf-multicam-done');
        const cancelBtn = root.querySelector('.rf-multicam-cancel');

        const updateUi = () => {
            const n = captured.length;
            countEl.textContent = n === 1 ? '1 foto' : `${n} fotos`;
            doneBtn.disabled = n < 1;
            shutterBtn.disabled = n >= maxPhotos;
            if (n >= maxPhotos) {
                countEl.textContent = `${n} fotos (máx.)`;
            }
        };

        const cleanup = async () => {
            try {
                if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
            } catch (_) {}
            stream = null;
            thumbUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
            thumbUrls.length = 0;
            try { root.remove(); } catch (_) {}
        };

        const finish = async (urls, unavailable) => {
            if (settled) return;
            settled = true;
            await cleanup();
            if (unavailable) resolve(null);
            else resolve(Array.isArray(urls) ? urls : []);
        };

        const appendThumb = async (dataUrl) => {
            try {
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const tu = URL.createObjectURL(blob);
                thumbUrls.push(tu);
                const img = document.createElement('img');
                img.src = tu;
                img.alt = '';
                thumbsEl.appendChild(img);
                thumbsEl.scrollLeft = thumbsEl.scrollWidth;
            } catch (_) {}
        };

        let lastWebShutterAt = 0;
        let captureChain = Promise.resolve();
        const fireShutter = async () => {
            if (settled || shutterBtn.disabled || shutterBtn.classList.contains('busy')) return;
            const now = Date.now();
            if (now - lastWebShutterAt < 650) return;
            if (!video.videoWidth) {
                showToast('Aguarde a câmera…', true);
                return;
            }
            lastWebShutterAt = now;
            shutterBtn.classList.add('busy');
            shutterBtn.disabled = true;
            doneBtn.disabled = true;
            flash.classList.add('on');
            setTimeout(() => flash.classList.remove('on'), 90);
            const op = (async () => {
                try {
                    const dataUrl = await enqueuePhotoOp(() => captureVideoFrameToJpegDataUrl(video));
                    if (!dataUrl) throw new Error('capture');
                    captured.push(dataUrl);
                    await appendThumb(dataUrl);
                    // Await: senão Concluir pode devolver a lista antes do onPhoto gravar → batch salva de novo.
                    if (typeof opts.onCapture === 'function') {
                        try { await opts.onCapture(dataUrl, captured.length); } catch (_) {}
                    }
                } catch (e) {
                    console.warn('multi cam capture', e);
                    showToast('Não foi possível capturar', true);
                } finally {
                    shutterBtn.classList.remove('busy');
                    updateUi();
                }
            })();
            captureChain = captureChain.then(() => op, () => op);
            await op;
        };
        // Só pointerup dispara; click só engole o evento sintético (evita 2 disparos em alguns WebViews).
        shutterBtn.addEventListener('pointerup', (e) => {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            fireShutter();
        });
        shutterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        cancelBtn.addEventListener('click', () => { finish([]); });
        doneBtn.addEventListener('click', async () => {
            doneBtn.disabled = true;
            try { await captureChain; } catch (_) {}
            if (settled) return;
            finish(captured.slice());
        });

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 960 }
                }
            });
            video.srcObject = stream;
            try { await video.play(); } catch (_) {}
            updateUi();
        } catch (e) {
            console.warn('multi-cam start', e);
            await finish(null, true);
        }
    });
}

/**
 * Câmera/galeria: multi-foto in-app (câmera) ou nativa/file (galeria / fallback).
 * @param {'camera'|'gallery'} mode
 * @param {{ multiple?: boolean, fileInput?: HTMLInputElement|null, pendingTarget?: object|null, alreadyCompressed?: boolean, onPreview?: (previewUrl: string)=>void, onPhoto?: (dataUrl: string, n: number, total?: number)=>void|Promise<void>, maxPhotos?: number }} opts
 * @returns {Promise<string[]>} data URLs JPEG
 */
async function pickPhotoDataUrls(mode, opts = {}) {
    const { fileInput = null, pendingTarget = null, onPreview = null, onPhoto = null } = opts;
    const maxPhotos = Math.max(1, Math.min(
        PHOTO_MAX_PER_ITEM,
        Number(opts.maxPhotos) || (opts.multiple ? 12 : PHOTO_MAX_PER_ITEM)
    ));
    if (pendingTarget) setPendingPhotoTarget(pendingTarget);
    // Não bloquear a abertura da câmera com flush síncrono do localStorage.
    // O alvo da foto já está em sessionStorage; o flush roda em seguida.
    setTimeout(() => { try { persistStorageNow(); } catch (_) {} }, 0);

    // Preferência multi: Android = Activity CameraX própria (mapa nativo intacto).
    // Web = getUserMedia in-app. Nunca CameraPreview toBack com Google Maps nativo.
    if (mode === 'camera' && canUseInAppMultiCamera() && maxPhotos > 0) {
        try {
            if (canUseNativeMultiCamera()) {
                const multi = await openNativeMultiCameraCapture({
                    maxPhotos,
                    onPhoto,
                    onCapture: (dataUrl, n) => {
                        if (n === 1 && typeof onPreview === 'function') {
                            try { onPreview(dataUrl); } catch (_) {}
                        }
                    }
                });
                clearPendingPhotoTarget();
                return Array.isArray(multi) ? multi : [];
            }
            showToast('Abrindo câmera…');
            const multi = await openMultiCameraCapture({
                maxPhotos,
                onCapture: async (dataUrl, n) => {
                    if (n === 1 && typeof onPreview === 'function') {
                        try { onPreview(dataUrl); } catch (_) {}
                    }
                    if (typeof onPhoto === 'function') {
                        try { await onPhoto(dataUrl, n); } catch (_) {}
                    }
                }
            });
            if (multi === null) {
                showToast('Câmera multi indisponível — 1 foto', true);
                // fallback single-shot abaixo
            } else {
                clearPendingPhotoTarget();
                return multi;
            }
        } catch (e) {
            console.warn('multi camera', e);
            const msg = String(e?.message || e || '');
            if (msg.includes('multi-cam-compress-failed')) {
                showToast('Não foi possível processar as fotos', true);
                clearPendingPhotoTarget();
                return [];
            }
            showToast('Câmera multi indisponível — 1 foto', true);
        }
    }

    if (isNativeApp() && window.RotaFlowCap) {
        try {
            showToast(mode === 'gallery' ? 'Abrindo galeria…' : 'Abrindo câmera…');
            const source = mode === 'gallery' ? 'photos' : 'camera';
            let raw = null;
            // Preferir captura Uri rápida + compressão async (UI otimista via webPath).
            if (typeof window.RotaFlowCap.getPhotoCapture === 'function'
                && typeof window.RotaFlowCap.photoResultToDataUrl === 'function') {
                const photo = await window.RotaFlowCap.getPhotoCapture(source);
                clearPendingPhotoTarget();
                if (!photo) return [];
                if (photo.webPath && typeof onPreview === 'function') {
                    try { onPreview(photo.webPath); } catch (_) {}
                }
                raw = await enqueuePhotoOp(() => window.RotaFlowCap.photoResultToDataUrl(photo));
            } else if (typeof window.RotaFlowCap.getPhotoDataUrl === 'function') {
                raw = await window.RotaFlowCap.getPhotoDataUrl(source);
                clearPendingPhotoTarget();
            } else {
                raw = null;
                clearPendingPhotoTarget();
            }
            if (!raw) return [];
            if (typeof raw === 'string' && raw.startsWith('data:')) return [raw];
            showToast('Otimizando foto…');
            return [await enqueuePhotoOp(() => compressDataUrl(raw))];
        } catch (e) {
            if (isPhotoPickCancelled(e)) {
                clearPendingPhotoTarget();
                return [];
            }
            console.warn('native photo', e);
            if (!fileInput) {
                clearPendingPhotoTarget();
                showToast('Não foi possível abrir a câmera', true);
                return [];
            }
        }
    }
    if (!fileInput) {
        clearPendingPhotoTarget();
        return [];
    }
    return new Promise((resolve) => {
        const onChange = async () => {
            const files = fileInput.files ? Array.from(fileInput.files) : [];
            fileInput.value = '';
            clearPendingPhotoTarget();
            const out = [];
            const limit = opts.multiple
                ? Math.min(files.length, maxPhotos, 12)
                : Math.min(files.length, 1);
            for (let i = 0; i < limit; i++) {
                const file = files[i];
                if (!file || !file.type.startsWith('image/')) continue;
                try {
                    if (i === 0 && typeof onPreview === 'function') {
                        try { onPreview(URL.createObjectURL(file)); } catch (_) {}
                    }
                    out.push(await enqueuePhotoOp(() => compressImageFile(file)));
                } catch (_) {}
            }
            resolve(out);
        };
        fileInput.addEventListener('change', onChange, { once: true });
        fileInput.click();
    });
}

const recentPhotoSaveKeys = new Map();
const inflightPhotoSaves = new Set();
const PHOTO_SAVE_DEDUPE_MS = 15000;

function pruneRecentPhotoSaves(now = Date.now()) {
    if (recentPhotoSaveKeys.size < 64) return;
    for (const [k, t] of recentPhotoSaveKeys) {
        if (now - t > PHOTO_SAVE_DEDUPE_MS) recentPhotoSaveKeys.delete(k);
    }
}

function isDuplicatePhotoSave(scopeKey, dataUrl) {
    const fp = photoFingerprint(dataUrl);
    if (!fp) return true;
    const key = `${scopeKey}::${fp}`;
    const now = Date.now();
    pruneRecentPhotoSaves(now);
    const prev = recentPhotoSaveKeys.get(key);
    return !!(prev && now - prev < PHOTO_SAVE_DEDUPE_MS);
}

function markPhotoSaved(scopeKey, dataUrl) {
    const fp = photoFingerprint(dataUrl);
    if (!fp) return;
    recentPhotoSaveKeys.set(`${scopeKey}::${fp}`, Date.now());
}

async function addPhotoDataUrlToItem(item, dataUrl) {
    if (!item || !dataUrl) return null;
    if (!Array.isArray(item.photos)) item.photos = [];
    if (!Array.isArray(item.photoIds)) item.photoIds = [];
    if (item.photoIds.length >= PHOTO_MAX_PER_ITEM) {
        throw new Error('photo-limit');
    }
    const scope = itemPhotoScope(item);
    const fp = photoFingerprint(dataUrl);
    const lockKey = `${scope}::${fp}`;
    if (inflightPhotoSaves.has(lockKey) || isDuplicatePhotoSave(scope, dataUrl)) return null;
    if (item.photos.includes(dataUrl)) return null;
    if (fp && item.photos.some((p) => photoFingerprint(p) === fp)) return null;

    inflightPhotoSaves.add(lockKey);
    try {
        const photoId = await persistPhotoDataUrl(dataUrl);
        // Se só havia thumb parcial, hidrata completo depois via ensureItemPhotos.
        if (item.photos.length && item.photoIds.length > item.photos.length) {
            for (const u of item.photos) revokeDisplayUrl(u);
            item.photos = [];
        }
        // Exibe via blob: (revogável) em vez de manter data URL gigante na RAM.
        let display = await idbGetPhoto(photoId);
        if (!display) display = dataUrl;
        item.photos.push(display);
        item.photoIds.push(photoId);
        markPhotoSaved(scope, dataUrl);
        return photoId;
    } finally {
        inflightPhotoSaves.delete(lockKey);
    }
}

async function persistPhotoDataUrl(dataUrl) {
    const id = newPhotoId();
    // Grava Blob no IDB (não data URL) — menos pressão de memória no WebView.
    await idbPutPhoto(id, dataUrl);
    return id;
}

/**
 * @param {object} item
 * @param {{ maxPhotos?: number }} [opts] maxPhotos=1 para thumbs da lista (economiza RAM)
 */
async function hydrateItemPhotos(item, opts = {}) {
    if (!item) return item;
    if (!Array.isArray(item.photoIds)) item.photoIds = [];
    if (!Array.isArray(item.photos)) item.photos = [];
    const maxPhotos = Number.isFinite(opts.maxPhotos) ? Math.max(0, opts.maxPhotos) : null;

    // Migração legado: data URLs sem photoIds → IndexedDB (só ids vão para localStorage).
    if (!item.photoIds.length && item.photos.some(p => typeof p === 'string' && p.startsWith('data:'))) {
        const ids = [];
        const urls = [];
        for (const p of item.photos) {
            if (typeof p === 'string' && p.startsWith('data:')) {
                ids.push(await persistPhotoDataUrl(p));
                urls.push(p);
            }
        }
        item.photoIds = ids;
        item.photos = maxPhotos != null ? urls.slice(0, maxPhotos) : urls;
        return item;
    }

    const idsAll = slicePhotoIdsForHydrate(item.photoIds, maxPhotos);
    const want = idsAll.length;
    if (want > 0 && item.photos.length < want) {
        for (const u of item.photos) revokeDisplayUrl(u);
        const urls = [];
        for (const id of idsAll) {
            const url = await idbGetPhoto(id);
            if (url) urls.push(url);
            await yieldToUiFrame();
        }
        item.photos = urls;
    }
    return item;
}

/** Não hidrata tudo de uma vez — só migração legado / uso pontual. */
async function hydrateAllPhotos() {
    // Preferir hydrate sob demanda (painel / thumbs). Migração idle cobre data URLs legadas.
    scheduleBackgroundPhotoMigrate();
    scheduleListPhotoHydration();
}

async function ensureItemPhotos(item) {
    if (!item) return item;
    try {
        if (!Array.isArray(item.photoIds)) item.photoIds = [];
        if (!Array.isArray(item.photos)) item.photos = [];
        const incomplete = item.photoIds.length > 0 && item.photos.length < item.photoIds.length;
        const legacyData = item.photos.some(p => typeof p === 'string' && p.startsWith('data:')) && !item.photoIds.length;
        if (incomplete || legacyData || (!item.photos.length && item.photoIds.length)) {
            await hydrateItemPhotos(item);
        }
        if (!item.photos) item.photos = [];
    } catch (e) {
        console.warn('ensureItemPhotos', e);
        if (!item.photos) item.photos = [];
        if (!item.photoIds) item.photoIds = [];
    }
    return item;
}

async function applyRestoredCameraPhoto(photoData) {
    const pending = getPendingPhotoTarget();
    clearPendingPhotoTarget();
    if (!pending || !photoData) return false;
    let dataUrl = null;
    try {
        if (window.RotaFlowCap && typeof window.RotaFlowCap.photoResultToDataUrl === 'function') {
            dataUrl = await window.RotaFlowCap.photoResultToDataUrl(photoData);
        } else if (photoData.dataUrl) {
            dataUrl = await compressDataUrl(photoData.dataUrl);
        } else if (photoData.webPath) {
            dataUrl = await compressDataUrl(photoData.webPath);
        }
    } catch (e) {
        console.warn('restored photo compress', e);
        return false;
    }
    if (!dataUrl) return false;

    try {
        if (pending.kind === 'delivery' && pending.sequentialId != null) {
            const delivery = deliveries.find(d => d.sequentialId === pending.sequentialId);
            if (!delivery) return false;
            await addPhotoDataUrlToItem(delivery, dataUrl);
            persistStorageNow();
            if (currentSelectedDelivery && currentSelectedDelivery.sequentialId === delivery.sequentialId) {
                refreshPanelPhotos(delivery);
            }
            renderDeliveriesList();
            showToast('Foto recuperada após reinício do app');
            return true;
        }
        if (pending.kind === 'agenda' && pending.agendaId != null) {
            const item = agenda.find(a => a.agendaId === pending.agendaId);
            if (!item) return false;
            await addPhotoDataUrlToItem(item, dataUrl);
            persistStorageNow();
            renderAgendaList();
            showToast('Foto recuperada após reinício do app');
            return true;
        }
        if (pending.kind === 'edit-delivery' || pending.kind === 'edit-agenda') {
            // Modais de edição não sobrevivem ao kill — salva na entrega/agenda se possível.
            if (pending.sequentialId != null) {
                const delivery = deliveries.find(d => d.sequentialId === pending.sequentialId);
                if (delivery) {
                    await addPhotoDataUrlToItem(delivery, dataUrl);
                    persistStorageNow();
                    renderDeliveriesList();
                    showToast('Foto salva na entrega após reinício');
                    return true;
                }
            }
            if (pending.agendaId != null) {
                const item = agenda.find(a => a.agendaId === pending.agendaId);
                if (item) {
                    await addPhotoDataUrlToItem(item, dataUrl);
                    persistStorageNow();
                    renderAgendaList();
                    showToast('Foto salva na agenda após reinício');
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('applyRestoredCameraPhoto', e);
        showToast('Não foi possível recuperar a foto', true);
    }
    return false;
}

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

let photoMigrateQueued = false;
function scheduleBackgroundPhotoMigrate() {
    if (photoMigrateQueued) return;
    photoMigrateQueued = true;
    const run = async () => {
        try {
            // Só migra base64 legado → IndexedDB, sem forçar tudo na UI.
            for (const d of deliveries) {
                if (Array.isArray(d.photos) && d.photos.some(p => typeof p === 'string' && p.startsWith('data:'))) {
                    await hydrateItemPhotos(d);
                }
            }
            syncActiveRouteIntoRoutes();
            for (const r of routes) {
                if (!r || r.id === activeRouteId) continue;
                for (const d of (r.deliveries || [])) {
                    if (Array.isArray(d.photos) && d.photos.some(p => typeof p === 'string' && p.startsWith('data:'))) {
                        await hydrateItemPhotos(d);
                    }
                }
            }
            for (const a of agenda) {
                if (Array.isArray(a.photos) && a.photos.some(p => typeof p === 'string' && p.startsWith('data:'))) {
                    await hydrateItemPhotos(a);
                }
            }
            persistStorageNow();
        } catch (e) {}
        photoMigrateQueued = false;
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { run(); }, { timeout: 2500 });
    else setTimeout(run, 600);
}

let listPhotoHydrateTimer = null;
async function hydrateAgendaListPhotos() {
    let needsRender = false;
    for (const a of agenda) {
        const hasIds = Array.isArray(a.photoIds) && a.photoIds.length;
        const hasUrls = Array.isArray(a.photos) && a.photos.length;
        // Só a 1ª foto para thumb da lista — evita carregar dezenas de data URLs na RAM.
        if (hasIds && !hasUrls) {
            await hydrateItemPhotos(a, { maxPhotos: 1 });
            needsRender = true;
        }
    }
    if (needsRender) renderAgendaList();
}
function scheduleListPhotoHydration() {
    // Entregas: fotos sob demanda no painel. Agenda: hidrata thumbs (lista menor).
    clearTimeout(listPhotoHydrateTimer);
    listPhotoHydrateTimer = setTimeout(() => {
        hydrateAgendaListPhotos().catch(() => {});
    }, 350);
}

// ========== ROTAS MÚLTIPLAS ==========
function nextRouteName() {
    let max = 0;
    for (const r of routes) {
        const m = /^Rota\s+(\d+)$/i.exec(String(r.name || '').trim());
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `Rota ${max + 1}`;
}

function createEmptyRoute(name) {
    return {
        id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: name || nextRouteName(),
        deliveries: [],
        nextSequenceNumber: 1,
        routeActive: false,
        routeMetrics: null,
        createdAt: Date.now()
    };
}

function migrateDeliveryFields(d) {
    migrateTelefones(d); migrateFavorito(d);
    if (d.pacotes === undefined) d.pacotes = 1;
    if (d.savedToAgenda === undefined) d.savedToAgenda = false;
    if (!d.photos) d.photos = [];
    if (!d.photoIds) d.photoIds = [];
    if (d.notes === undefined) d.notes = '';
    normalizeDeliveryCoords(d);
}

function normalizeRouteRecord(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const deliveriesList = Array.isArray(r.deliveries) ? r.deliveries : [];
    deliveriesList.forEach(migrateDeliveryFields);
    return {
        id: r.id || `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: r.name || 'Rota 1',
        deliveries: deliveriesList,
        nextSequenceNumber: r.nextSequenceNumber || (deliveriesList.length + 1),
        routeActive: !!r.routeActive,
        routeMetrics: r.routeMetrics || null,
        createdAt: r.createdAt || Date.now()
    };
}

/** Espelha a rota ativa (deliveries em memória) de volta no array `routes`. */
function syncActiveRouteIntoRoutes() {
    if (!routes.length) {
        const boot = createEmptyRoute('Rota 1');
        boot.deliveries = deliveries;
        boot.nextSequenceNumber = nextSequenceNumber;
        boot.routeActive = !!routeActive;
        boot.routeMetrics = routeMetrics;
        routes = [boot];
        activeRouteId = boot.id;
        return;
    }
    let active = routes.find(r => r.id === activeRouteId);
    if (!active) {
        active = routes[0];
        activeRouteId = active.id;
    }
    active.deliveries = deliveries;
    active.nextSequenceNumber = nextSequenceNumber;
    active.routeActive = !!routeActive;
    active.routeMetrics = routeMetrics;
}

function clearMapRouteLines() {
    // Overlay Directions vive em routing.js; a linha azul não é desenhada no mapa.
}

function applyLoadedRouteState(route, { refreshMap = true } = {}) {
    activeRouteId = route.id;
    deliveries = route.deliveries || [];
    nextSequenceNumber = route.nextSequenceNumber || (deliveries.length + 1);
    routeActive = !!route.routeActive;
    routeMetrics = route.routeMetrics || null;
    seedIdCounter();
    closeDeliveryPanel();
    clearActiveStopNotification();
    clearMapRouteLines();
    if (refreshMap) {
        rebuildMarkers(false);
        if (routeActive) scheduleRouteRefresh();
        else {
            updateOptimizeFabVisibility();
            updateProgressAndEstimates();
        }
    }
    renderDeliveriesList();
    renderRouteSwitcher();
    updateLastIdDisplay(deliveries.length ? deliveries[deliveries.length - 1].sequentialId : null);
    updateDaySummary();
}

/** Aceita o schema atual (`routes[]`) e o antigo (só `deliveries`) — ver lib/persist-helpers.js. */
function hydrateRoutesFromData(data) {
    const state = hydrateRoutesState(data, {
        migrateDeliveryFields,
        normalizeRouteRecord,
        createEmptyRoute
    });
    routes = state.routes;
    activeRouteId = state.activeRouteId;
    deliveries = state.deliveries;
    nextSequenceNumber = state.nextSequenceNumber;
    routeActive = state.routeActive;
    routeMetrics = state.routeMetrics;
}

function renderRouteSwitcher() {
    const el = document.getElementById('routeSwitcher');
    if (!el) return;
    if (routes.length <= 1) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    el.hidden = false;
    el.innerHTML = routes.map(r => {
        const count = (r.id === activeRouteId ? deliveries : (r.deliveries || [])).length;
        const active = r.id === activeRouteId;
        return `<button type="button" class="route-chip${active ? ' is-active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" data-route-id="${escapeHtml(r.id)}" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}<span class="route-chip-count">${count}</span></button>`;
    }).join('');
    el.querySelectorAll('[data-route-id]').forEach(btn => {
        btn.addEventListener('click', () => switchToRoute(btn.getAttribute('data-route-id')));
    });
}

function switchToRoute(routeId) {
    if (!routeId || routeId === activeRouteId) return;
    const target = routes.find(r => r.id === routeId);
    if (!target) return;
    syncActiveRouteIntoRoutes();
    applyLoadedRouteState(target);
    persistStorageNow();
    showToast(`Alternado para ${target.name}`);
}

function persistStorageNow() {
    if (!authReady || !currentUser) return false;
    try {
        syncActiveRouteIntoRoutes();
        // Só `routes[]` — o espelho `deliveries` saiu; dados antigos migram em hydrateRoutesFromData.
        const payload = buildPersistPayload({ routes, activeRouteId, nextSequenceNumber, agenda, nextAgendaId });
        localStorage.setItem(storageKey('data'), JSON.stringify(payload.data));
        localStorage.setItem(storageKey('agenda'), JSON.stringify(payload.agenda));
        localStorage.setItem(storageKey('profile'), JSON.stringify(userProfile));
        localStorage.setItem(storageKey('updatedAt'), String(Date.now()));
        if (storageFull) {
            storageFull = false;
            showToast("Espaço liberado. Dados salvos com sucesso");
        }
        return true;
    } catch (e) {
        if (!storageFull) {
            storageFull = true;
            showToast("Armazenamento insuficiente. Remova dados antigos ou faça um backup", true);
        }
        return false;
    }
}
function saveStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistStorageNow, 80);
}

function configureExtractedModules() {
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
        getAuthReady: () => authReady,
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
        getUserProfile: () => userProfile,
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
    configureHistory({
        getDeliveries: () => deliveries,
        setDeliveries: (next) => { deliveries = Array.isArray(next) ? next : []; },
        getNextSequenceNumber: () => nextSequenceNumber,
        setNextSequenceNumber: (n) => { nextSequenceNumber = n; },
        setRouteActive: (v) => { routeActive = !!v; },
        setRouteMetrics: (m) => { routeMetrics = m; },
        getAuthReady: () => authReady,
        getCurrentUser: () => currentUser,
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
        switchSidebarTab,
        syncActiveRouteIntoRoutes,
        createEmptyRoute,
        applyLoadedRouteState,
        getRoutes: () => routes,
        getActiveRouteId: () => activeRouteId
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
        getUserProfile: () => userProfile,
        setUserProfile: (p) => { if (p) userProfile = p; },
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
        getAuthReady: () => authReady,
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

async function loadStorage() {
    deliveries = [];
    agenda = [];
    routes = [];
    activeRouteId = null;
    nextSequenceNumber = 1;
    nextAgendaId = 1;
    routeActive = false;
    routeMetrics = null;

    if (currentUid() === 'guest' || (currentUser && currentUser.provider === 'local')) {
        if (!localStorage.getItem(storageKey('data')) && localStorage.getItem('rotaflow_data')) {
            localStorage.setItem(storageKey('data'), localStorage.getItem('rotaflow_data'));
            if (localStorage.getItem('rotaflow_agenda')) localStorage.setItem(storageKey('agenda'), localStorage.getItem('rotaflow_agenda'));
            if (localStorage.getItem('rotaflow_profile')) localStorage.setItem(storageKey('profile'), localStorage.getItem('rotaflow_profile'));
        }
    }

    const saved = localStorage.getItem(storageKey('data'));
    if (saved) {
        try {
            const data = JSON.parse(saved);
            hydrateRoutesFromData(data);
        } catch (e) {
            hydrateRoutesFromData({});
        }
    } else {
        hydrateRoutesFromData({});
    }
    const savedAgenda = localStorage.getItem(storageKey('agenda'));
    if (savedAgenda) {
        try {
            const data = JSON.parse(savedAgenda);
            agenda = data.agenda || [];
            agenda.forEach(a => {
                migrateTelefones(a); migrateFavorito(a);
                if (a.pacotes === undefined) a.pacotes = 1;
                if (!a.photos) a.photos = [];
                if (!a.photoIds) a.photoIds = [];
                if (a.notes === undefined) a.notes = '';
                normalizeDeliveryCoords(a);
            });
            nextAgendaId = data.nextAgendaId || 1;
        } catch (e) {}
    }
    const savedProfile = localStorage.getItem(storageKey('profile'));
    if (savedProfile) { try { userProfile = JSON.parse(savedProfile); } catch (e) {} }

    if (!userProfile.empresa || !String(userProfile.empresa).trim()) {
        userProfile.empresa = EMPRESA_PADRAO;
    }

    // Mensagem WhatsApp: template completo (sem km/ETA). Migra saudação curta e templates antigos.
    if (userProfile.mensagemPadrao) {
        const beforeMsg = userProfile.mensagemPadrao;
        const alreadyNew = /Estamos chegando em breve/.test(beforeMsg) && /\{endereco\}/.test(beforeMsg) && /\{link\}/.test(beforeMsg);
        const looksShort =
            /Acompanhe sua entrega/.test(beforeMsg) || /em tempo real/.test(beforeMsg);
        const looksLegacy =
            /\{km\}|\{min\}|Faltam cerca de/.test(beforeMsg) ||
            (/Sua encomenda \(/.test(beforeMsg) && !alreadyNew);
        if (!alreadyNew && (looksShort || looksLegacy || !beforeMsg.trim())) {
            userProfile.mensagemPadrao = MENSAGEM_WHATSAPP_PADRAO;
        } else if (!alreadyNew) {
            userProfile.mensagemPadrao = beforeMsg
                .replace(/\n?⏱\s*Faltam cerca de[^\n]*/g, '')
                .replace(/\n?[^\n]*\{km\}[^\n]*/g, '')
                .replace(/\n?[^\n]*\{min\}[^\n]*/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
            if (!/\{link\}/.test(userProfile.mensagemPadrao)) {
                userProfile.mensagemPadrao = userProfile.mensagemPadrao.replace(/\s*$/, '\n{link}');
            }
        }
        // Migra "📦 Correx express" hardcoded → {empresa}
        if (/📦\s*Correx express/i.test(userProfile.mensagemPadrao) && !/\{empresa\}/.test(userProfile.mensagemPadrao)) {
            userProfile.mensagemPadrao = userProfile.mensagemPadrao.replace(/📦\s*Correx express/gi, '📦 {empresa}');
        }
        if (userProfile.mensagemPadrao !== beforeMsg) {
            try { localStorage.setItem(storageKey('profile'), JSON.stringify(userProfile)); } catch (e) {}
        }
    } else {
        userProfile.mensagemPadrao = MENSAGEM_WHATSAPP_PADRAO;
        try { localStorage.setItem(storageKey('profile'), JSON.stringify(userProfile)); } catch (e) {}
    }

    // Fotos sob demanda (painel/lista), não no boot.
    scheduleBackgroundPhotoMigrate();
    loadHistory();
    // Housekeeping IDB em idle: órfãs + fotos de rotas finalizadas > TTL (30d).
    scheduleOrphanPhotoPrune();
    persistStorageNow();

    seedIdCounter();
    document.getElementById("agendaCountBadge").innerHTML = agenda.length;
    updateDeliveryStats();
    renderDeliveriesList();
    renderRouteSwitcher();
    renderAgendaList();
    renderHistoryList();
    scheduleListPhotoHydration();
    storageLoadedUid = currentUid();
    refreshMapAfterStorageLoad();
}

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
    const name = userProfile && String(userProfile.empresa || '').trim();
    return name || EMPRESA_PADRAO;
}

function buildDeliveryWhatsAppMessage(delivery, opts = {}) {
    const trackUrl = opts.trackUrl || '';
    const nome = opts.nome != null ? opts.nome : (delivery.nome || 'cliente');
    const empresa = opts.empresa != null ? opts.empresa : companyDisplayName();
    const template = (userProfile && userProfile.mensagemPadrao) || MENSAGEM_WHATSAPP_PADRAO;
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

// ========== RENDERIZAÇÃO DA LISTA DE ENTREGAS ==========
let renderDeliveriesQueued = false;
function renderDeliveriesList() {
    if (renderDeliveriesQueued) return;
    renderDeliveriesQueued = true;
    requestAnimationFrame(() => {
        renderDeliveriesQueued = false;
        renderDeliveriesListNow();
    });
}

const DELIVERY_LIST_FULL_RENDER_MAX = 40;
const DELIVERY_LIST_ROW_EST = 168;
const DELIVERY_LIST_BUFFER = 6;
let deliveryListVirtual = { filtered: [], start: -1, end: -1, scrollBound: false };

function getDeliveryListScrollParent(container) {
    return container?.closest('.sidebar-panel') || container;
}

function buildDeliveryListItemHtml(del) {
    const statusLabel = { pendente: "Pendente", "em-rota": "Em rota", entregue: "Entregue", falhou: "Falhou" }[del.status] || del.status;
    let statusClass = `status-${del.status}`;
    let statusText = statusLabel;
    if (del.voltarDepois && del.status !== 'entregue' && del.status !== 'falhou') {
        statusText = 'Voltar depois';
        statusClass = 'status-voltar-depois';
    } else if (del.status === 'falhou' && del.failReason) {
        statusText = FAIL_REASON_LABELS[del.failReason] || 'Falhou';
    }

    const phonesDisplay = (del.telefones && del.telefones.length)
        ? `<div class="delivery-body-line"><i class="fas fa-phone-alt"></i>${escapeHtml(del.telefones.map(p => (p.label ? p.label + ': ' : '') + formatPhoneShort(p.numero)).join(', '))}</div>`
        : '';
    const hasPhone = !!(del.telefones && del.telefones.length);
    const photoCount = (del.photoIds && del.photoIds.length) || (del.photos && del.photos.length) || 0;
    const metaParts = [];
    if (del.routeOrder && del.status !== 'entregue' && del.status !== 'falhou') {
        metaParts.push(`<span class="route-order" title="Ordem na rota">${del.routeOrder}º</span>`);
    }
    if (photoCount) metaParts.push(`<span title="Fotos"><i class="fas fa-camera"></i>${photoCount}</span>`);
    if (del.savedToAgenda) metaParts.push(`<span title="Na agenda"><i class="fas fa-book"></i></span>`);
    const metaHtml = metaParts.length ? `<div class="delivery-meta">${metaParts.join('')}</div>` : '';
    const legHtml = (del.legMeters === undefined || del.status === 'entregue' || del.status === 'falhou') ? '' :
        `<div class="leg-info"><i class="fas fa-car"></i> ${formatKm(del.legMeters)} · ${formatDuration(del.legSeconds)}</div>`;

    return `<div class="delivery-item" data-id="${escapeHtml(del.id)}">
                    <div class="delivery-header">
                        <div class="delivery-title-row">
                            <span class="delivery-id">${escapeHtml(del.sequentialId)}</span>
                            <button type="button" class="fav-btn ${del.favorito ? 'active' : ''}" data-action="fav" data-id="${escapeHtml(del.id)}" title="Favorito" aria-label="Favorito"><i class="fas fa-star"></i></button>
                            <strong>${escapeHtml(del.nome)}</strong>
                        </div>
                        <span class="status-badge ${escapeHtml(statusClass)}">${escapeHtml(statusText)}</span>
                    </div>
                    ${metaHtml}
                    <div class="delivery-body-line"><i class="fas fa-location-dot"></i>${escapeHtml(del.endereco)}</div>
                    ${legHtml}
                    ${phonesDisplay}
                    <div class="delivery-links">${hasPhone ? '<a href="#" class="whatsapp-link" data-action="whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>' : ''}<a href="#" class="track-link" data-action="track"><i class="fas fa-map-location-dot"></i> Rastreio</a></div>
                    ${del.notes ? `<div class="delivery-body-line"><i class="fas fa-pen"></i>${escapeHtml(del.notes)}</div>` : ''}
                    <div class="delivery-actions">
                        <select class="select-status" data-action="status" data-id="${escapeHtml(del.id)}" aria-label="Status da entrega">
                            <option value="pendente" ${del.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                            <option value="em-rota" ${del.status === 'em-rota' ? 'selected' : ''}>Em rota</option>
                            <option value="entregue" ${del.status === 'entregue' ? 'selected' : ''}>Entregue</option>
                            <option value="falhou" ${del.status === 'falhou' ? 'selected' : ''}>Falhou</option>
                        </select>
                        <div class="overflow-wrap">
                            <button type="button" class="icon-btn overflow-trigger" data-action="menu" aria-label="Mais ações" title="Mais ações">⋯</button>
                            <div class="overflow-panel" role="menu">
                                <button type="button" data-action="edit" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-edit"></i> Editar</button>
                                <button type="button" data-action="up" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-arrow-up"></i> Subir</button>
                                <button type="button" data-action="down" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-arrow-down"></i> Descer</button>
                                <button type="button" data-action="agenda" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-bookmark"></i> Salvar na agenda</button>
                                <button type="button" class="danger" data-action="remove" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-trash-can"></i> Remover</button>
                            </div>
                        </div>
                    </div>
                </div>`;
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
            closeAllOverflowMenus();
            paintDeliveryListWindow(container, false);
        });
    }, { passive: true });
}

function paintDeliveryListWindow(container, force) {
    const filtered = deliveryListVirtual.filtered;
    const total = filtered.length;
    if (!total) return;

    if (total <= DELIVERY_LIST_FULL_RENDER_MAX) {
        deliveryListVirtual.start = 0;
        deliveryListVirtual.end = total;
        const parts = new Array(total);
        for (let i = 0; i < total; i++) parts[i] = buildDeliveryListItemHtml(filtered[i]);
        container.innerHTML = parts.join('');
        return;
    }

    const scrollEl = getDeliveryListScrollParent(container);
    const scrollTop = scrollEl.scrollTop || 0;
    const viewH = scrollEl.clientHeight || 600;
    let start = Math.max(0, Math.floor(scrollTop / DELIVERY_LIST_ROW_EST) - DELIVERY_LIST_BUFFER);
    let end = Math.min(total, Math.ceil((scrollTop + viewH) / DELIVERY_LIST_ROW_EST) + DELIVERY_LIST_BUFFER);
    if (end <= start) end = Math.min(total, start + 1);
    if (!force && start === deliveryListVirtual.start && end === deliveryListVirtual.end) return;

    deliveryListVirtual.start = start;
    deliveryListVirtual.end = end;
    const topPad = start * DELIVERY_LIST_ROW_EST;
    const bottomPad = Math.max(0, (total - end) * DELIVERY_LIST_ROW_EST);
    const parts = new Array(end - start + 2);
    parts[0] = `<div class="delivery-list-spacer" style="height:${topPad}px" aria-hidden="true"></div>`;
    for (let i = start; i < end; i++) {
        parts[i - start + 1] = buildDeliveryListItemHtml(filtered[i]);
    }
    parts[end - start + 1] = `<div class="delivery-list-spacer" style="height:${bottomPad}px" aria-hidden="true"></div>`;
    container.innerHTML = parts.join('');
}

function renderDeliveriesListNow() {
    const container = document.getElementById("deliveriesList");
    if (!container) return;
    ensureDeliveryListDelegation(container);
    ensureDeliveryListVirtualScroll(container);
    updateDeliveryStats();

    const filtered = routeFilter ? deliveries.filter(d =>
        (d.nome || '').toLowerCase().includes(routeFilter) ||
        (d.endereco || '').toLowerCase().includes(routeFilter)
    ) : deliveries;

    if (filtered.length === 0) {
        deliveryListVirtual.filtered = [];
        deliveryListVirtual.start = -1;
        deliveryListVirtual.end = -1;
        const isFilter = !!routeFilter;
        container.innerHTML = isFilter
            ? `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Nada encontrado</span>
                <span class="empty-state-msg">Nenhuma entrega corresponde à busca.</span>
            </div>`
            : `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Rota vazia</span>
                <span class="empty-state-msg">Adicione a primeira entrega para montar o dia.</span>
                <button type="button" class="empty-state-cta" data-empty-cta="nova"><i class="fas fa-plus"></i> Nova entrega</button>
            </div>`;
        return;
    }

    deliveryListVirtual.filtered = filtered;
    deliveryListVirtual.start = -1;
    deliveryListVirtual.end = -1;
    paintDeliveryListWindow(container, true);
}

let deliveryListDelegationReady = false;
function ensureDeliveryListDelegation(container) {
    if (deliveryListDelegationReady || !container) return;
    deliveryListDelegationReady = true;

    container.addEventListener('click', async (e) => {
        const actionEl = e.target.closest('[data-action]');
        const item = e.target.closest('.delivery-item');
        if (!item) return;
        const id = parseInt(item.dataset.id, 10);
        const delivery = deliveries.find(d => d.id === id);
        if (!delivery) return;

        const action = actionEl ? actionEl.dataset.action : 'open';
        if (action === 'open' || !actionEl) {
            if (e.target.closest('button, a, select, input')) return;
            closeAllOverflowMenus();
            const marker = getMarker(delivery.sequentialId);
            if (marker) highlightMarker(marker, delivery);
            openDeliveryPanel(delivery);
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (action === 'menu') {
            const wrap = actionEl.closest('.overflow-wrap');
            const wasOpen = wrap && wrap.classList.contains('open');
            closeAllOverflowMenus();
            if (wrap && !wasOpen) openOverflowWrap(wrap);
            return;
        }

        closeAllOverflowMenus();

        if (action === 'fav') {
            delivery.favorito = !delivery.favorito;
            saveStorage();
            syncFavoritoToAgenda(delivery);
            renderDeliveriesList();
            showToast(delivery.favorito ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
            return;
        }
        if (action === 'whatsapp') {
            sendWhatsApp(delivery);
            return;
        }
        if (action === 'track') {
            shareTrackingLink(delivery);
            return;
        }
        if (action === 'edit') {
            showEditDeliveryModal(delivery, (updated) => editDeliveryInRoute(delivery, updated));
            return;
        }
        if (action === 'up') {
            const idx = deliveries.findIndex(d => d.id === id);
            if (idx > 0) {
                [deliveries[idx - 1], deliveries[idx]] = [deliveries[idx], deliveries[idx - 1]];
                saveStorage();
                clearRouteOverlay();
                renderDeliveriesList();
                updateProgressAndEstimates();
            }
            return;
        }
        if (action === 'down') {
            const idx = deliveries.findIndex(d => d.id === id);
            if (idx >= 0 && idx < deliveries.length - 1) {
                [deliveries[idx + 1], deliveries[idx]] = [deliveries[idx], deliveries[idx + 1]];
                saveStorage();
                clearRouteOverlay();
                renderDeliveriesList();
                updateProgressAndEstimates();
            }
            return;
        }
        if (action === 'remove') {
            const ok = await showConfirmModal({
                title: 'Remover entrega',
                message: `Deseja remover a entrega ${delivery.sequentialId} (${delivery.nome}) da rota?`,
                confirmText: 'Remover',
                danger: true
            });
            if (!ok) return;
            closeTrackingSession(delivery, 'encerrado');
            deliveries = deliveries.filter(d => d.id !== id);
            persistStorageNow();
            clearRouteOverlay();
            removeMarkerById(delivery.sequentialId);
            renderDeliveriesList();
            updateProgressAndEstimates();
            showToast('Entrega removida da rota');
            return;
        }
        if (action === 'agenda') {
            await saveToAgenda(delivery, true);
        }
    });

    container.addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-action="status"]');
        if (!sel) return;
        const id = parseInt(sel.dataset.id, 10);
        const d = deliveries.find(x => x.id === id);
        if (!d) return;
        const oldStatus = d.status;
        const normalsBefore = countNormalActiveStops();
        d.status = sel.value;
        if (d.status === 'entregue' || d.status === 'falhou') {
            d.voltarDepois = false;
            if (d.status === 'entregue') delete d.failReason;
        }
        if (d.status !== 'entregue') delete d.deliveredNotified;
        if (d.status !== 'falhou' || d.failReason !== 'ausente') delete d.absentNotified;
        saveStorage();
        if (oldStatus !== d.status) {
            upsertMarker(d);
            syncTrackingStatus(d);
        }
        updateDeliveryStats();
        renderDeliveriesList();
        if (oldStatus !== d.status && (d.status === 'entregue' || oldStatus === 'entregue' || d.status === 'falhou' || oldStatus === 'falhou')) {
            notifyRouteCompositionChanged({ keepRoute: true });
        }
        if (oldStatus !== d.status && (d.status === 'entregue' || d.status === 'falhou')) {
            if (d.status === 'entregue') {
                sendDeliveredPush(d);
                playDeliveryFeedback();
            }
            noteDeliveryCompletedForBackup();
            maybeNotifyVoltarDepois(normalsBefore);
        }
    });
}

// ========== MODAL DE EDIÇÃO DE ENTREGA ==========
function showEditDeliveryModal(delivery, onSave) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    let currentPhotos = delivery.photos || [];
    let currentPhones = delivery.telefones || [];
    let currentPacotes = delivery.pacotes || 1;
    overlay.innerHTML = `<div class="modal-container modal-edit-dense">
        <h3 class="modal-title">Editar entrega</h3>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNome">Nome</label>
            <input id="editNome" class="edit-input" value="${escapeHtml(delivery.nome)}" placeholder="Nome do cliente">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editEndereco">Endereço</label>
            <input id="editEndereco" class="edit-input" value="${escapeHtml(delivery.endereco)}" placeholder="Endereço completo">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Telefones</label>
            <div id="editPhonesList" class="modal-phone-list"></div>
            <div class="modal-add-phone">
                <input type="text" id="editNewPhoneLabel" placeholder="Identificação">
                <input type="tel" id="editNewPhone" placeholder="(69) 99999-9999">
                <button type="button" id="editAddPhoneBtn" class="modal-add-phone-btn" aria-label="Adicionar telefone"><i class="fas fa-plus"></i></button>
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Pacotes</label>
            <div class="modal-pacotes-control">
                <button type="button" id="modalPacotesMinus" aria-label="Diminuir pacotes">−</button>
                <span id="modalPacotesValue">${currentPacotes}</span>
                <button type="button" id="modalPacotesPlus" aria-label="Aumentar pacotes">+</button>
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editStatus">Status</label>
            <select id="editStatus" class="edit-input">
                <option ${delivery.status === 'pendente' ? 'selected' : ''}>pendente</option>
                <option ${delivery.status === 'em-rota' ? 'selected' : ''}>em-rota</option>
                <option ${delivery.status === 'entregue' ? 'selected' : ''}>entregue</option>
                <option ${delivery.status === 'falhou' ? 'selected' : ''}>falhou</option>
            </select>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNotes">Observações</label>
            <input id="editNotes" class="edit-input" value="${escapeHtml(delivery.notes || '')}" placeholder="Ex.: deixar com o porteiro">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Fotos</label>
            <div class="modal-photo-block">
                <div class="modal-photo-toolbar">
                    <button type="button" id="editCameraBtn" class="photo-btn"><i class="fas fa-camera"></i> Tirar foto</button>
                    <button type="button" id="editGalleryBtn" class="photo-btn"><i class="fas fa-images"></i> Galeria</button>
                </div>
                <input type="file" id="editCameraInput" accept="image/*" capture="environment" style="display:none;">
                <input type="file" id="editGalleryInput" accept="image/*" multiple style="display:none;">
                <div id="editPhotosPreview" class="modal-photo-grid photos-preview"></div>
            </div>
        </div>
        <div class="modal-buttons"><button type="button" class="modal-confirm" id="saveEdit">Salvar</button><button type="button" class="modal-cancel" id="cancelEdit">Cancelar</button></div>
    </div>`;
    document.body.appendChild(overlay);

    let editPhones = [...currentPhones];
    function renderEditPhones() {
        const list = overlay.querySelector('#editPhonesList');
        list.innerHTML = editPhones.map((p, i) => `
            <div class="modal-phone-row">
                <input type="text" class="edit-phone-label-modal" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Identificação">
                <input type="tel" class="edit-phone-number-modal" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número">
                <button type="button" class="remove-edit-phone-modal modal-phone-remove" data-index="${i}" aria-label="Remover telefone"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
        list.querySelectorAll('.remove-edit-phone-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editPhones.splice(idx, 1);
                renderEditPhones();
            });
        });
        list.querySelectorAll('.edit-phone-label-modal').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-phone-number-modal').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].numero = this.value;
            });
        });
    }
    renderEditPhones();

    overlay.querySelector('#editAddPhoneBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#editNewPhoneLabel');
        const numInput = overlay.querySelector('#editNewPhone');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número de telefone inválido", true);
        editPhones.push({ numero: formatted, label: label || '' });
        renderEditPhones();
        labelInput.value = '';
        numInput.value = '';
    });
    overlay.querySelector('#editNewPhone').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#editAddPhoneBtn').click();
    });

    let newPhotosArray = [...currentPhotos];
    let newPhotoIdsArray = Array.isArray(delivery.photoIds) ? [...delivery.photoIds] : [];
    // Se só há dataURLs antigas sem ids, alinha com vazios (migração no save).
    while (newPhotoIdsArray.length < newPhotosArray.length) newPhotoIdsArray.push(null);

    const cameraInput = overlay.querySelector('#editCameraInput');
    const galleryInput = overlay.querySelector('#editGalleryInput');
    const previewContainer = overlay.querySelector('#editPhotosPreview');
    function updateEditPreview() {
        previewContainer.innerHTML = '';
        if (!newPhotosArray.length) {
            previewContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.75rem;">Nenhuma foto</span>';
            return;
        }
        newPhotosArray.forEach((photo, idx) => {
            const div = document.createElement('div');
            div.className = 'modal-photo-item';
            const img = document.createElement('img');
            img.src = photo;
            img.className = 'preview-thumb';
            img.alt = 'Foto da entrega';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-photo-btn';
            removeBtn.setAttribute('aria-label', 'Remover foto');
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = async () => {
                const pid = newPhotoIdsArray[idx];
                if (pid) {
                    try { await idbDeletePhoto(pid); } catch (e) {}
                }
                newPhotosArray.splice(idx, 1);
                newPhotoIdsArray.splice(idx, 1);
                delivery.photos = [...newPhotosArray];
                delivery.photoIds = newPhotoIdsArray.filter(Boolean);
                persistStorageNow();
                if (currentSelectedDelivery && currentSelectedDelivery.id === delivery.id) {
                    refreshPanelPhotos(delivery);
                }
                scheduleDeliveriesListPhotoRefresh();
                updateEditPreview();
            };
            div.appendChild(img);
            div.appendChild(removeBtn);
            previewContainer.appendChild(div);
        });
    }
    updateEditPreview();

    async function addPhotoFromDataUrls(urls) {
        if (!urls || !urls.length) return;
        try {
            let saved = 0;
            const scope = itemPhotoScope(delivery);
            for (const dataUrl of urls) {
                if (newPhotoIdsArray.filter(Boolean).length >= PHOTO_MAX_PER_ITEM) {
                    throw new Error('photo-limit');
                }
                if (isDuplicatePhotoSave(scope, dataUrl)) continue;
                if (newPhotosArray.some((p) => p === dataUrl || photoFingerprint(p) === photoFingerprint(dataUrl))) {
                    continue;
                }
                const id = await persistPhotoDataUrl(dataUrl);
                newPhotosArray.push(dataUrl);
                newPhotoIdsArray.push(id);
                markPhotoSaved(scope, dataUrl);
                saved += 1;
            }
            if (!saved) return;
            // Liga já à entrega — fechar o modal sem "Salvar" não perde as fotos.
            delivery.photos = [...newPhotosArray];
            delivery.photoIds = newPhotoIdsArray.filter(Boolean);
            persistStorageNow();
            if (currentSelectedDelivery && currentSelectedDelivery.id === delivery.id) {
                refreshPanelPhotos(delivery);
            }
            scheduleDeliveriesListPhotoRefresh();
            updateEditPreview();
            showToast(saved > 1 ? `${saved} fotos adicionadas` : 'Foto adicionada com sucesso');
        } catch (e) {
            if (String(e?.message || e) === 'photo-limit') {
                showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
            } else {
                showToast('Não foi possível salvar a foto. Tente novamente', true);
            }
        }
    }

    overlay.querySelector('#editCameraBtn').addEventListener('click', async () => {
        const slots = Math.max(0, PHOTO_MAX_PER_ITEM - newPhotoIdsArray.filter(Boolean).length);
        if (slots <= 0) {
            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('camera', {
            fileInput: cameraInput,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-delivery', sequentialId: delivery.sequentialId }
        });
        if (urls.length) await addPhotoFromDataUrls(urls);
    });
    overlay.querySelector('#editGalleryBtn').addEventListener('click', async () => {
        const slots = Math.max(0, PHOTO_MAX_PER_ITEM - newPhotoIdsArray.filter(Boolean).length);
        if (slots <= 0) {
            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('gallery', {
            fileInput: galleryInput,
            multiple: true,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-delivery', sequentialId: delivery.sequentialId }
        });
        if (urls.length) await addPhotoFromDataUrls(urls);
    });

    let editPacotes = currentPacotes;
    function updatePacotesDisplay() { overlay.querySelector('#modalPacotesValue').innerText = editPacotes; }
    overlay.querySelector('#modalPacotesMinus').addEventListener('click', () => { if (editPacotes > 1) { editPacotes--; updatePacotesDisplay(); } });
    overlay.querySelector('#modalPacotesPlus').addEventListener('click', () => { editPacotes++; updatePacotesDisplay(); });

    overlay.querySelector('#saveEdit').onclick = async () => {
        const list = overlay.querySelector('#editPhonesList');
        const labels = list.querySelectorAll('.edit-phone-label-modal');
        const numbers = list.querySelectorAll('.edit-phone-number-modal');
        const finalPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    finalPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        let newNome = overlay.querySelector('#editNome').value.trim();
        let newEndereco = overlay.querySelector('#editEndereco').value.trim();
        let newStatus = overlay.querySelector('#editStatus').value;
        let newNotes = overlay.querySelector('#editNotes').value.trim();
        if (!newNome || !newEndereco) return showToast("Preencha nome e endereço para continuar", true);
        // Garante ids para qualquer foto dataURL restante.
        for (let i = 0; i < newPhotosArray.length; i++) {
            if (!newPhotoIdsArray[i] && typeof newPhotosArray[i] === 'string' && newPhotosArray[i].startsWith('data:')) {
                newPhotoIdsArray[i] = await persistPhotoDataUrl(newPhotosArray[i]);
            }
        }
        onSave({
            nome: newNome,
            endereco: newEndereco,
            telefones: finalPhones,
            pacotes: editPacotes,
            status: newStatus,
            photos: newPhotosArray,
            photoIds: newPhotoIdsArray.filter(Boolean),
            notes: newNotes
        });
        overlay.remove();
    };
    overlay.querySelector('#cancelEdit').onclick = () => overlay.remove();
}

function editDeliveryInRoute(delivery, updatedData) {
    let oldAddress = delivery.endereco;
    delivery.nome = updatedData.nome;
    delivery.endereco = updatedData.endereco;
    delivery.telefones = updatedData.telefones || [];
    delivery.pacotes = updatedData.pacotes;
    delivery.status = updatedData.status;
    if (updatedData.photos) delivery.photos = updatedData.photos;
    if (updatedData.photoIds) delivery.photoIds = updatedData.photoIds;
    if (updatedData.notes !== undefined) delivery.notes = updatedData.notes;
    if (updatedData.endereco !== oldAddress) {
        geocodeAddressAndUpdate(delivery, updatedData.endereco, (success) => {
            if (!success) { delivery.endereco = oldAddress; saveStorage(); renderDeliveriesList(); }
            else if (currentSelectedDelivery && currentSelectedDelivery.id === delivery.id) {
                syncActiveStopNotification(delivery);
            }
        });
    } else { 
        saveStorage(); 
        const marker = getMarker(delivery.sequentialId);
        if (marker) updateMarkerIcon(marker, delivery);
        else rebuildMarkers(false);
        updateDeliveryStats(); 
        renderDeliveriesList(); 
        syncAgendaByDelivery(delivery);
        if (currentSelectedDelivery && currentSelectedDelivery.id === delivery.id) {
            syncActiveStopNotification(delivery);
        }
        showToast(`Entrega ${delivery.sequentialId} atualizada`); 
    }
}

// ========== AGENDA ==========
function renderAgendaList() {
    const container = document.getElementById("agendaList");
    let filtered = agendaFilter ? agenda.filter(i => i.nome.toLowerCase().includes(agendaFilter) || i.endereco.toLowerCase().includes(agendaFilter)) : agenda;
    if (filtered.length === 0) {
        const isFilter = !!agendaFilter;
        container.innerHTML = isFilter
            ? `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Nada encontrado</span>
                <span class="empty-state-msg">Nenhuma parada corresponde à busca.</span>
            </div>`
            : `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Agenda vazia</span>
                <span class="empty-state-msg">Salve clientes frequentes para reutilizar depois.</span>
                <button type="button" class="empty-state-cta" data-empty-cta="nova"><i class="fas fa-plus"></i> Nova entrega</button>
            </div>`;
        return;
    }
    let html = "";
    filtered.forEach(item => {
        const phonesDisplay = item.telefones && item.telefones.length
            ? item.telefones.map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ')
            : '';
        const photoCount = (item.photoIds && item.photoIds.length) || (item.photos && item.photos.length) || 0;
        const thumbSrc = (item.photos && item.photos[0]) || '';
        const onRoute = findActiveRouteByAddress(item.endereco);
        const addBtn = onRoute
            ? `<button type="button" class="action-btn ghost" disabled title="Já está na rota">Na rota · ${onRoute.sequentialId}</button>`
            : `<button type="button" class="action-btn route add-agenda" data-id="${item.agendaId}"><i class="fas fa-plus"></i> Adicionar à rota</button>`;
        const metaParts = [];
        metaParts.push(`<span title="Pacotes"><i class="fas fa-box"></i>${item.pacotes || 1}</span>`);
        if (photoCount) metaParts.push(`<span title="Fotos"><i class="fas fa-camera"></i>${photoCount}</span>`);
        if (onRoute) metaParts.push(`<span class="agenda-badge" title="Já na rota de hoje"><i class="fas fa-route"></i>${onRoute.sequentialId}</span>`);
        html += `<div class="agenda-item" data-id="${item.agendaId}">
                    <div class="agenda-header">
                        <div class="delivery-title-row">
                            ${item.favorito ? '<span class="fav-btn active" aria-hidden="true"><i class="fas fa-star"></i></span>' : ''}
                            <strong>${escapeHtml(item.nome)}</strong>
                        </div>
                        <div class="overflow-wrap">
                            <button type="button" class="icon-btn overflow-trigger" aria-label="Mais ações" title="Mais ações">⋯</button>
                            <div class="overflow-panel" role="menu">
                                <button type="button" class="edit-agenda" data-id="${item.agendaId}" role="menuitem"><i class="fas fa-edit"></i> Editar</button>
                                <button type="button" class="remove-agenda danger" data-id="${item.agendaId}" role="menuitem"><i class="fas fa-trash-can"></i> Remover</button>
                            </div>
                        </div>
                    </div>
                    <div class="delivery-meta">${metaParts.join('')}</div>
                    <div class="delivery-body-line"><i class="fas fa-location-dot"></i>${escapeHtml(item.endereco)}</div>
                    ${phonesDisplay ? `<div class="delivery-body-line"><i class="fas fa-phone-alt"></i>${escapeHtml(phonesDisplay)}</div>` : ''}
                    ${item.notes ? `<div class="delivery-body-line"><i class="fas fa-pen"></i>${escapeHtml(item.notes)}</div>` : ''}
                    <div class="agenda-photo-row">
                        ${thumbSrc ? `<img src="${thumbSrc}" class="agenda-photo" data-agenda-id="${item.agendaId}" alt="Foto do cliente">` : ''}
                        <button type="button" class="photo-btn agenda-take-photo" data-id="${item.agendaId}" title="Tirar foto"><i class="fas fa-camera"></i> Tirar foto</button>
                        <button type="button" class="photo-btn agenda-pick-photo" data-id="${item.agendaId}" title="Escolher da galeria"><i class="fas fa-images"></i> Galeria</button>
                    </div>
                    <div class="agenda-actions">${addBtn}</div>
                </div>`;
    });
    container.innerHTML = html;
    attachAgendaEvents();
    document.querySelectorAll('.agenda-photo').forEach(img => {
        img.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = agenda.find(a => a.agendaId === parseInt(img.dataset.agendaId));
            if (!item) return;
            await ensureItemPhotos(item);
            if (item.photos && item.photos.length) openGallery(item.photos, 0);
        });
    });
}

function attachAgendaEvents() {
    document.querySelectorAll('#agendaList .overflow-trigger').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wrap = btn.closest('.overflow-wrap');
            const wasOpen = wrap && wrap.classList.contains('open');
            closeAllOverflowMenus();
            if (wrap && !wasOpen) openOverflowWrap(wrap);
        };
    });
    document.querySelectorAll(".add-agenda").forEach(btn => {
        btn.onclick = () => {
            closeAllOverflowMenus();
            let id = parseInt(btn.dataset.id);
            let item = agenda.find(i => i.agendaId === id);
            if (item) addAgendaToRoute(item);
        };
    });
    document.querySelectorAll(".remove-agenda").forEach(btn => {
        btn.onclick = async () => {
            closeAllOverflowMenus();
            const id = parseInt(btn.dataset.id);
            const item = agenda.find(i => i.agendaId === id);
            if (!item) return;
            const ok = await showConfirmModal({
                title: 'Remover da agenda',
                message: `Deseja remover "${item.nome}" da agenda de paradas?`,
                confirmText: 'Remover',
                danger: true
            });
            if (!ok) return;
            agenda = agenda.filter(i => i.agendaId !== id);
            saveStorage();
            renderAgendaList();
            showToast("Parada removida da agenda");
        };
    });
    document.querySelectorAll(".edit-agenda").forEach(btn => {
        btn.onclick = async () => {
            closeAllOverflowMenus();
            let id = parseInt(btn.dataset.id);
            let item = agenda.find(i => i.agendaId === id);
            if (item) {
                await ensureItemPhotos(item);
                showEditAgendaModal(item, (updated) => editAgendaItem(id, updated));
            }
        };
    });
    document.querySelectorAll(".agenda-take-photo").forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const item = agenda.find(i => i.agendaId === id);
            if (!item) return;
            const slots = remainingPhotoSlots(item);
            if (slots <= 0) {
                showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
                return;
            }
            const cameraInput = document.getElementById('agendaCameraInput');
            let savedIncremental = 0;
            const urls = await pickPhotoDataUrls('camera', {
                fileInput: cameraInput,
                maxPhotos: slots,
                pendingTarget: { kind: 'agenda', agendaId: item.agendaId },
                onPhoto: async (dataUrl, n, total) => {
                    const id = await addPhotoDataUrlToItem(item, dataUrl);
                    if (!id) return;
                    savedIncremental += 1;
                    persistStorageNow();
                    if (total && total > 1) showToast(`A guardar fotos… ${n}/${total}`);
                }
            });
            let batchSaved = 0;
            if (urls.length) {
                for (const url of urls) {
                    try {
                        const id = await addPhotoDataUrlToItem(item, url);
                        if (id) {
                            batchSaved += 1;
                            persistStorageNow();
                        }
                    } catch (err) {
                        if (String(err?.message || err) === 'photo-limit') {
                            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
                            break;
                        }
                    }
                }
            }
            const totalSaved = savedIncremental + batchSaved;
            if (totalSaved > 0) {
                renderAgendaList();
                showToast(totalSaved > 1 ? `${totalSaved} fotos salvas na agenda` : 'Foto salva na agenda');
            }
        };
    });
    document.querySelectorAll(".agenda-pick-photo").forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const item = agenda.find(i => i.agendaId === id);
            if (!item) return;
            const slots = remainingPhotoSlots(item);
            if (slots <= 0) {
                showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
                return;
            }
            const galleryInput = document.getElementById('agendaGalleryInput');
            const urls = await pickPhotoDataUrls('gallery', {
                fileInput: galleryInput,
                multiple: true,
                maxPhotos: slots,
                pendingTarget: { kind: 'agenda', agendaId: item.agendaId }
            });
            if (!urls.length) return;
            try {
                for (const url of urls) await addPhotoDataUrlToItem(item, url);
                persistStorageNow();
                renderAgendaList();
                showToast(urls.length > 1 ? `${urls.length} fotos salvas na agenda` : 'Foto salva na agenda');
            } catch (err) {
                if (String(err?.message || err) === 'photo-limit') {
                    showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
                } else {
                    showToast('Não foi possível salvar a foto', true);
                }
            }
        };
    });
}

function editAgendaItem(agendaId, updatedData) {
    let idx = agenda.findIndex(i => i.agendaId === agendaId);
    if (idx === -1) return;
    if (updatedData.endereco !== agenda[idx].endereco) {
        showToast("Atualizando coordenadas…");
        geocoder.geocode({ address: updatedData.endereco }, (res, stat) => {
            if (stat === "OK" && res[0]) {
                agenda[idx] = { ...agenda[idx], ...updatedData, lat: res[0].geometry.location.lat(), lng: res[0].geometry.location.lng() };
                saveStorage(); renderAgendaList(); showToast(`"${updatedData.nome}" atualizado na agenda`);
            } else showToast("Não foi possível localizar este endereço", true);
        });
    } else { agenda[idx] = { ...agenda[idx], ...updatedData }; saveStorage(); renderAgendaList(); showToast(`"${updatedData.nome}" atualizado na agenda`); }
}

function showEditAgendaModal(item, onSave) {
    let overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    let currentPhones = item.telefones || [];
    overlay.innerHTML = `<div class="modal-container modal-edit-dense">
        <h3 class="modal-title">Editar na agenda</h3>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNome">Nome</label>
            <input id="editNome" class="edit-input" value="${escapeHtml(item.nome)}" placeholder="Nome do cliente">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editEndereco">Endereço</label>
            <input id="editEndereco" class="edit-input" value="${escapeHtml(item.endereco)}" placeholder="Endereço completo">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Telefones</label>
            <div id="editAgendaPhonesList" class="modal-phone-list"></div>
            <div class="modal-add-phone">
                <input type="text" id="editAgendaNewPhoneLabel" placeholder="Identificação">
                <input type="tel" id="editAgendaNewPhone" placeholder="(69) 99999-9999">
                <button type="button" id="editAgendaAddPhoneBtn" class="modal-add-phone-btn" aria-label="Adicionar telefone"><i class="fas fa-plus"></i></button>
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editPacotes">Pacotes</label>
            <input id="editPacotes" class="edit-input" type="number" min="1" value="${item.pacotes || 1}">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNotes">Observações</label>
            <input id="editNotes" class="edit-input" value="${escapeHtml(item.notes || '')}" placeholder="Observações">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Fotos do cliente</label>
            <div class="modal-photo-block">
                <div class="modal-photo-toolbar">
                    <button type="button" id="editAgendaCameraBtn" class="photo-btn"><i class="fas fa-camera"></i> Tirar foto</button>
                    <button type="button" id="editAgendaGalleryBtn" class="photo-btn"><i class="fas fa-images"></i> Galeria</button>
                </div>
                <input type="file" id="editAgendaCameraInput" accept="image/*" capture="environment" style="display:none;">
                <input type="file" id="editAgendaGalleryInput" accept="image/*" multiple style="display:none;">
                <div id="editAgendaPhotosPreview" class="modal-photo-grid photos-preview"></div>
            </div>
        </div>
        <div class="modal-buttons"><button type="button" class="modal-confirm" id="saveEdit">Salvar</button><button type="button" class="modal-cancel" id="cancelEdit">Cancelar</button></div>
    </div>`;
    document.body.appendChild(overlay);

    let editPhones = [...currentPhones];
    function renderEditAgendaPhones() {
        const list = overlay.querySelector('#editAgendaPhonesList');
        list.innerHTML = editPhones.map((p, i) => `
            <div class="modal-phone-row">
                <input type="text" class="edit-agenda-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Identificação">
                <input type="tel" class="edit-agenda-phone-number" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número">
                <button type="button" class="remove-edit-agenda-phone modal-phone-remove" data-index="${i}" aria-label="Remover telefone"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
        list.querySelectorAll('.remove-edit-agenda-phone').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editPhones.splice(idx, 1);
                renderEditAgendaPhones();
            });
        });
        list.querySelectorAll('.edit-agenda-phone-label').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-agenda-phone-number').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].numero = this.value;
            });
        });
    }
    renderEditAgendaPhones();

    overlay.querySelector('#editAgendaAddPhoneBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#editAgendaNewPhoneLabel');
        const numInput = overlay.querySelector('#editAgendaNewPhone');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return showToast("Número de telefone inválido", true);
        editPhones.push({ numero: formatted, label: label || '' });
        renderEditAgendaPhones();
        labelInput.value = '';
        numInput.value = '';
    });

    let newPhotosArray = Array.isArray(item.photos) ? [...item.photos] : [];
    let newPhotoIdsArray = Array.isArray(item.photoIds) ? [...item.photoIds] : [];
    while (newPhotoIdsArray.length < newPhotosArray.length) newPhotoIdsArray.push(null);

    const cameraInput = overlay.querySelector('#editAgendaCameraInput');
    const galleryInput = overlay.querySelector('#editAgendaGalleryInput');
    const previewContainer = overlay.querySelector('#editAgendaPhotosPreview');
    function updateEditAgendaPreview() {
        previewContainer.innerHTML = '';
        if (!newPhotosArray.length) {
            previewContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.75rem;">Nenhuma foto</span>';
            return;
        }
        newPhotosArray.forEach((photo, idx) => {
            const div = document.createElement('div');
            div.className = 'modal-photo-item';
            const img = document.createElement('img');
            img.src = photo;
            img.className = 'preview-thumb';
            img.alt = 'Foto do cliente';
            img.style.cursor = 'pointer';
            img.onclick = () => openGallery(newPhotosArray, idx);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-photo-btn';
            removeBtn.setAttribute('aria-label', 'Remover foto');
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = async () => {
                const pid = newPhotoIdsArray[idx];
                if (pid) {
                    try { await idbDeletePhoto(pid); } catch (e) {}
                }
                newPhotosArray.splice(idx, 1);
                newPhotoIdsArray.splice(idx, 1);
                item.photos = [...newPhotosArray];
                item.photoIds = newPhotoIdsArray.filter(Boolean);
                persistStorageNow();
                renderAgendaList();
                updateEditAgendaPreview();
            };
            div.appendChild(img);
            div.appendChild(removeBtn);
            previewContainer.appendChild(div);
        });
    }
    updateEditAgendaPreview();

    async function addAgendaPhotosFromDataUrls(urls) {
        if (!urls || !urls.length) return;
        try {
            for (const dataUrl of urls) {
                if (newPhotoIdsArray.filter(Boolean).length >= PHOTO_MAX_PER_ITEM) {
                    throw new Error('photo-limit');
                }
                const id = await persistPhotoDataUrl(dataUrl);
                newPhotosArray.push(dataUrl);
                newPhotoIdsArray.push(id);
            }
            // Liga já ao cliente da agenda — fechar sem "Salvar" não perde as fotos.
            item.photos = [...newPhotosArray];
            item.photoIds = newPhotoIdsArray.filter(Boolean);
            persistStorageNow();
            renderAgendaList();
            updateEditAgendaPreview();
            showToast(urls.length > 1 ? `${urls.length} fotos adicionadas` : 'Foto adicionada');
        } catch (e) {
            if (String(e?.message || e) === 'photo-limit') {
                showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
            } else {
                showToast('Não foi possível salvar a foto. Tente novamente', true);
            }
        }
    }

    overlay.querySelector('#editAgendaCameraBtn').addEventListener('click', async () => {
        const slots = Math.max(0, PHOTO_MAX_PER_ITEM - newPhotoIdsArray.filter(Boolean).length);
        if (slots <= 0) {
            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('camera', {
            fileInput: cameraInput,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-agenda', agendaId: item.agendaId }
        });
        if (urls.length) await addAgendaPhotosFromDataUrls(urls);
    });
    overlay.querySelector('#editAgendaGalleryBtn').addEventListener('click', async () => {
        const slots = Math.max(0, PHOTO_MAX_PER_ITEM - newPhotoIdsArray.filter(Boolean).length);
        if (slots <= 0) {
            showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('gallery', {
            fileInput: galleryInput,
            multiple: true,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-agenda', agendaId: item.agendaId }
        });
        if (urls.length) await addAgendaPhotosFromDataUrls(urls);
    });

    overlay.querySelector('#saveEdit').onclick = async () => {
        const list = overlay.querySelector('#editAgendaPhonesList');
        const labels = list.querySelectorAll('.edit-agenda-phone-label');
        const numbers = list.querySelectorAll('.edit-agenda-phone-number');
        const finalPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    finalPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        let newNome = overlay.querySelector('#editNome').value.trim();
        let newEndereco = overlay.querySelector('#editEndereco').value.trim();
        let newPacotes = parseInt(overlay.querySelector('#editPacotes').value) || 1;
        let newNotes = overlay.querySelector('#editNotes').value.trim();
        if (!newNome || !newEndereco) return showToast("Preencha nome e endereço para continuar", true);
        for (let i = 0; i < newPhotosArray.length; i++) {
            if (!newPhotoIdsArray[i] && typeof newPhotosArray[i] === 'string' && newPhotosArray[i].startsWith('data:')) {
                newPhotoIdsArray[i] = await persistPhotoDataUrl(newPhotosArray[i]);
            }
        }
        onSave({
            nome: newNome,
            endereco: newEndereco,
            telefones: finalPhones,
            pacotes: newPacotes,
            notes: newNotes,
            photos: newPhotosArray,
            photoIds: newPhotoIdsArray.filter(Boolean)
        });
        overlay.remove();
    };
    overlay.querySelector('#cancelEdit').onclick = () => overlay.remove();
}

// ========== ADICIONAR DA AGENDA PARA A ROTA (PERMITIDO) ==========
function normalizeAddress(addr) {
    return String(addr || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function findActiveRouteByAddress(endereco) {
    const key = normalizeAddress(endereco);
    return deliveries.find(d =>
        normalizeAddress(d.endereco) === key &&
        d.status !== 'entregue' &&
        d.status !== 'falhou'
    );
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
    const accountLabel = currentUser
        ? (currentUser.provider === 'local' ? 'Conta neste aparelho' : (currentUser.email || currentUser.displayName || 'Conta'))
        : 'Sem conta';
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:450px;">
            <h3 class="modal-title">Perfil e preferências</h3>
            <div class="form-group">
                <label>Conta</label>
                <div class="profile-account-chip">${escapeHtml(accountLabel)}</div>
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

/** Descarta URLs em RAM (mantém photoIds no IndexedDB; revoga blob:). */
function releaseInMemoryPhotosExcept(keepDeliveryId) {
    const clear = (item) => {
        if (!item || !Array.isArray(item.photos) || !item.photos.length) return;
        for (const u of item.photos) revokeDisplayUrl(u);
        const ids = Array.isArray(item.photoIds) ? item.photoIds : [];
        for (const id of ids) revokePhotoObjectUrl(id);
        item.photos = [];
    };
    for (const d of deliveries) {
        if (keepDeliveryId != null && d.id === keepDeliveryId) continue;
        clear(d);
    }
    // Agenda thumbs: limpa se lista grande.
    if (agenda && agenda.length > 40) {
        for (const a of agenda) clear(a);
    }
}

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
const FAIL_REASON_LABELS = {
    ausente: 'Ausente',
    'endereco-errado': 'Endereço errado',
    recusou: 'Recusou',
    'voltar-depois': 'Voltar depois'
};
const FAIL_REASON_OPTIONS = [
    { id: 'ausente', label: 'Ausente', icon: 'fas fa-house-user', iconColor: '#ea580c' },
    { id: 'endereco-errado', label: 'Endereço errado', icon: 'fas fa-map-location-dot', iconColor: '#ea580c' },
    { id: 'recusou', label: 'Recusou', icon: 'fas fa-hand', iconColor: '#ea580c' },
    { id: 'voltar-depois', label: 'Voltar depois', icon: 'fas fa-clock', iconColor: '#b45309' }
];

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
