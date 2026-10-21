/**
 * Boot da UI do motorista: initAppUi, DOMContentLoaded, PWA e service worker.
 * Dependências injetadas via configureAppBoot() — main.js só orquestra.
 */
// Tema escuro em módulo próprio: precisa rodar antes do 1º paint e o
// profile.js (modal, ~10 KB) agora é lazy.
import { initDarkModeFromStorage } from './theme.js';
import { abrirResumoDoDia, iniciarTickerDeTempo, configureTempoUi } from './tempo-ui.js';
import { advancedFilters } from './advanced-filters.js';
import { initSyncStatusUI } from './sync-status.js';
import { initAddressSuggestions, configureAddressSuggestions } from './address-suggestions.js';
// Patch 20: teclado do celular em módulo próprio (o boot fica só com a ligação).
import { setupTecladoNaFolha } from './teclado-folha.js';
// Patch 21: diagnóstico no aparelho (long-press em "Salvo no aparelho").
import { initDiagnostico } from './diagnostico.js';

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
    getDeliveries: () => [],
    getAgenda: () => [],
    getHistory: () => [],
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
    setupFiltersUi: () => {},
    setupAddDeliveryForm: () => {},
    initMap: () => {},
    persistStorageNow: () => {},
    getAppIcon: () => ''
};

export function configureAppBoot(opts) {
    deps = { ...deps, ...(opts || {}) };
}

/** Patch 19: marca #dayProgress como "grudado" quando o painel da rota rola. */
export function setupProgressoSticky() {
    const painel = document.getElementById('panelRota');
    const progresso = document.getElementById('dayProgress');
    if (!painel || !progresso || painel.dataset.stickyProgresso === 'on') return;
    painel.dataset.stickyProgresso = 'on';
    let grudado = false;
    const atualizar = () => {
        const rolou = painel.scrollTop > 24;
        if (rolou === grudado) return;
        grudado = rolou;
        progresso.classList.toggle('is-scrolled', rolou);
    };
    painel.addEventListener('scroll', atualizar, { passive: true });
    // trocar de aba pode zerar o scroll sem disparar evento: reavalia no clique
    document.querySelectorAll('.sidebar-tabs button').forEach((btn) => {
        btn.addEventListener('click', () => requestAnimationFrame(atualizar));
    });
}

/** Interface do motorista. Roda no DOMContentLoaded, sem esperar o callback do Google Maps. */
export function initAppUi() {
    if (initAppUi.done) return;
    initAppUi.done = true;
    initDarkModeFromStorage();
    deps.initNameSuggestions();
    // Patch 20: sugestões do campo de endereço (o autocomplete do Places saiu do ar em 2025).
    configureAddressSuggestions({
        getDeliveries: deps.getDeliveries,
        getAgenda: deps.getAgenda,
        getHistory: deps.getHistory,
        getGeocoder: deps.getGeocoder,
        showToast: deps.showToast
    });
    initAddressSuggestions();
    setupTecladoNaFolha();
    initDiagnostico({
        getDeliveries: deps.getDeliveries,
        getAgenda: deps.getAgenda,
        getHistory: deps.getHistory,
        isNativeApp: deps.isNativeApp,
        showToast: deps.showToast
    });
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
    // Patch 16: com as ferramentas consolidadas, os dois botões vivem no menu ⋯.
    document.getElementById('clearRouteBtn')?.addEventListener('click', deps.clearRoute);
    document.getElementById('clearRouteMenuBtn')?.addEventListener('click', deps.clearRoute);
    // Patch 19: o progresso do dia fica preso no topo do painel enquanto a lista
    // rola; ao passar de ~24 px ele encolhe (perde os chips) para não roubar
    // altura das paradas.
    setupProgressoSticky();
    // Patch 14: cronômetro. O relógio já é gravado nas transições de status
    // (lib/delivery-status-helpers); aqui só ligamos o ticker da UI e o resumo.
    configureTempoUi({ getDeliveries: deps.getDeliveries });
    iniciarTickerDeTempo();
    document.getElementById('resumoTempoBtn')?.addEventListener('click', () => abrirResumoDoDia(deps.getDeliveries()));
    document.getElementById('toggleSidebarBtn').addEventListener('click', () => {
        // Patch 12: o botão de menu continua abrindo/fechando de vez; ao fechar,
        // a folha volta ao encaixe padrão na próxima abertura.
        document.getElementById('appContainer')?.classList.remove('sheet-expanded');
        syncSheetHandle();
        deps.toggleSidebar();
    });
    setupSheetHandle();
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

        // Filtros avançados: só o placeholder sobe no boot; o painel (chips, bairros,
        // presets) é baixado no primeiro toque — ver setupFiltersUi no main.js.
        deps.setupFiltersUi();

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

/**
 * Patch 12 — folha inferior (bottom sheet) no celular.
 * Dois encaixes: padrão (~58% da tela, mapa visível em cima) e expandido (~90%).
 * Puro DOM: não mexe em estado do app, só na classe do container.
 */
export function setupSheetHandle() {
    const handle = document.getElementById('sheetHandle');
    const app = document.getElementById('appContainer');
    if (!handle || !app || handle.dataset.rfBound) return;
    handle.dataset.rfBound = '1';
    handle.addEventListener('click', () => {
        app.classList.toggle('sheet-expanded');
        syncSheetHandle();
    });
}

function syncSheetHandle() {
    const handle = document.getElementById('sheetHandle');
    const app = document.getElementById('appContainer');
    if (!handle || !app) return;
    const aberto = !app.classList.contains('sidebar-hidden');
    const expandido = app.classList.contains('sheet-expanded');
    handle.setAttribute('aria-expanded', String(aberto && expandido));
    handle.hidden = !aberto;
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
