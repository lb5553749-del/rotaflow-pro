'use strict';

/**
 * Pure WhatsApp message template helpers for delivery notifications.
 */

/**
 * @param {{ empresa?: string }|null|undefined} profile
 * @param {string} empresaPadrao
 * @returns {string}
 */
function companyDisplayName(profile, empresaPadrao) {
  const name = profile && String(profile.empresa || '').trim();
  return name || empresaPadrao;
}

/**
 * Builds the WhatsApp body from the driver's template and delivery fields.
 * @param {object} delivery
 * @param {{ trackUrl?: string, nome?: string, empresa?: string }} [opts]
 * @param {{ profile?: { mensagemPadrao?: string, empresa?: string }|null, empresaPadrao?: string, mensagemPadrao?: string }} [context]
 * @returns {string}
 */
function buildDeliveryWhatsAppMessage(delivery, opts, context) {
  const options = opts || {};
  const ctx = context || {};
  const trackUrl = options.trackUrl || '';
  const nome = options.nome != null ? options.nome : ((delivery && delivery.nome) || 'cliente');
  const empresa = options.empresa != null
    ? options.empresa
    : companyDisplayName(ctx.profile, ctx.empresaPadrao);
  const template = (ctx.profile && ctx.profile.mensagemPadrao) || ctx.mensagemPadrao || '';
  let msg = String(template)
    .replace(/{nome}/g, nome)
    .replace(/{id}/g, delivery && delivery.sequentialId)
    .replace(/{pacotes}/g, (delivery && delivery.pacotes) || 1)
    .replace(/{endereco}/g, (delivery && delivery.endereco) || '')
    .replace(/{empresa}/g, empresa)
    .replace(/{obs}/g, delivery && delivery.notes ? `📝 Obs: ${delivery.notes}\n` : '')
    .replace(/{km}/g, '')
    .replace(/{min}/g, '')
    .replace(/{link}/g, trackUrl || '');
  // Sem km/ETA na mensagem ao cliente.
  msg = msg
    .replace(/\n?⏱\s*Faltam cerca de[^\n]*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (trackUrl && !msg.includes(trackUrl)) {
    msg += `\n${trackUrl}`;
  }
  return msg;
}

module.exports = {
  companyDisplayName,
  buildDeliveryWhatsAppMessage
};
