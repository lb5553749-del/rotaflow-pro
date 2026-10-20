/**
 * Boot da UI do motorista: initAppUi, DOMContentLoaded, PWA e service worker.
 * Dependências injetadas via configureAppBoot() — main.js só orquestra.
 */
// Tema escuro em módulo próprio: precisa rodar antes do 1º paint e o
// profile.js (modal, ~10 KB) agora é lazy.
import { initDarkModeFromStorage } from './theme.js';
import { initFiltersUI } from './filters-ui.js';
import { advancedFilters } from './advanced-filters.js';
import { initSyncStatusUI } from './sync-status.js';

let deps = {
    initNameSuggestions: () => {},
    setupNewDeliveryPhoneUI: () => {},
    setupAddressDuplicateCheck: () => {},
    bindGalleryChrome: () => {},
    closeDeliveryPanel: () => {},
    adjustPacotes: () => {},
    editObservation: () => {},
    editPhonesPanel: () => {},
    setupPanelSwipe: () => {},
    setupFabRailClearance: () => {},
    setupPanelPhotoCapture: () => {},
    setupUndoSnackbar: () => {},
    setupHistoryListDelegation: () => {},
    setupOverflowMenus: () => {},
    setupBackupReminderUi: () => {},
    setupAutoBackupScheduler: () => {},
    getCurrentSelectedDelivery: () => null,
    focusDeliveryInPanel: () => {},
    isNativeApp: () => false,
    setupScreenLockNotificationBridge: () => {},
    setupCameraRestoreHandler: () => {},
    showProfileModal: () => {},
    bindBackupButtons: () => {},
    optimizeRoute: () => {},
    updateOptimizeFabVisibility: () => {},
    archiveCurrentRouteDay: () => {},
    startNewRoute: () => {},
    clearRoute: () => {},
    toggleSidebar: () => {},
    copyFromOtherRoute: () => {},
    toggleGps: () => {},
    updateGpsButton: () => {},
    getGpsEnabled: () => false,
    enableGpsTracking: async () => false,
    switchSidebarTab: () => {},
    isGalleryOpen: () => false,
    closeGallery: () => {},
    nextPhoto: () => {},
    prevPhoto: () => {},
    getGeocoder: () => null,
    initAuthUi: () => {},
    resetVoltarDepoisAlert: () => {},
    debounce: (fn) => fn,
    setRouteFilter: () => {},
    setAgendaFilter: () => {},
    renderDeliveriesList: () => {},
    renderAgendaList: () => {},
    setupAddDeliveryForm: () => {},
    initMap: () => {},
    persistStorageNow: () => {},
    getAppIcon: () => ''
};

export function configureAppBoot(opts) {
    deps = { ...deps, ...(opts || {}) };
}

/** Interface do motorista. Roda no DOMContentLoaded, sem esperar o callback do Google Maps. */
export function initAppUi() {
    if (initAppUi.done) return;
    initAppUi.done = true;
    initDarkModeFromStorage();
    deps.initNameSuggestions();
    deps.setupNewDeliveryPhoneUI();
    deps.setupAddressDuplicateCheck();

    deps.bindGalleryChrome();
    document.getElementById('closePanelBtn').addEventListener('click', deps.closeDeliveryPanel);
    document.getElementById('panelPacotesPlus').addEventListener('click', () => deps.adjustPacotes(1));
    document.getElementById('panelPacotesMinus').addEventListener('click', () => deps.adjustPacotes(-1));
    document.getElementById('editObsBtn').addEventListener('click', deps.editObservation);
    document.getElementById('editPhoneBtn').addEventListener('click', deps.editPhonesPanel);
    deps.setupPanelSwipe();
    deps.setupFabRailClearance();
    deps.setupPanelPhotoCapture();
    deps.setupUndoSnackbar();
    deps.setupHistoryListDelegation();
    deps.setupOverflowMenus();
    deps.setupBackupReminderUi();
    deps.setupAutoBackupScheduler();
    document.getElementById('mapNextChip')?.addEventListener('click', () => {
        const selected = deps.getCurrentSelectedDelivery();
        if (!selected) return;
        deps.focusDeliveryInPanel(selected, 0, { keepMinimized: false, pan: true, zoom: 16 });
    });
    if (deps.isNativeApp()) {
        document.documentElement.classList.add('native-app');
        deps.setupScreenLockNotificationBridge();
        deps.setupCameraRestoreHandler();
    }

    document.getElementById('profileBtn').addEventListener('click', deps.showProfileModal);
    deps.bindBackupButtons();

    document.getElementById('optimizeRouteBtn').addEventListener('click', deps.optimizeRoute);
    document.getElementById('optimizeRouteToolBtn')?.addEventListener('click', deps.optimizeRoute);
    deps.updateOptimizeFabVisibility();
    document.getElementById('archiveDayBtn')?.addEventListener('click', () => deps.archiveCurrentRouteDay({ silent: false }));
    document.getElementById('newRouteBtn')?.addEventListener('click', deps.startNewRoute);
    document.getElementById('newRouteMenuBtn')?.addEventListener('click', deps.startNewRoute);
    document.getElementById('clearRouteBtn').addEventListener('click', deps.clearRoute);
    document.getElementById('toggleSidebarBtn').addEventListener('click', deps.toggleSidebar);
    document.getElementById('copyFromRouteBtn').addEventListener('click', deps.copyFromOtherRoute);
    document.getElementById('gpsBtn').addEventListener('click', deps.toggleGps);
    deps.updateGpsButton();
    // No celular nativo o GPS funciona sem HTTPS; no browser precisa de contexto seguro.
    if (deps.getGpsEnabled() && (deps.isNativeApp() || window.isSecureContext)) {
        deps.enableGpsTracking().then(ok => {
            if (!ok) deps.updateGpsButton();
        });
    } else if (deps.getGpsEnabled() && !window.isSecureContext) {
        deps.updateGpsButton();
    }

    document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
        btn.addEventListener('click', () => deps.switchSidebarTab(btn.dataset.tab));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (deps.isGalleryOpen()) deps.closeGallery();
            else deps.closeDeliveryPanel();
        }
        if (deps.isGalleryOpen() && e.key === 'ArrowRight') deps.nextPhoto();
        if (deps.isGalleryOpen() && e.key === 'ArrowLeft') deps.prevPhoto();
    });

    setTimeout(() => {
        if (deps.getGeocoder()) return;
        const loading = document.getElementById('mapLoading');
        if (loading) loading.textContent = 'Mapa indisponível. Lista, agenda e backup continuam funcionando.';
    }, 8000);
}

export function setupDomContentLoadedBoot() {
    document.addEventListener('DOMContentLoaded', function() {
        deps.initAuthUi();
        initAppUi();
        localStorage.removeItem('rotaflow_reminders');
        deps.resetVoltarDepoisAlert();

        // Inicializa indicadores de sincronização
        initSyncStatusUI();

        // Busca simples na rota
        document.getElementById("routeSearchInput").addEventListener("input", deps.debounce((e) => {
            advancedFilters.setFilter('search', e.target.value.toLowerCase());
            deps.renderDeliveriesList();
        }, 150));

        // Inicializa filtros avançados
        const panelRota = document.getElementById('panelRota');
        if (panelRota) {
            initFiltersUI(panelRota, () => {
                deps.renderDeliveriesList();
            });
        }

        // Busca na agenda (mantém comportamento anterior)
        document.getElementById("agendaSearchInput").addEventListener("input", deps.debounce((e) => {
            deps.setAgendaFilter(e.target.value.toLowerCase());
            deps.renderAgendaList();
        }, 150));

        deps.setupAddDeliveryForm();
    });
}

/** Quanto tempo o SDK do Maps pode esperar antes de carregar mesmo sem interação. */
const MAPS_DEFER_MS = 600;

/** Carrega o JSON do SDK. Idempotente: segunda chamada não injeta outro script. */
export function loadGoogleMapsJs() {
    const key = window.ROTAFLOW_MAPS_KEY || '';
    if (!key || document.querySelector('script[data-rf-maps]')) return;
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key)
        + '&callback=initMap&loading=async&v=weekly';
    s.async = true;
    s.defer = true;
    s.dataset.rfMaps = '1';
    document.head.appendChild(s);
}

/**
 * O SDK do Google Maps tem ~2 MB e não é necessário para a primeira pintura: a lista,
 * a agenda e o painel renderizam sem ele. Carregar no boot disputa CPU/rede com o
 * parse do bundle. Aqui o loader é disparado depois do frame pintado, e antecipado se
 * o motorista tocar no mapa antes disso.
 * O loader continua sendo o mesmo (`loading=async` + `callback=initMap`), só a injeção
 * do <script> muda de momento — nada é re-inserido.
 */
function scheduleMapsLoad() {
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        cleanup();
        loadGoogleMapsJs();
    };
    const onInteract = (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest('#map, capacitor-google-map')) run();
    };
    const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener('pointerdown', onInteract, true);
        document.removeEventListener('touchstart', onInteract, true);
        window.removeEventListener('online', run);
    };

    // interação no mapa ou volta da rede -> carrega na hora
    document.addEventListener('pointerdown', onInteract, true);
    document.addEventListener('touchstart', onInteract, true);
    window.addEventListener('online', run);

    // espera o primeiro frame estar pintado e o main thread respirar
    const timer = setTimeout(() => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
        else run();
    }, MAPS_DEFER_MS);
}

export function setupRuntimeBoot() {
    window.initMap = deps.initMap;
    scheduleMapsLoad();
    window.addEventListener('beforeunload', deps.persistStorageNow);

    if ('serviceWorker' in navigator && !deps.isNativeApp()) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Manifesto PWA embutido (o app é um arquivo único).
    (function () {
        const dir = location.pathname.replace(/[^/]*$/, '');
        const APP_ICON = deps.getAppIcon();
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
}
