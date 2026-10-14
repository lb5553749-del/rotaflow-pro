/**
 * Menu lateral, abas e menus overflow (rota / lista / agenda).
 * Sem estado de domínio — só DOM; close de painel/mapa vem via configureSidebar().
 */

let deps = {
    closeDeliveryPanel: () => {},
    hideMapSelectedChip: () => {},
    updateMapNextChip: () => {},
    getMap: () => null
};

export function configureSidebar(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function switchSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.sidebar-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab);
    });
}

export function closeAllOverflowMenus() {
    document.querySelectorAll('.overflow-wrap.open').forEach(el => {
        el.classList.remove('open');
        const trigger = el.querySelector('.overflow-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.delivery-item.menu-open, .agenda-item.menu-open').forEach(el => {
        el.classList.remove('menu-open');
    });
}

export function openOverflowWrap(wrap) {
    if (!wrap) return;
    wrap.classList.add('open');
    const trigger = wrap.querySelector('.overflow-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    const row = wrap.closest('.delivery-item, .agenda-item');
    if (row) row.classList.add('menu-open');
    // O painel é absolute dentro de .sidebar-panel (overflow-y: auto) e não escapa
    // da scrollport: rola o item pra a área visível e inverte o painel se faltar espaço.
    requestAnimationFrame(() => positionOverflowPanel(wrap, row));
}

function positionOverflowPanel(wrap, row) {
    const panel = wrap.querySelector('.overflow-panel');
    if (!panel) return;
    const scroller = (row || wrap).closest('.sidebar-panel');
    panel.classList.remove('open-up');
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const belowSpace = scrollerRect.bottom - panelRect.bottom;
    if (belowSpace < 0) {
        // Não cabe embaixo: tenta inverter pra cima se houver mais espaço acima.
        const triggerRect = (row || wrap).getBoundingClientRect();
        const aboveSpace = triggerRect.top - scrollerRect.top;
        if (aboveSpace > panelRect.height + 12) {
            panel.classList.add('open-up');
            return;
        }
        // Sem espaço dos dois lados: rola até que o item fique visível.
        if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

export function setupOverflowMenus() {
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

/** Fecha painéis/modais abertos ao abrir o menu lateral (não fecha o próprio sidebar). */
export function closeAllOverlaysExceptMenu() {
    closeAllOverflowMenus();
    deps.closeDeliveryPanel();
    deps.hideMapSelectedChip();
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

export function toggleSidebar() {
    const app = document.getElementById("appContainer");
    const opening = app.classList.contains("sidebar-hidden");
    app.classList.toggle("sidebar-hidden");
    if (opening) closeAllOverlaysExceptMenu();
    deps.updateMapNextChip();
    setTimeout(() => {
        const map = deps.getMap();
        if (map && window.google?.maps?.event) google.maps.event.trigger(map, 'resize');
    }, 200);
}
