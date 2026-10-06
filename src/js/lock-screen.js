/**
 * Notificação de parada ativa na tela de bloqueio (plugin ScreenEvents / Capacitor).
 * Payload puro em lib/lock-screen-helpers.js; main injeta via configureLockScreen().
 */
import { lockScreenStopPayload } from '../../lib/lock-screen-helpers.js';

let deps = {
    isNativeApp: () => false,
    getCurrentSelectedDelivery: () => null
};

export function configureLockScreen(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let lockScreenBridgeReady = false;

function getScreenEvents() {
    return window.RotaFlowCap?.ScreenEvents || null;
}

async function ensureLockScreenPermission() {
    if (!deps.isNativeApp()) return false;
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

export async function clearActiveStopNotification() {
    if (!deps.isNativeApp()) return;
    const SE = getScreenEvents();
    if (!SE?.clearActiveStop) return;
    try {
        await SE.clearActiveStop();
    } catch (e) {
        console.warn('clearActiveStop', e);
    }
}

/** Memoriza no nativo; a notificação só aparece em SCREEN_OFF. */
export async function syncActiveStopNotification(delivery) {
    if (!deps.isNativeApp()) return;
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

export async function setupScreenLockNotificationBridge() {
    if (!deps.isNativeApp() || lockScreenBridgeReady) return;
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
    const currentSelectedDelivery = deps.getCurrentSelectedDelivery();
    if (currentSelectedDelivery) {
        syncActiveStopNotification(currentSelectedDelivery);
    }
}
