'use strict';

/**
 * Canonical delivery status transitions.
 *
 * Moving a delivery between statuses invalidates derived fields (voltarDepois,
 * failReason and the push-notification flags deliveredNotified / absentNotified).
 * This used to be inlined in three places (status select, markDelivered, undo,
 * not-delivered) with subtle differences between them — a wrong clean-up here
 * silently corrupts the "already notified the customer" flags and leaks stale
 * push state. No DOM.
 */

const { iniciarCronometro, pararCronometro, reabrirCronometro } = require('./tempo-helpers.js');

const TERMINAL_STATUS = ['entregue', 'falhou'];

function isValidStatus(value) {
  return value === 'pendente' || value === 'em-rota' || value === 'entregue' || value === 'falhou';
}

/**
 * Applies the new status and clears the fields that no longer make sense.
 *
 * Notification-flag rules:
 *  - deliveredNotified only survives while the delivery stays 'entregue';
 *  - absentNotified only survives while it stays 'falhou' por 'ausente'.
 *
 * @param {Delivery} delivery delivery to mutate
 * @param {string} newStatus alvo ('pendente'|'em-rota'|'entregue'|'falhou');
 *   qualquer outro valor é ignorado (no-op)
 * @param {{ failReason?: string|null, agora?: number }} [opts] failReason to set together with the
 *   transition (used by the "não entregue" flow); when omitted and the new
 *   status is 'entregue', any stale failReason is dropped.
 * @returns {Delivery} the same delivery, for chaining
 */
function applyDeliveryStatusTransition(delivery, newStatus, opts = {}) {
  if (!delivery) return delivery;
  if (!isValidStatus(newStatus)) return delivery;
  delivery.status = newStatus;
  if (TERMINAL_STATUS.includes(newStatus)) {
    delivery.voltarDepois = false;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'failReason')) {
    delivery.failReason = opts.failReason;
  } else if (newStatus === 'entregue') {
    delete delivery.failReason;
  }
  // Cronômetro de entrega: o relógio segue o status, o motorista não aperta nada.
  // em-rota abre, terminal fecha, voltar para pendente reabre (mantendo o início).
  if (newStatus === 'em-rota') {
    iniciarCronometro(delivery, opts.agora);
  } else if (TERMINAL_STATUS.includes(newStatus)) {
    pararCronometro(delivery, opts.agora);
  } else if (newStatus === 'pendente') {
    reabrirCronometro(delivery);
  }
  if (newStatus !== 'entregue') delete delivery.deliveredNotified;
  if (newStatus !== 'falhou' || delivery.failReason !== 'ausente') delete delivery.absentNotified;
  return delivery;
}

module.exports = { applyDeliveryStatusTransition };
