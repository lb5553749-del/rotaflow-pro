/**
 * Fluxo "não entregue" / "voltar depois": feedback, notificação e markNotDelivered.
 * Contagem pura em lib/not-delivered-helpers.js; deps via configureNotDelivered().
 */
import {
    FAIL_REASON_LABELS,
    FAIL_REASON_OPTIONS
} from '../../lib/list-helpers.js';
import {
    countNormalActiveStops as countNormalActiveStopsPure,
    getVoltarDepoisStops as getVoltarDepoisStopsPure,
    shouldNotifyVoltarDepois
} from '../../lib/not-delivered-helpers.js';

let deps = {
    getDeliveries: () => [],
    isActiveStop: () => false,
    getFeedbackVibrateEnabled: () => true,
    getFeedbackSoundEnabled: () => true,
    getAppIcon: () => '',
    showToast: () => {},
    showChoiceModal: async () => null,
    saveStorage: () => {},
    getMarker: () => null,
    updateMarkerIcon: () => {},
    rebuildMarkers: () => {},
    updateDeliveryStats: () => {},
    renderDeliveriesList: () => {},
    releaseInMemoryPhotosExcept: () => {},
    syncTrackingStatus: () => {},
    sendAbsentPush: () => {},
    notifyRouteCompositionChanged: () => {},
    noteDeliveryCompletedForBackup: () => {},
    showUndoSnackbar: () => {},
    minimizeDeliveryPanel: () => {},
    goToAdjacentDelivery: () => {}
};

export function configureNotDelivered(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let voltarDepoisAlertShown = false;

export function resetVoltarDepoisAlert() {
    voltarDepoisAlertShown = false;
}

export function playDeliveryFeedback() {
    try {
        if (deps.getFeedbackVibrateEnabled() && navigator.vibrate) navigator.vibrate([35, 25, 45]);
    } catch (e) {}
    if (!deps.getFeedbackSoundEnabled()) return;
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

export function countNormalActiveStops() {
    return countNormalActiveStopsPure(deps.getDeliveries(), deps.isActiveStop);
}

export function getVoltarDepoisStops() {
    return getVoltarDepoisStopsPure(deps.getDeliveries(), deps.isActiveStop);
}

// Avisa ao terminar a penúltima (ou a última) entrega "normal",
// para o motorista lembrar de voltar às paradas adiadas.
export function maybeNotifyVoltarDepois(normalsBefore) {
    const postponed = getVoltarDepoisStops();
    if (!postponed.length) {
        voltarDepoisAlertShown = false;
        return;
    }
    const normalsAfter = countNormalActiveStops();
    if (!shouldNotifyVoltarDepois({
        normalsBefore,
        normalsAfter,
        alreadyShown: voltarDepoisAlertShown,
        postponedCount: postponed.length
    })) return;
    voltarDepoisAlertShown = true;
    notifyVoltarDepoisStops(postponed);
}

export function notifyVoltarDepoisStops(list) {
    const items = list || getVoltarDepoisStops();
    if (!items.length) return;

    const names = items.map(d => `${d.sequentialId} · ${d.nome}`).join(', ');
    const msg = items.length === 1
        ? `Lembrete: retornar à entrega ${names}`
        : `Lembrete: retornar a ${items.length} entregas adiadas — ${names}`;
    deps.showToast(msg, true);

    try {
        if (deps.getFeedbackVibrateEnabled() && navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 180]);
    } catch (e) {}

    if (deps.getFeedbackSoundEnabled()) {
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
                icon: deps.getAppIcon()
            });
        } catch (e) {}
    }
}

export async function markNotDelivered(id) {
    try {
        const deliveries = deps.getDeliveries();
        const d = deliveries.find(x => x.id === id);
        if (!d || d.status === 'entregue') return;

        const choice = await deps.showChoiceModal({
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
            try { deps.saveStorage(); } catch (_) {}
            try {
                const marker = deps.getMarker(d.sequentialId);
                if (marker) deps.updateMarkerIcon(marker, d);
            } catch (_) {}
            try { deps.updateDeliveryStats(); } catch (_) {}
            try { deps.renderDeliveriesList(); } catch (_) {}
            voltarDepoisAlertShown = false;
            deps.showToast(`Entrega ${d.sequentialId} adiada. Aviso na penúltima parada`);
            try { deps.minimizeDeliveryPanel(); } catch (_) {}
            try { deps.goToAdjacentDelivery(1, { preferPending: true, keepMinimized: true }); } catch (_) {}
            return;
        }

        d.status = 'falhou';
        d.voltarDepois = false;
        d.failReason = choice;
        try { deps.releaseInMemoryPhotosExcept(d.id); } catch (_) {}
        try { deps.saveStorage(); } catch (_) {}
        try { deps.syncTrackingStatus(d); } catch (_) {}
        if (choice === 'ausente') {
            try { deps.sendAbsentPush(d); } catch (_) {}
        }
        try {
            const marker = deps.getMarker(d.sequentialId);
            if (marker) deps.updateMarkerIcon(marker, d);
            else deps.rebuildMarkers(false);
        } catch (_) {}
        try { deps.updateDeliveryStats(); } catch (_) {}
        try { deps.renderDeliveriesList(); } catch (_) {}
        try { deps.notifyRouteCompositionChanged({ keepRoute: true }); } catch (_) {}
        try { deps.noteDeliveryCompletedForBackup(); } catch (_) {}
        deps.showUndoSnackbar(d.id, `Entrega ${d.sequentialId}: ${FAIL_REASON_LABELS[choice] || 'não entregue'}`);
        try { maybeNotifyVoltarDepois(normalsBefore); } catch (_) {}
        try { deps.minimizeDeliveryPanel(); } catch (_) {}
        try { deps.goToAdjacentDelivery(1, { preferPending: true, keepMinimized: true }); } catch (_) {}
    } catch (e) {
        console.error('markNotDelivered', e);
        try { deps.showToast('Não foi possível atualizar a entrega', true); } catch (_) {}
    }
}
