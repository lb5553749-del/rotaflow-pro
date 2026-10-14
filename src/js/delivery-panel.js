/**
 * Painel inferior da entrega — open/close/minimize, ações, fotos e swipe.
 * main.js injeta estado, mapa, status e persistência via configureDeliveryPanel().
 */
import {
    isActiveStop,
    isPreferredNextStop,
    findNextInSequence,
    deliveryProgressInfo as deliveryProgressInfoOf,
    deliveryPhotoCount,
    shouldKeepPanelMinimized,
    adjacentIndexResult,
    panelOpenClassPlan,
    panelCloseClassPlan,
    formatPanelPhonesText,
    panelMiniPhotoUiState,
    resolvePanelSwipeGesture,
    panelActionFlags
} from '../../lib/panel-helpers.js';
import { shortStreetAddress } from '../../lib/map-helpers.js';
import { formatPhoneShort } from '../../lib/phone-helpers.js';
import { hasMapCoords } from '../../lib/routing-helpers.js';

let deps = {
    getDeliveries: () => [],
    getCurrentSelected: () => null,
    setCurrentSelected: () => {},
    ensureItemPhotos: async () => {},
    resetHighlightedMarker: () => {},
    hideMapSelectedChip: () => {},
    isNativeApp: () => false,
    openExternalUrl: async () => false,
    sendWhatsApp: () => {},
    undoDeliveryStatus: () => {},
    markNotDelivered: () => {},
    markDelivered: () => {},
    capturePhotoForSelectedDelivery: async () => {},
    showToast: () => {},
    syncActiveStopNotification: () => {},
    clearActiveStopNotification: () => {},
    updateMapNextChip: () => {},
    getMarker: () => null,
    highlightMarker: () => {},
    focusMapOnDelivery: () => {},
    openGallery: () => {},
    saveDeliveryPhotoToAgenda: async () => false,
    idbDeletePhoto: async () => {},
    saveStorage: () => {},
    scheduleDeliveriesListPhotoRefresh: () => {},
    isVehicleModeEnabled: () => false,
    showChoiceModal: async () => null,
    buildNavigationUrls: null,
    getRiskLevelForDelivery: () => null
};

let panelSwipeConsumedUntil = 0;

let fabClearanceObserver = null;

/**
 * Mede a altura real do painel aberto e repassa para --panel-mini-h, usada para
 * afastar a rail de FABs (GPS / otimizar rota). Sem isso a rail fica presa a uma
 * constante de 112px e o mini-painel (que não tem altura definida) cresce por
 * baixo dos botões — GPS branco sobre cartão branco parece ter sumido.
 */
function syncFabRailClearance() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel) return;
    const root = document.documentElement;
    if (!panel.classList.contains('open')) {
        root.style.setProperty('--panel-mini-h', '0px');
        return;
    }
    const target = panel.classList.contains('minimized')
        ? panel.querySelector('.panel-mini')
        : panel;
    const height = target ? target.getBoundingClientRect().height : 0;
    root.style.setProperty('--panel-mini-h', `${Math.ceil(height)}px`);
}

export function setupFabRailClearance() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel) return;
    if (typeof ResizeObserver !== 'undefined') {
        if (fabClearanceObserver) fabClearanceObserver.disconnect();
        fabClearanceObserver = new ResizeObserver(() => syncFabRailClearance());
        fabClearanceObserver.observe(panel);
    }
    syncFabRailClearance();
}

export function configureDeliveryPanel(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export {
    isActiveStop,
    isPreferredNextStop,
    findNextInSequence,
    deliveryPhotoCount,
    shouldKeepPanelMinimized,
    adjacentIndexResult,
    formatPanelPhonesText,
    panelMiniPhotoUiState,
    resolvePanelSwipeGesture,
    panelActionFlags,
    panelOpenClassPlan,
    panelCloseClassPlan
};

export function deliveryProgressInfo(delivery) {
    return deliveryProgressInfoOf(delivery, deps.getDeliveries(), isActiveStop);
}

export function wasPanelSwipeJustConsumed(now = Date.now()) {
    return now < panelSwipeConsumedUntil;
}

export function markPanelSwipeConsumed(ms = 400, now = Date.now()) {
    panelSwipeConsumedUntil = now + ms;
}

export function withMiniActionGuard(handler) {
    return (e) => {
        if (wasPanelSwipeJustConsumed()) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        handler(e);
    };
}

export function minimizeDeliveryPanel() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel || !panel.classList.contains('open')) return;
    panel.classList.add('minimized');
    syncFabRailClearance();
}

export function expandDeliveryPanel() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel || !panel.classList.contains('open')) return;
    panel.classList.remove('minimized');
    syncFabRailClearance();
    const d = deps.getCurrentSelected();
    if (!d) return;
    // Se abriu em modo mini sem hidratar fotos, completa ao expandir.
    deps.ensureItemPhotos(d).then(() => {
        if (deps.getCurrentSelected() && deps.getCurrentSelected().id === d.id) {
            refreshPanelPhotos(d);
        }
    }).catch(() => {});
}

/**
 * Aplica classes de fechamento e limpa seleção/destaque.
 * Não mexe em notificações nativas (fica no caller se necessário).
 */
export function closeDeliveryPanelShell() {
    const panel = document.getElementById('deliveryPanel');
    if (panel) {
        const plan = panelCloseClassPlan();
        panel.classList.toggle('open', plan.open);
        panel.classList.toggle('minimized', plan.minimized);
        panel.classList.toggle('red-bg', plan.redBg);
    }
    deps.setCurrentSelected(null);
    deps.resetHighlightedMarker();
    deps.hideMapSelectedChip();
    syncFabRailClearance();
}

export function closeDeliveryPanel() {
    closeDeliveryPanelShell();
    // Entrega ativa continua no nativo para a tela de bloqueio.
}

/**
 * Aplica classes de abertura (conteúdo HTML continua no caller ou em openDeliveryPanel).
 * @param {object} delivery
 * @param {boolean} [stayMini]
 */
export function applyDeliveryPanelOpenClasses(delivery, stayMini = false) {
    const panel = document.getElementById('deliveryPanel');
    if (!panel) return null;
    const plan = panelOpenClassPlan(delivery, stayMini);
    panel.classList.toggle('open', plan.open);
    panel.classList.toggle('minimized', plan.minimized);
    panel.classList.toggle('red-bg', plan.redBg);
    syncFabRailClearance();
    return panel;
}

export function animatePanelSwipe(direction) {
    const content = document.querySelector('#deliveryPanel .panel-content');
    if (!content) return;
    content.classList.remove('swipe-anim-next', 'swipe-anim-prev');
    void content.offsetWidth;
    content.classList.add(direction > 0 ? 'swipe-anim-next' : 'swipe-anim-prev');
}

function getPanelDeliveryIndex() {
    const selected = deps.getCurrentSelected();
    if (!selected) return -1;
    return deps.getDeliveries().findIndex((d) => d.id === selected.id);
}

/** Ordem de navegação = ordem física da lista (Otimizar já reordena o array). */
function getNavigationSequence() {
    return deps.getDeliveries();
}

export function focusDeliveryInPanel(delivery, direction = 0, opts = {}) {
    if (!delivery) return;
    openDeliveryPanel(delivery, opts);
    const marker = deps.getMarker(delivery.sequentialId);
    if (marker) deps.highlightMarker(marker, delivery);
    // Swipe entre entregas: não mexe no mapa. Chip / foco explícito: pan + zoom.
    if (opts.pan === true) deps.focusMapOnDelivery(delivery, { zoom: opts.zoom });
    if (direction !== 0) animatePanelSwipe(direction);
}

// direction: 1 = próxima (deslize esquerda), -1 = anterior (deslize direita)
export function goToAdjacentDelivery(direction, { preferPending = false, keepMinimized = false } = {}) {
    const deliveries = deps.getDeliveries();
    if (!deliveries.length) {
        closeDeliveryPanel();
        return;
    }
    const panel = document.getElementById('deliveryPanel');
    const stayMini = shouldKeepPanelMinimized(panel, keepMinimized);
    const seq = getNavigationSequence();
    const idx = getPanelDeliveryIndex();

    if (preferPending) {
        // Primeiro só para frente (evita pular para outra rua no início da rota).
        // Só dá a volta se não houver nada à frente.
        const next =
            findNextInSequence(seq, idx, isPreferredNextStop, { wrap: false }) ||
            findNextInSequence(seq, idx, isActiveStop, { wrap: false }) ||
            findNextInSequence(seq, idx, isPreferredNextStop, { wrap: true }) ||
            findNextInSequence(seq, idx, isActiveStop, { wrap: true });
        if (next) {
            focusDeliveryInPanel(next, 1, { keepMinimized: stayMini, pan: false });
            return;
        }
        if (idx >= 0) openDeliveryPanel(seq[idx], { keepMinimized: stayMini });
        else {
            closeDeliveryPanel();
            deps.clearActiveStopNotification();
        }
        deps.showToast('Todas as entregas foram concluídas');
        return;
    }

    const adj = adjacentIndexResult(idx, direction, seq.length);
    if (!adj.ok) {
        if (adj.reason === 'first') deps.showToast('Você está na primeira entrega');
        else if (adj.reason === 'last') deps.showToast('Você está na última entrega');
        return;
    }
    focusDeliveryInPanel(seq[adj.next], direction, { keepMinimized: stayMini, pan: false });
}

export function fillDeliveryPanelMeta(delivery) {
    const street = shortStreetAddress(delivery.endereco);
    const { current, total } = deliveryProgressInfo(delivery);
    const progress = `${current}/${total || 0}`;
    const idText = String(delivery.sequentialId || '—');

    const miniAddr = document.getElementById('panelMiniAddress');
    const miniId = document.getElementById('panelMiniId');
    const miniQty = document.getElementById('panelMiniQty');
    const qty = delivery.pacotes || 1;
    if (miniAddr) miniAddr.textContent = street;
    if (miniId) miniId.textContent = idText;
    if (miniQty) {
        miniQty.textContent = String(qty);
        miniQty.classList.toggle('pacotes-highlight', qty >= 2);
    }
    updatePanelMiniPhotoUi(delivery);

    const title = document.getElementById('panelAddressTitle');
    const prog = document.getElementById('panelProgressText');
    const idBadge = document.getElementById('panelIdBadge');
    if (title) title.textContent = street;
    if (prog) prog.textContent = progress;
    if (idBadge) idBadge.textContent = idText;
}

export async function openMapsNavigation(delivery) {
    if (!delivery || !hasMapCoords(delivery)) return;
    const lat = Number(delivery.lat);
    const lng = Number(delivery.lng);
    const urls = typeof deps.buildNavigationUrls === 'function'
        ? deps.buildNavigationUrls(lat, lng)
        : {
            googleNav: `google.navigation:q=${lat},${lng}`,
            googleWeb: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
            waze: `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`
        };

    if (deps.isVehicleModeEnabled() && typeof deps.showChoiceModal === 'function') {
        const choice = await deps.showChoiceModal({
            title: 'Navegar',
            message: 'Abrir no app de mapas',
            options: [
                { value: 'google', label: 'Google Maps', icon: 'fas fa-location-arrow', iconColor: '#1A73E8' },
                { value: 'waze', label: 'Waze', icon: 'fas fa-route', iconColor: '#33CCFF' }
            ]
        });
        if (!choice) return;
        if (choice === 'waze') {
            const ok = await deps.openExternalUrl(urls.waze);
            if (!ok) deps.showToast('Não foi possível abrir o Waze', true);
            return;
        }
    }

    if (deps.isNativeApp()) {
        const ok = await deps.openExternalUrl(urls.googleNav);
        if (ok) return;
    }
    const opened = await deps.openExternalUrl(urls.googleWeb);
    if (!opened) deps.showToast('Não foi possível abrir a navegação', true);
}

export function setupPanelSwipe() {
    const panel = document.getElementById('deliveryPanel');
    if (!panel || panel.dataset.swipeReady) return;
    panel.dataset.swipeReady = '1';
    const mini = document.getElementById('panelMini');
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (x, y) => {
        startX = x;
        startY = y;
        tracking = true;
    };
    const onEnd = (x, y) => {
        if (!tracking || !panel.classList.contains('open')) return;
        tracking = false;
        const dx = x - startX;
        const dy = y - startY;
        const isMini = panel.classList.contains('minimized');
        const gesture = resolvePanelSwipeGesture(dx, dy);
        if (!gesture) return;
        if (gesture.type === 'minimize') {
            minimizeDeliveryPanel();
            return;
        }
        if (gesture.type === 'expand') {
            expandDeliveryPanel();
            return;
        }
        markPanelSwipeConsumed();
        // Minimizado: troca entrega e permanece mini (não expandir).
        goToAdjacentDelivery(gesture.type === 'next' ? 1 : -1, { keepMinimized: isMini });
    };

    const bindSwipeTarget = (el, { stopBubble = false, allowButtons = false } = {}) => {
        if (!el) return;
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            if (stopBubble) e.stopPropagation();
            onStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            if (!e.changedTouches.length) return;
            if (stopBubble) e.stopPropagation();
            onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        }, { passive: true });
        el.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return;
            if (!allowButtons && e.target.closest('button, a, input, select, textarea')) return;
            if (stopBubble) e.stopPropagation();
            onStart(e.clientX, e.clientY);
        });
        el.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'touch') return;
            if (stopBubble) e.stopPropagation();
            onEnd(e.clientX, e.clientY);
        });
    };

    // Expandido: gesto no painel. Mini: listener dedicado (pointer-events próprios).
    bindSwipeTarget(panel, { allowButtons: false });
    bindSwipeTarget(mini, { stopBubble: true, allowButtons: true });

    document.getElementById('panelMiniInfo')?.addEventListener('click', (e) => {
        if (wasPanelSwipeJustConsumed()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        expandDeliveryPanel();
    });
    document.getElementById('panelHandle')?.addEventListener('click', () => {
        if (panel.classList.contains('minimized')) expandDeliveryPanel();
        else minimizeDeliveryPanel();
    });
}

export function renderDeliveryPanelActions(delivery) {
    const actionsDiv = document.getElementById('panelActions');
    const miniActions = document.getElementById('panelMiniActions');
    if (!actionsDiv || !delivery) return;
    actionsDiv.innerHTML = '';
    if (miniActions) miniActions.innerHTML = '';

    const flags = panelActionFlags(delivery, hasMapCoords(delivery));

    // Expandido: Navegar e WhatsApp sempre que relevantes (não se excluem).
    if (flags.showNav) {
        const navBtn = document.createElement('button');
        navBtn.type = 'button';
        navBtn.className = 'panel-action-btn nav-fallback'
            + (deps.isVehicleModeEnabled() ? ' nav-vehicle' : '');
        navBtn.innerHTML = deps.isVehicleModeEnabled()
            ? '<i class="fas fa-location-arrow"></i><span>Mapas / Waze</span>'
            : '<i class="fas fa-location-arrow"></i><span>Navegar</span>';
        navBtn.onclick = () => openMapsNavigation(delivery);
        actionsDiv.appendChild(navBtn);
    }
    if (flags.showWhatsApp) {
        const waBtn = document.createElement('button');
        waBtn.type = 'button';
        waBtn.className = 'panel-action-btn whatsapp-primary';
        waBtn.title = 'Enviar WhatsApp com link de rastreio';
        waBtn.innerHTML = '<i class="fab fa-whatsapp"></i><span>WhatsApp</span>';
        waBtn.onclick = () => deps.sendWhatsApp(delivery);
        actionsDiv.appendChild(waBtn);
    }

    if (flags.showUndo) {
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'panel-action-btn undo';
        undoBtn.innerHTML = '<i class="fas fa-rotate-left"></i><span>Desfazer</span>';
        undoBtn.onclick = () => {
            const mini = document.getElementById('deliveryPanel')?.classList.contains('minimized');
            deps.undoDeliveryStatus(delivery.id, { keepPanel: true, keepMinimized: mini });
        };
        actionsDiv.appendChild(undoBtn);
    } else {
        const failBtn = document.createElement('button');
        failBtn.type = 'button';
        failBtn.className = 'panel-action-btn fail';
        failBtn.innerHTML = '<i class="fas fa-box"></i><span>Falhou</span>';
        failBtn.onclick = () => deps.markNotDelivered(delivery.id);
        actionsDiv.appendChild(failBtn);

        const deliverBtn = document.createElement('button');
        deliverBtn.type = 'button';
        deliverBtn.className = 'panel-action-btn deliver';
        deliverBtn.innerHTML = '<i class="fas fa-box-open"></i><span>Entregar</span>';
        deliverBtn.onclick = () => { deps.markDelivered(delivery.id, { advance: true }); };
        actionsDiv.appendChild(deliverBtn);
    }

    if (!miniActions) return;

    const miniPhoto = document.createElement('button');
    miniPhoto.type = 'button';
    miniPhoto.className = 'mini-action-btn photo';
    miniPhoto.title = 'Tirar foto desta entrega';
    miniPhoto.setAttribute('aria-label', 'Tirar foto');
    miniPhoto.innerHTML = '<i class="fas fa-camera"></i><span>Tirar foto</span>';
    miniPhoto.onclick = withMiniActionGuard(() => deps.capturePhotoForSelectedDelivery('camera'));
    miniActions.appendChild(miniPhoto);

    // Mini: Navegar + WhatsApp sempre que houver coords / telefone (mesmo com rota ativa).
    if (flags.showNav) {
        const miniNav = document.createElement('button');
        miniNav.type = 'button';
        miniNav.className = 'mini-action-btn nav'
            + (deps.isVehicleModeEnabled() ? ' nav-vehicle' : '');
        miniNav.innerHTML = deps.isVehicleModeEnabled()
            ? '<i class="fas fa-location-arrow"></i><span>Mapas</span>'
            : '<i class="fas fa-location-arrow"></i><span>Navegar</span>';
        miniNav.onclick = withMiniActionGuard(() => openMapsNavigation(delivery));
        miniActions.appendChild(miniNav);
    }
    if (flags.showWhatsApp) {
        const miniWa = document.createElement('button');
        miniWa.type = 'button';
        miniWa.className = 'mini-action-btn whatsapp';
        miniWa.title = 'Enviar WhatsApp com link de rastreio';
        miniWa.innerHTML = '<i class="fab fa-whatsapp"></i><span>WhatsApp</span>';
        miniWa.onclick = withMiniActionGuard(() => deps.sendWhatsApp(delivery));
        miniActions.appendChild(miniWa);
    }
    miniActions.classList.toggle('has-dual-cta', flags.hasDualCta);

    if (flags.showUndo) {
        const miniUndo = document.createElement('button');
        miniUndo.type = 'button';
        miniUndo.className = 'mini-action-btn undo';
        miniUndo.innerHTML = '<i class="fas fa-rotate-left"></i><span>Desfazer</span>';
        miniUndo.onclick = withMiniActionGuard(() => {
            deps.undoDeliveryStatus(delivery.id, { keepPanel: true, keepMinimized: true });
        });
        miniActions.appendChild(miniUndo);
    } else {
        const miniFail = document.createElement('button');
        miniFail.type = 'button';
        miniFail.className = 'mini-action-btn fail';
        miniFail.innerHTML = '<i class="fas fa-box"></i><span>Falhou</span>';
        miniFail.onclick = withMiniActionGuard(() => deps.markNotDelivered(delivery.id));
        miniActions.appendChild(miniFail);

        const miniDeliver = document.createElement('button');
        miniDeliver.type = 'button';
        miniDeliver.className = 'mini-action-btn deliver';
        miniDeliver.innerHTML = '<i class="fas fa-box-open"></i><span>Entregar</span>';
        miniDeliver.onclick = withMiniActionGuard(() => deps.markDelivered(delivery.id, { advance: true }));
        miniActions.appendChild(miniDeliver);
    }
}

export async function openDeliveryPanel(delivery, { keepMinimized = false } = {}) {
    if (!delivery) return;
    const stayMini = !!keepMinimized;
    // Painel mini só precisa do contador — hidratar JPEGs aqui estoura RAM no Android ao "baixar" e avançar.
    if (!stayMini) {
        try {
            await deps.ensureItemPhotos(delivery);
        } catch (e) {
            console.warn('ensureItemPhotos', e);
        }
    }
    deps.setCurrentSelected(delivery);
    const panel = document.getElementById('deliveryPanel');
    if (!panel) return;

    try {
        fillDeliveryPanelMeta(delivery);
        const nameEl = document.getElementById('panelName');
        if (nameEl) nameEl.textContent = delivery.nome || '';

        const pacotesSpan = document.getElementById('panelPacotesValue');
        if (pacotesSpan) {
            pacotesSpan.innerText = delivery.pacotes || 1;
            pacotesSpan.classList.toggle('pacotes-highlight', (delivery.pacotes || 1) >= 2);
        }

        const phoneContainer = document.getElementById('panelPhone');
        if (phoneContainer) {
            phoneContainer.textContent = formatPanelPhonesText(delivery.telefones, formatPhoneShort);
        }
        const obsEl = document.getElementById('panelObsText');
        if (obsEl) obsEl.innerText = delivery.notes ? delivery.notes : 'Nenhuma observação';
        if (stayMini) updatePanelMiniPhotoUi(delivery);
        else refreshPanelPhotos(delivery);
        renderDeliveryPanelActions(delivery);
    } catch (e) {
        console.warn('openDeliveryPanel ui', e);
    }
    applyDeliveryPanelOpenClasses(delivery, stayMini);
    try { deps.syncActiveStopNotification(delivery); } catch (_) {}
    try { deps.updateMapNextChip(); } catch (_) {}
}

export function updatePanelMiniPhotoUi(delivery) {
    const state = panelMiniPhotoUiState(deliveryPhotoCount(delivery));
    const mini = document.getElementById('panelMiniPhoto');
    const miniCount = document.getElementById('panelMiniPhotoCount');
    const panelCount = document.getElementById('panelPhotoCount');
    const saveAgendaBtn = document.getElementById('panelSavePhotoAgendaBtn');
    if (miniCount) miniCount.textContent = String(state.count);
    if (mini) {
        if (!state.miniHidden) {
            mini.hidden = false;
            mini.title = state.miniTitle;
        } else {
            mini.hidden = true;
        }
    }
    if (panelCount) {
        if (!state.panelCountHidden) {
            panelCount.hidden = false;
            panelCount.textContent = state.panelCountText;
        } else {
            panelCount.hidden = true;
            panelCount.textContent = '';
        }
    }
    if (saveAgendaBtn) {
        saveAgendaBtn.disabled = state.saveAgendaDisabled;
        saveAgendaBtn.title = state.saveAgendaTitle;
    }
}

export function refreshPanelPhotos(delivery) {
    const container = document.getElementById('panelPhotos');
    updatePanelMiniPhotoUi(delivery);
    if (!container) return;
    container.innerHTML = '';
    if (delivery && delivery.photos && delivery.photos.length) {
        delivery.photos.forEach((photo, idx) => {
            appendPanelPhotoNode(delivery, photo, idx, container);
        });
    } else {
        container.innerHTML = '<span class="panel-photos-empty" style="color:#94a3b8; font-size:0.75rem;">Nenhuma foto</span>';
    }
}

export function appendPanelPhotoNode(delivery, photo, idx, container = null) {
    const host = container || document.getElementById('panelPhotos');
    if (!host) return null;
    host.querySelector('.panel-photos-empty')?.remove();
    const emptyHint = host.querySelector('span[style*="94a3b8"]');
    if (emptyHint && emptyHint.textContent && emptyHint.textContent.includes('Nenhuma')) emptyHint.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'photo-wrapper';
    if (String(photo || '').startsWith('blob:') || wrapper.dataset.optimistic) {
        wrapper.dataset.optimistic = '1';
    }
    const img = document.createElement('img');
    img.src = photo;
    img.className = 'panel-photo';
    img.loading = 'lazy';
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        deps.openGallery(delivery.photos, idx);
    });
    const saveAgendaBtn = document.createElement('button');
    saveAgendaBtn.type = 'button';
    saveAgendaBtn.className = 'save-panel-photo-agenda';
    saveAgendaBtn.title = 'Salvar na agenda';
    saveAgendaBtn.setAttribute('aria-label', 'Salvar foto na agenda');
    saveAgendaBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
    saveAgendaBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deps.saveDeliveryPhotoToAgenda(delivery, idx);
    });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-panel-photo';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pid = delivery.photoIds && delivery.photoIds[idx];
        if (pid) {
            try { await deps.idbDeletePhoto(pid); } catch (err) {}
            delivery.photoIds.splice(idx, 1);
        }
        delivery.photos.splice(idx, 1);
        deps.saveStorage();
        refreshPanelPhotos(delivery);
        deps.scheduleDeliveriesListPhotoRefresh();
        deps.showToast('Foto removida com sucesso');
    });
    wrapper.appendChild(img);
    wrapper.appendChild(saveAgendaBtn);
    wrapper.appendChild(removeBtn);
    host.appendChild(wrapper);
    return wrapper;
}

export function showOptimisticPanelPhoto(delivery, previewUrl) {
    if (!delivery || !previewUrl) return null;
    if (!Array.isArray(delivery.photos)) delivery.photos = [];
    // Contagem visual imediata (sem photoId ainda).
    updatePanelMiniPhotoUi({
        ...delivery,
        photos: [...delivery.photos, previewUrl],
        photoIds: [...(delivery.photoIds || []), 'pending']
    });
    const wrapper = appendPanelPhotoNode(delivery, previewUrl, delivery.photos.length, document.getElementById('panelPhotos'));
    if (wrapper) wrapper.dataset.optimistic = '1';
    return wrapper;
}
