/**
 * GPS / watchPosition / BackgroundGps.
 * main.js injeta mapa, entregas e UI via configureGps().
 */
import {
    readGpsEnabledPref,
    writeGpsEnabledPref,
    coordsFromPosition,
    gpsAccuracyCircleRadius,
    canUseWebGeolocation,
    canUseNativeGeolocation,
    buildActiveTrackTargets,
    positionFromBackgroundLocation,
    isGpsStationary,
    adaptiveWatchOptions,
    nextStationaryState
} from '../../lib/gps-helpers.js';
import { gpsErrorMessage as gpsErrorMessageOf } from '../../lib/routing-helpers.js';
import { TRACK_NEAR_METERS } from '../../lib/track-schema.js';
import { ensureAnonUser } from './firebase-loader.js';

let deps = {
    isNativeApp: () => false,
    getStartPoint: () => null,
    setStartPoint: () => {},
    getGpsEnabled: () => false,
    setGpsEnabled: () => {},
    getGpsAccuracyMeters: () => 0,
    setGpsAccuracyMeters: () => {},
    getMap: () => null,
    getUseNativeMap: () => false,
    getNativeGoogleMap: () => null,
    getDeliveries: () => [],
    isActiveStop: () => false,
    maybeMarkNearCustomer: () => {},
    publishDriverGpsFromWatch: () => {},
    updateMapNextChip: () => {},
    updateOptimizeFabVisibility: () => {},
    showToast: () => {}
};

let watchId = null;
let gpsMarker = null;
let gpsAccuracyCircle = null;
let gpsDenied = false;
let bgGpsStarted = false;
let chipUpdateTimer = null;
let extrasAsked = false;
let lastEnableError = null;
/** Adaptive battery: last coords + stationary streak for JS watch retune. */
let lastWatchCoords = null;
let stationaryStreak = 0;
let watchStationaryMode = false;
let watchRetuneTimer = null;
let bgAuthUid = '';

export function configureGps(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function isBgGpsStarted() {
    return bgGpsStarted;
}

export function isGpsDenied() {
    return gpsDenied;
}

export function getLastGpsEnableError() {
    return lastEnableError;
}

export function persistGpsPreference() {
    writeGpsEnabledPref(typeof localStorage !== 'undefined' ? localStorage : null, !!deps.getGpsEnabled());
}

export function updateGpsButton() {
    const btn = document.getElementById('gpsBtn');
    if (!btn) return;
    const gpsEnabled = !!deps.getGpsEnabled();
    const startPoint = deps.getStartPoint();
    const on = gpsEnabled && !!startPoint;
    btn.classList.toggle('active', on);
    btn.classList.toggle('off', !gpsEnabled);
    btn.setAttribute('aria-pressed', gpsEnabled ? 'true' : 'false');
    btn.title = gpsEnabled
        ? (startPoint ? 'GPS ligado — clique para desligar' : 'GPS ligado — buscando…')
        : 'GPS desligado — clique para ligar';
    btn.innerHTML = gpsEnabled
        ? '<i class="fas fa-location-crosshairs"></i>'
        : '<i class="fas fa-location-slash"></i>';
}

export function gpsErrorMessage(err) {
    return gpsErrorMessageOf(err, {
        isNative: deps.isNativeApp(),
        isSecureContext: !!window.isSecureContext,
        hasGeolocation: !!navigator.geolocation
    });
}

function activeTrackTargets() {
    return buildActiveTrackTargets(deps.getDeliveries(), deps.isActiveStop);
}

function clearGpsOverlayMarkers() {
    if (gpsMarker) {
        gpsMarker.setMap(null);
        gpsMarker = null;
    }
    if (gpsAccuracyCircle) {
        gpsAccuracyCircle.setMap(null);
        gpsAccuracyCircle = null;
    }
}

export function clearGpsWatchOnly() {
    if (watchId == null) return;
    if (deps.isNativeApp() && window.RotaFlowCap?.Geolocation) {
        window.RotaFlowCap.Geolocation.clearWatch({ id: watchId }).catch(() => {});
    } else if (navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
}

function resetAdaptiveGpsState() {
    lastWatchCoords = null;
    stationaryStreak = 0;
    watchStationaryMode = false;
    if (watchRetuneTimer) {
        clearTimeout(watchRetuneTimer);
        watchRetuneTimer = null;
    }
}

/**
 * Re-bind watchPosition with adaptive options when stationary state flips.
 * Skips native BackgroundGps (Java interval stays 4s — see docs/GPS-ADAPTIVO.md).
 */
async function retuneGpsWatchIfNeeded(wantStationary) {
    if (wantStationary === watchStationaryMode) return;
    watchStationaryMode = wantStationary;
    if (!deps.getGpsEnabled()) return;
    const canNative = canUseNativeGeolocation({
        isNative: deps.isNativeApp(),
        hasNativeGeo: !!window.RotaFlowCap?.Geolocation
    });
    const canWeb = canUseWebGeolocation({
        isSecureContext: !!window.isSecureContext,
        hasGeolocation: !!navigator.geolocation
    });
    if (!canNative && !canWeb) return;
    clearGpsWatchOnly();
    const watchOpts = adaptiveWatchOptions({ stationary: watchStationaryMode });
    const onWatch = applyGpsWatchPosition;
    if (canNative) {
        watchId = await window.RotaFlowCap.Geolocation.watchPosition(watchOpts, (p, err) => {
            if (!err) onWatch(p);
        });
    } else {
        watchId = navigator.geolocation.watchPosition(onWatch, () => {}, watchOpts);
    }
}

function noteAdaptiveMovement(coords) {
    if (!coords) return;
    const moved = !isGpsStationary(lastWatchCoords, coords);
    const next = nextStationaryState(stationaryStreak, moved);
    stationaryStreak = next.streak;
    lastWatchCoords = { lat: coords.lat, lng: coords.lng };
    if (next.stationary === watchStationaryMode) return;
    if (watchRetuneTimer) clearTimeout(watchRetuneTimer);
    // Debounce retunes to avoid thrashing clearWatch/watchPosition.
    watchRetuneTimer = setTimeout(() => {
        watchRetuneTimer = null;
        retuneGpsWatchIfNeeded(next.stationary).catch(() => {});
    }, 800);
}

export async function stopBackgroundGpsWatch() {
    const bg = window.RotaFlowCap && window.RotaFlowCap.BackgroundGps;
    bgGpsStarted = false;
    if (!bg) return;
    try { if (typeof bg.removeAllListeners === 'function') await bg.removeAllListeners(); } catch (_) {}
    try { await bg.stop(); } catch (_) {}
}

export function clearGpsTracking() {
    stopBackgroundGpsWatch();
    clearGpsWatchOnly();
    resetAdaptiveGpsState();
    deps.setStartPoint(null);
    deps.setGpsAccuracyMeters(0);
    deps.updateOptimizeFabVisibility();
    clearGpsOverlayMarkers();
    const native = deps.getNativeGoogleMap();
    if (deps.getUseNativeMap() && native) {
        native.enableCurrentLocation(false).catch(() => {});
    }
}

export function applyGpsWatchPosition(p) {
    if (!deps.getGpsEnabled() || !p?.coords) return;
    const coords = coordsFromPosition(p);
    if (!coords) return;
    noteAdaptiveMovement(coords);
    deps.setStartPoint({ lat: coords.lat, lng: coords.lng });
    if (coords.accuracy != null) deps.setGpsAccuracyMeters(coords.accuracy);
    deps.publishDriverGpsFromWatch(p);
    // Atualiza ETA aproximado do chip sem sobrecarregar o mapa nativo.
    if (!chipUpdateTimer) {
        chipUpdateTimer = setTimeout(() => {
            chipUpdateTimer = null;
            deps.updateMapNextChip();
        }, 4000);
    }
    if (deps.getUseNativeMap()) return;
    const startPoint = deps.getStartPoint();
    if (gpsMarker) gpsMarker.setPosition(startPoint);
    else showStartMarker();
    if (gpsAccuracyCircle) {
        gpsAccuracyCircle.setCenter(startPoint);
        const meters = deps.getGpsAccuracyMeters();
        if (meters > 0) gpsAccuracyCircle.setRadius(meters);
    }
}

export async function startBackgroundGpsWatch() {
    const bg = window.RotaFlowCap && window.RotaFlowCap.BackgroundGps;
    if (!deps.isNativeApp() || !bg) return;
    try {
        if (typeof bg.removeAllListeners === 'function') await bg.removeAllListeners();
        await bg.addListener('location', (loc) => {
            const pos = positionFromBackgroundLocation(loc);
            if (pos) applyGpsWatchPosition(pos);
        });
        await bg.addListener('near', (data) => {
            if (!data || !data.token) return;
            const delivery = deps.getDeliveries().find((d) => d.trackToken === data.token);
            if (!delivery) return;
            deps.maybeMarkNearCustomer(delivery, {
                lat: Number(data.latitude),
                lng: Number(data.longitude)
            }, { skipPush: true });
        });
        if (!extrasAsked && typeof bg.requestExtras === 'function') {
            extrasAsked = true;
            await bg.requestExtras().catch(() => {});
        }
        const fb = window.ROTAFLOW_FIREBASE || {};
        await bg.start({
            notificationTitle: 'RotaFlow rastreando',
            notificationText: 'GPS ativo — avisos ao cliente mesmo em segundo plano',
            intervalMs: 4000,
            minDistanceM: 12,
            nearMeters: TRACK_NEAR_METERS,
            projectId: fb.projectId || 'rotaflow-83610',
            apiKey: fb.apiKey || '',
            trackHost: window.ROTAFLOW_TRACK_HOST || 'https://rotaflow-83610.web.app',
            // Push: Cloud Functions (onTrackNotify). Sem VAPID private no APK.
            targets: activeTrackTargets()
        });
        bgGpsStarted = true;
        pushBackgroundGpsAuth(bg);
    } catch (err) {
        console.warn('bg gps start', err);
    }
}

/**
 * O serviço nativo grava live/pos direto na REST do Firestore; as rules exigem o mesmo
 * usuário anônimo dono do track. Só carrega o SDK quando há entrega com link de rastreio.
 */
async function pushBackgroundGpsAuth(bg) {
    if (!bg || typeof bg.setAuth !== 'function' || !activeTrackTargets().length) return;
    try {
        const user = await ensureAnonUser();
        if (!user || !user.refreshToken || user.uid === bgAuthUid) return;
        await bg.setAuth({ uid: user.uid, refreshToken: user.refreshToken });
        bgAuthUid = user.uid;
    } catch (err) {
        console.warn('bg gps auth', err);
    }
}

export function syncBackgroundGpsTargets() {
    const bg = window.RotaFlowCap && window.RotaFlowCap.BackgroundGps;
    if (!bgGpsStarted || !bg || typeof bg.updateTargets !== 'function') return;
    bg.updateTargets({ targets: activeTrackTargets() }).catch(() => {});
    pushBackgroundGpsAuth(bg);
}

export function readGpsPosition(options) {
    if (deps.isNativeApp() && window.RotaFlowCap?.Geolocation) {
        return window.RotaFlowCap.Geolocation.getCurrentPosition(options);
    }
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject({ code: 0, message: 'unsupported' });
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}

export async function enableGpsTracking() {
    const canWeb = canUseWebGeolocation({
        isSecureContext: !!window.isSecureContext,
        hasGeolocation: !!navigator.geolocation
    });
    const canNative = canUseNativeGeolocation({
        isNative: deps.isNativeApp(),
        hasNativeGeo: !!window.RotaFlowCap?.Geolocation
    });
    if (!canNative && !canWeb) {
        gpsDenied = true;
        return false;
    }
    try {
        if (canNative) {
            const perm = await window.RotaFlowCap.Geolocation.requestPermissions();
            if (perm.location === 'denied') {
                const denied = new Error('PERMISSION_DENIED');
                denied.code = 1;
                throw denied;
            }
        }
        let pos;
        try {
            pos = await readGpsPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
        } catch (firstErr) {
            // Segunda tentativa mais tolerante (rede/Wi‑Fi), útil em ambiente fechado.
            if (firstErr && firstErr.code === 3) {
                pos = await readGpsPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
            } else {
                throw firstErr;
            }
        }
        const coords = coordsFromPosition(pos);
        if (!coords) throw Object.assign(new Error('NO_COORDS'), { code: 2 });
        deps.setStartPoint({ lat: coords.lat, lng: coords.lng });
        deps.setGpsAccuracyMeters(coords.accuracy != null ? coords.accuracy : 0);
        gpsDenied = false;
        showStartMarker();
        updateGpsButton();
        deps.updateOptimizeFabVisibility();
        clearGpsWatchOnly();
        resetAdaptiveGpsState();
        applyGpsWatchPosition(pos);
        const onWatch = applyGpsWatchPosition;
        const watchOpts = adaptiveWatchOptions({ stationary: false });
        if (canNative) {
            watchId = await window.RotaFlowCap.Geolocation.watchPosition(watchOpts, (p, err) => {
                if (!err) onWatch(p);
            });
            await startBackgroundGpsWatch();
        } else {
            watchId = navigator.geolocation.watchPosition(onWatch, () => {}, watchOpts);
        }
        lastEnableError = null;
        return true;
    } catch (err) {
        gpsDenied = true;
        deps.setStartPoint(null);
        updateGpsButton();
        deps.updateOptimizeFabVisibility();
        lastEnableError = err;
        return false;
    }
}

/** Compat: código legado lia enableGpsTracking.lastError */
Object.defineProperty(enableGpsTracking, 'lastError', {
    get() { return lastEnableError; },
    set(v) { lastEnableError = v; }
});

export async function toggleGps() {
    if (deps.getGpsEnabled()) {
        deps.setGpsEnabled(false);
        gpsDenied = true;
        clearGpsTracking();
        persistGpsPreference();
        updateGpsButton();
        deps.showToast('GPS desligado. A rota usará a primeira entrega como partida');
        return;
    }
    if (!deps.isNativeApp() && !window.isSecureContext) {
        deps.showToast(gpsErrorMessage(), true);
        updateGpsButton();
        return;
    }
    deps.setGpsEnabled(true);
    gpsDenied = false;
    persistGpsPreference();
    updateGpsButton();
    deps.showToast('Obtendo localização…');
    const ok = await enableGpsTracking();
    if (!ok) {
        deps.setGpsEnabled(false);
        persistGpsPreference();
        updateGpsButton();
        deps.showToast(gpsErrorMessage(lastEnableError), true);
        return;
    }
    const map = deps.getMap();
    const startPoint = deps.getStartPoint();
    if (map && startPoint) {
        map.panTo(startPoint);
        if (map.getZoom() < 14) map.setZoom(15);
    }
    deps.showToast('Localização ativada');
}

export function requestStartPoint() {
    if (!deps.getGpsEnabled()) {
        clearGpsTracking();
        return Promise.resolve(null);
    }
    const existing = deps.getStartPoint();
    if (existing) return Promise.resolve(existing);
    return enableGpsTracking().then((ok) => (ok ? deps.getStartPoint() : null));
}

export function showStartMarker() {
    const startPoint = deps.getStartPoint();
    const map = deps.getMap();
    if (!startPoint || !map || !deps.getGpsEnabled()) return;

    // App nativo: usa a camada oficial "minha localização" (círculo azul do Google Maps)
    if (deps.getUseNativeMap() && deps.getNativeGoogleMap()) {
        clearGpsOverlayMarkers();
        deps.getNativeGoogleMap().enableCurrentLocation(true).catch((e) => console.warn('my location', e));
        return;
    }

    clearGpsOverlayMarkers();

    // Web: mesmo visual do Google Maps — ponto azul #4285F4 + anel branco + área de precisão
    const radius = gpsAccuracyCircleRadius(deps.getGpsAccuracyMeters(), 25);
    gpsAccuracyCircle = new google.maps.Circle({
        map,
        center: startPoint,
        radius,
        clickable: false,
        fillColor: '#4285F4',
        fillOpacity: 0.16,
        strokeColor: '#4285F4',
        strokeOpacity: 0.4,
        strokeWeight: 1,
        zIndex: 998
    });
    gpsMarker = new google.maps.Marker({
        position: startPoint,
        map,
        title: 'Sua localização',
        zIndex: 999,
        clickable: false,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        }
    });
}

export { readGpsEnabledPref, buildActiveTrackTargets };
