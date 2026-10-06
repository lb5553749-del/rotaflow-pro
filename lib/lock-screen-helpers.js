'use strict';

/**
 * Pure payload builder for the native lock-screen / ScreenEvents stop notification.
 */

const { shortStreetAddress } = require('./map-helpers.js');

/**
 * Build title/body for the active-stop lock-screen notification, or null when none.
 * @param {{ status?: string, sequentialId?: number|string, pacotes?: number, endereco?: string, nome?: string }|null|undefined} delivery
 * @returns {{ title: string, body: string }|null}
 */
function lockScreenStopPayload(delivery) {
  if (!delivery || delivery.status === 'entregue' || delivery.status === 'falhou') return null;
  const idLabel = String(delivery.sequentialId || '—');
  const qty = Math.max(1, Number(delivery.pacotes) || 1);
  const qtyLabel = qty === 1 ? '1 pacote' : `${qty} pacotes`;
  const street = shortStreetAddress(delivery.endereco);
  const nome = String(delivery.nome || '').trim();
  const body = nome ? `${nome} · ${street}` : street;
  return {
    title: `Indo para ${idLabel} · ${qtyLabel}`,
    body: body || 'Entrega em andamento'
  };
}

module.exports = {
  lockScreenStopPayload
};
