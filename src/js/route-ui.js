/**
 * HUD da rota: badge de contagem, chip do mapa, resumo do dia, ETA e last-id.
 * Estado de rota/seleção via configureRouteUi().
 */
import { hasMapCoords } from '../../lib/routing-helpers.js';
import { shortStreetAddress } from '../../lib/map-helpers.js';
import { routeDayStats } from '../../lib/history-helpers.js';
import { dayProgressBar } from '../../lib/panel-helpers.js';
import { haversineDistance as haversineDistanceShared } from '../../lib/track-schema.js';

let deps = {
    getDeliveries: () => [],
    getCurrentSelectedDelivery: () => null,
    getRouteActive: () => false,
    getRouteMetrics: () => null,
    getStartPoint: () => null,
    isActiveStop: () => false,
    pendingStops: () => [],
    routeSignature: () => '',
    formatDuration: (s) => String(s),
    formatKm: (m) => String(m),
    updateOptimizeFabVisibility: () => {},
    maybeShowBackupReminder: () => {},
    renderRouteSwitcher: () => {},
    getMap: () => null,
    getUseNativeMap: () => false,
    getNativeGoogleMap: () => null,
    setNativeMapZoom: () => {},
    getRiskLevelForDelivery: () => null
};

export function configureRouteUi(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function updateDeliveryStats() {
    const total = deps.getDeliveries().length;
    const badge = document.getElementById('deliveryCountBadge');
    if (badge) badge.innerHTML = total;
    updateProgressAndEstimates();
    deps.updateOptimizeFabVisibility();
}

/** ETA da parada: preferir dados da otimização; senão heurística GPS→parada. */
export function estimateStopEta(stop) {
    if (!stop || !deps.isActiveStop(stop)) return null;
    const routeActive = deps.getRouteActive();
    const routeMetrics = deps.getRouteMetrics();
    if (typeof stop.etaSeconds === 'number' && stop.etaSeconds >= 0
        && routeActive && routeMetrics
        && routeMetrics.signature === deps.routeSignature(deps.pendingStops())) {
        return { seconds: stop.etaSeconds, source: 'route' };
    }
    if (typeof stop.legSeconds === 'number' && stop.legSeconds >= 0
        && routeActive && routeMetrics
        && routeMetrics.signature === deps.routeSignature(deps.pendingStops())) {
        return { seconds: stop.legSeconds, source: 'leg' };
    }
    const startPoint = deps.getStartPoint();
    if (startPoint && hasMapCoords(stop)) {
        const km = haversineDistanceShared(startPoint.lat, startPoint.lng, Number(stop.lat), Number(stop.lng));
        if (Number.isFinite(km)) {
            // ~25 km/h média urbana — aproximação honesta, não Directions.
            const seconds = Math.max(60, Math.round((km / 25) * 3600));
            return { seconds, source: 'approx' };
        }
    }
    return null;
}

export function isMapMenuOpen() {
    const app = document.getElementById('appContainer');
    return !!(app && !app.classList.contains('sidebar-hidden'));
}

export function hideMapSelectedChip() {
    const chip = document.getElementById('mapNextChip');
    if (!chip) return;
    chip.hidden = true;
    chip.classList.remove('is-visible');
    chip._selectedId = null;
}

/** HUD da parada selecionada no mapa — só aparece com pin/seleção ativa, some com o menu. */
export function updateMapNextChip() {
    const chip = document.getElementById('mapNextChip');
    const nameEl = document.getElementById('mapNextChipName');
    const clientEl = document.getElementById('mapNextChipClient');
    const labelEl = document.getElementById('mapNextChipLabel');
    const etaEl = document.getElementById('mapNextChipEta');
    if (!chip || !nameEl) return;

    const selected = deps.getCurrentSelectedDelivery();
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
    if (labelEl) {
        const risk = typeof deps.getRiskLevelForDelivery === 'function'
            ? deps.getRiskLevelForDelivery(selected)
            : null;
        const riskPrefix = risk === 'vermelho'
            ? '⚠ Risco alto · '
            : risk === 'amarelo'
                ? '⚠ Atenção · '
                : '';
        labelEl.textContent = street !== '—'
            ? riskPrefix + street
            : (riskPrefix || 'Endereço não informado');
        chip.classList.toggle('risk-amarelo', risk === 'amarelo');
        chip.classList.toggle('risk-vermelho', risk === 'vermelho');
    }

    const eta = estimateStopEta(selected);
    if (etaEl) {
        if (eta) {
            const prefix = eta.source === 'approx' ? '~' : '';
            etaEl.textContent = prefix + deps.formatDuration(eta.seconds);
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

export function updateDaySummary() {
    const deliveries = deps.getDeliveries();
    updateDayProgressBar(deliveries);
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
    const pending = deps.pendingStops();
    const routeActive = deps.getRouteActive();
    const routeMetrics = deps.getRouteMetrics();
    if (routeActive && routeMetrics && routeMetrics.signature === deps.routeSignature(pending)
        && typeof routeMetrics.meters === 'number' && routeMetrics.meters >= 0) {
        kmText = deps.formatKm(routeMetrics.meters) + ' rest.';
    }
    if (elKm) elKm.textContent = kmText;
    if (kmItem) kmItem.title = kmText === '—'
        ? 'Quilometragem disponível após otimizar a rota'
        : 'Distância restante da rota otimizada';

    root.hidden = deliveries.length === 0;
    deps.renderRouteSwitcher();
}

/**
 * Barra de progresso do dia (aba Rota): "8 de 15 entregas" + %.
 * Atualizada junto com o resumo do dia — todos os callers de
 * updateDeliveryStats()/updateProgressAndEstimates() já a refrescam.
 */
function updateDayProgressBar(deliveries) {
    const root = document.getElementById('dayProgress');
    if (!root) return;
    const bar = dayProgressBar(routeDayStats(deliveries));
    const label = document.getElementById('dayProgressLabel');
    const pctEl = document.getElementById('dayProgressPct');
    const fill = document.getElementById('dayProgressFill');
    if (label) label.textContent = bar.label;
    if (pctEl) pctEl.textContent = `${bar.pct}%`;
    if (fill) {
        fill.style.width = `${bar.pct}%`;
        fill.classList.toggle('complete', bar.total > 0 && bar.done === bar.total);
    }
    root.setAttribute('aria-valuenow', String(bar.pct));
    root.hidden = bar.total === 0;
}

export function updateProgressAndEstimates() {
    updateDaySummary();
    updateMapNextChip();
    deps.maybeShowBackupReminder();
}

export function updateLastIdDisplay(deliveryId) {
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

/** Centra o mapa na entrega (JS Maps ou facade nativa Capacitor). */
export function focusMapOnDelivery(delivery, opts = {}) {
    const map = deps.getMap();
    if (!map || !delivery || !hasMapCoords(delivery)) return;
    const lat = Number(delivery.lat);
    const lng = Number(delivery.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    const targetZoom = Number.isFinite(opts.zoom) ? opts.zoom : 16;
    try {
        const nativeGoogleMap = deps.getNativeGoogleMap();
        if (deps.getUseNativeMap() && nativeGoogleMap && typeof nativeGoogleMap.setCamera === 'function') {
            const cur = typeof map.getZoom === 'function' ? map.getZoom() : null;
            const zoom = (cur == null || cur < targetZoom - 0.35 || opts.forceZoom)
                ? targetZoom
                : cur;
            deps.setNativeMapZoom(zoom);
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
