'use strict';

/**
 * Pure helpers for the driver profile / preferences form.
 */

/**
 * Human-readable label for the last backup timestamp.
 * @param {{ lastBackupAt?: number|string|null }|null|undefined} meta
 * @param {(date: Date) => string} [formatDate]
 * @returns {string}
 */
function formatLastBackupLabel(meta, formatDate) {
  if (!meta || !meta.lastBackupAt) return 'Nenhum backup registrado neste aparelho';
  try {
    const fmt = typeof formatDate === 'function'
      ? formatDate
      : (d) => d.toLocaleString('pt-BR');
    return 'Último: ' + fmt(new Date(meta.lastBackupAt));
  } catch (_) {
    return 'Último backup registrado';
  }
}

/**
 * Applies profile form field values onto the in-memory profile object (mutates).
 * @param {object} profile
 * @param {{ motorista?: string, empresa?: string, mensagemPadrao?: string }} values
 * @param {string} empresaPadrao
 * @returns {object}
 */
function applyProfileFormValues(profile, values, empresaPadrao) {
  const p = profile || {};
  const v = values || {};
  p.motorista = String(v.motorista || '').trim() || 'Motorista';
  p.empresa = String(v.empresa || '').trim() || empresaPadrao;
  const msg = String(v.mensagemPadrao || '').trim();
  p.mensagemPadrao = msg || p.mensagemPadrao;
  return p;
}

module.exports = {
  formatLastBackupLabel,
  applyProfileFormValues
};
