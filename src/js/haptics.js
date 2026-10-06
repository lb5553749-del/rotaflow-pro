/**
 * Haptics: Capacitor Haptics quando disponível, senão navigator.vibrate.
 * TTS de proximidade fica stubado (lib/haptics-helpers.ttsFeedbackStub).
 */
import {
    hapticPatternFor,
    hapticImpactStyleFor,
    ttsFeedbackStub
} from '../../lib/haptics-helpers.js';

let deps = {
    getFeedbackVibrateEnabled: () => true,
    isNativeApp: () => false
};

export function configureHaptics(opts) {
    deps = { ...deps, ...(opts || {}) };
}

/**
 * @param {'delivery'|'near'|'warn'|'selection'} kind
 * @returns {Promise<boolean>} true if a haptic was attempted
 */
export async function triggerHaptic(kind) {
    if (!deps.getFeedbackVibrateEnabled()) return false;
    const style = hapticImpactStyleFor(kind);
    const pattern = hapticPatternFor(kind);
    try {
        const H = window.RotaFlowCap && window.RotaFlowCap.Haptics;
        if (H && typeof H.impact === 'function') {
            const ImpactStyle = (window.RotaFlowCap && window.RotaFlowCap.ImpactStyle) || {};
            const mapped = ImpactStyle[style] || ImpactStyle.Medium || style;
            await H.impact({ style: mapped });
            return true;
        }
    } catch (_) {}
    try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(pattern);
            return true;
        }
    } catch (_) {}
    return false;
}

export function playDeliveryHaptic() {
    return triggerHaptic('delivery');
}

export function playNearHaptic() {
    return triggerHaptic('near');
}

/** Stub — próxima onda. */
export function speakProximityStub() {
    return ttsFeedbackStub();
}

export { ttsFeedbackStub, hapticPatternFor };
