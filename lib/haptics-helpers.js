'use strict';

/**
 * Pure haptic pattern helpers + TTS stub flag.
 * Actual vibration / Capacitor Haptics run in src/js/haptics.js.
 */

/** @typedef {'delivery'|'near'|'warn'|'selection'} HapticKind */

const HAPTIC_PATTERNS = Object.freeze({
  delivery: [35, 25, 45],
  near: [80, 40, 80],
  warn: [120, 60, 120, 60, 180],
  selection: [12]
});

/**
 * @param {HapticKind|string} kind
 * @returns {number[]}
 */
function hapticPatternFor(kind) {
  return HAPTIC_PATTERNS[kind] || HAPTIC_PATTERNS.selection;
}

/**
 * Capacitor Haptics ImpactStyle mapping (string names for bridge).
 * @param {HapticKind|string} kind
 * @returns {'HEAVY'|'MEDIUM'|'LIGHT'}
 */
function hapticImpactStyleFor(kind) {
  if (kind === 'near' || kind === 'warn') return 'HEAVY';
  if (kind === 'delivery') return 'MEDIUM';
  return 'LIGHT';
}

/**
 * TTS for proximity / delivery is deferred (native speech + battery cost).
 * @returns {{ enabled: false, reason: string }}
 */
function ttsFeedbackStub() {
  return {
    enabled: false,
    reason: 'TTS de proximidade/entrega fica para a próxima onda (custo de bateria + permissões nativas).'
  };
}

module.exports = {
  HAPTIC_PATTERNS,
  hapticPatternFor,
  hapticImpactStyleFor,
  ttsFeedbackStub
};
