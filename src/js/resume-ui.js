/**
 * Recuperação de UI ao voltar do 2º plano (WebView/Maps) e restore da câmera nativa.
 * Lock screen / ScreenEvents ficam no main — este módulo só trata resume/visibility.
 */

let deps = {
    isNativeApp: () => false,
    getUseNativeMap: () => false,
    getNativeGoogleMap: () => null,
    getMap: () => null,
    getNativeMapZoom: () => 12,
    enqueuePhotoOp: async (fn) => fn(),
    applyRestoredCameraPhoto: async () => {},
    getGpsEnabled: () => false,
    startBackgroundGpsWatch: () => {},
    syncBackgroundGpsTargets: () => {}
};

export function configureResumeUi(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let cameraRestoreHandlerReady = false;

/** Evita tela preta ao voltar do 2º plano (WebView transparente + Maps nativo). */
let recoverUiResumeTimer = null;
let recoverUiLastAt = 0;

export function recoverUiAfterResume() {
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
        const useNativeMap = deps.getUseNativeMap();
        const nativeGoogleMap = deps.getNativeGoogleMap();
        const map = deps.getMap();
        const nativeMapZoom = deps.getNativeMapZoom();
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

export async function setupCameraRestoreHandler() {
    if (cameraRestoreHandlerReady) return;
    if (!deps.isNativeApp() || !window.RotaFlowCap?.App?.addListener) return;
    cameraRestoreHandlerReady = true;
    try {
        await window.RotaFlowCap.App.addListener('appRestoredResult', async (event) => {
            try {
                recoverUiAfterResume();
                if (!event || event.pluginId !== 'Camera' || !event.success) return;
                await deps.enqueuePhotoOp(() => deps.applyRestoredCameraPhoto(event.data));
                recoverUiAfterResume();
            } catch (e) {
                console.warn('appRestoredResult', e);
            }
        });
        await window.RotaFlowCap.App.addListener('resume', () => {
            recoverUiAfterResume();
            setTimeout(recoverUiAfterResume, 200);
            if (deps.getGpsEnabled()) {
                deps.startBackgroundGpsWatch();
                deps.syncBackgroundGpsTargets();
            }
        });
        await window.RotaFlowCap.App.addListener('appStateChange', (state) => {
            if (state && state.isActive) {
                recoverUiAfterResume();
                if (deps.getGpsEnabled()) {
                    deps.startBackgroundGpsWatch();
                    deps.syncBackgroundGpsTargets();
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
