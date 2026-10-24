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
 * Ensures the tracking URL appears in the WhatsApp body (append if missing).
 * @param {string} message
 * @param {string} trackUrl
 * @returns {string}
 */
function ensureTrackingLinkInMessage(message, trackUrl) {
  let msg = String(message || '').trim();
  const url = String(trackUrl || '').trim();
  if (!url) return msg;
  if (!msg.includes(url)) {
    msg = msg ? `${msg}\n${url}` : url;
  }
  return msg.trim();
}

/**
 * @param {string} [status]
 * @returns {string}
 */
function formatDeliveryStatusPt(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'entregue') return 'Entregue com sucesso';
  if (s === 'nao_entregue' || s === 'falhou' || s === 'falha') return 'Tentativa de entrega sem sucesso';
  if (s === 'em_rota' || s === 'ativa') return 'A caminho / Em rota';
  return 'Pendente / Na fila de entregas';
}

/**
 * Builds the WhatsApp body from the driver's template and delivery fields.
 * @param {Delivery} delivery
 * @param {{ trackUrl?: string, nome?: string, empresa?: string, eta?: string }} [opts]
 * @param {{ profile?: { mensagemPadrao?: string, empresa?: string }|null, empresaPadrao?: string, mensagemPadrao?: string }} [context]
 * @returns {string}
 */
function buildDeliveryWhatsAppMessage(delivery, opts, context) {
  const options = opts || /** @type {any} */ ({});
  const ctx = context || /** @type {any} */ ({});
  const trackUrl = options.trackUrl || '';
  const nome = options.nome != null ? options.nome : ((delivery && delivery.nome) || 'cliente');
  const empresa = options.empresa != null
    ? options.empresa
    : companyDisplayName(ctx.profile, ctx.empresaPadrao);
  const statusStr = formatDeliveryStatusPt(delivery && delivery.status);
  const etaStr = (options && options.eta) ||
    (delivery && (delivery.etaHorario || (delivery.janelaInicio ? `${delivery.janelaInicio} - ${delivery.janelaFim}` : ''))) ||
    'em breve';
  const template = (ctx.profile && ctx.profile.mensagemPadrao) || ctx.mensagemPadrao || '';
  let msg = String(template)
    .replace(/{nome}/g, nome)
    .replace(/{id}/g, String(delivery && delivery.sequentialId))
    .replace(/{pacotes}/g, String((delivery && delivery.pacotes) || 1))
    .replace(/{endereco}/g, (delivery && delivery.endereco) || '')
    .replace(/{empresa}/g, empresa)
    .replace(/{obs}/g, delivery && delivery.notes ? `📝 Obs: ${delivery.notes}\n` : '')
    .replace(/{status}/g, statusStr)
    .replace(/{horario}/g, etaStr)
    .replace(/{eta}/g, etaStr)
    .replace(/{km}/g, '')
    .replace(/{min}/g, '')
    .replace(/{link}/g, trackUrl || '');
  // Sem km antigo na mensagem ao cliente.
  msg = msg
    .replace(/\n?⏱\s*Faltam cerca de[^\n]*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return ensureTrackingLinkInMessage(msg, trackUrl);
}

/**
 * Compact one-tap tracking notice (uses template when available, else short default).
 * Always includes /r/{token} URL when trackUrl is set, plus ETA and current status.
 * @param {Delivery} delivery
 * @param {{ trackUrl?: string, nome?: string, eta?: string }} [opts]
 * @param {{ profile?: object|null, empresaPadrao?: string, mensagemPadrao?: string }} [context]
 * @returns {string}
 */
function buildTrackingQuickWhatsAppMessage(delivery, opts, context) {
  const options = opts || /** @type {any} */ ({});
  const ctx = context || /** @type {any} */ ({});
  const trackUrl = options.trackUrl || '';
  const hasCustomTemplate = !!(String((ctx.profile && ctx.profile.mensagemPadrao) || ctx.mensagemPadrao || '').trim());
  if (hasCustomTemplate) {
    const fromTemplate = buildDeliveryWhatsAppMessage(delivery, options, context);
    if (fromTemplate && trackUrl && fromTemplate.includes(trackUrl) && fromTemplate.trim() !== trackUrl.trim()) {
      return fromTemplate;
    }
  }
  const nome = options.nome != null ? options.nome : ((delivery && delivery.nome) || 'cliente');
  const id = (delivery && delivery.sequentialId) || '';
  const statusStr = formatDeliveryStatusPt(delivery && delivery.status);
  const etaStr = (options && options.eta) ||
    (delivery && (delivery.etaHorario || (delivery.janelaInicio ? `${delivery.janelaInicio} - ${delivery.janelaFim}` : ''))) ||
    '';
  const fallback =
    `Olá ${nome}! Sua encomenda${id ? ` (${id})` : ''} está com status: ${statusStr}.\n` +
    (etaStr ? `Previsão de chegada (ETA): ${etaStr}\n` : '') +
    `Acompanhe no mapa: ${trackUrl || ''}`.trim();
  return ensureTrackingLinkInMessage(fallback, trackUrl);
}

module.exports = {
  companyDisplayName,
  formatDeliveryStatusPt,
  ensureTrackingLinkInMessage,
  buildDeliveryWhatsAppMessage,
  buildTrackingQuickWhatsAppMessage
};
