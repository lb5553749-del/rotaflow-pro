'use strict';

/**
 * Pure helpers for delivery/agenda edit modals (phones, photos, field merge).
 * No DOM.
 */

/**
 * Pads photoIds with null so it matches photos length (legacy dataURL migration).
 * @param {unknown[]} photos
 * @param {unknown[]|null|undefined} photoIds
 * @returns {Array<string|null>}
 */
/** @param {any} photos @param {any} photoIds @returns {any[]} */
function alignPhotoIdArray(photos, photoIds) {
  const list = Array.isArray(photos) ? photos : [];
  const ids = Array.isArray(photoIds) ? photoIds.slice() : [];
  while (ids.length < list.length) ids.push(null);
  return ids;
}

/**
 * @param {unknown[]|null|undefined} photoIds
 * @param {number} maxPerItem
 * @returns {number}
 */
function photoSlotsLeft(photoIds, maxPerItem) {
  const used = Array.isArray(photoIds) ? photoIds.filter(Boolean).length : 0;
  const max = Number(maxPerItem) || 0;
  return Math.max(0, max - used);
}

/**
 * Collects phones from parallel label/number value arrays (form fields).
 * @param {Array<string|null|undefined>} labels
 * @param {Array<string|null|undefined>} numbers
 * @param {(raw: string) => string} formatPhoneNumber
 * @returns {Array<{ numero: string, label: string }>}
 */
function collectPhonesFromPairs(labels, numbers, formatPhoneNumber) {
  const out = [];
  const labs = Array.isArray(labels) ? labels : [];
  const nums = Array.isArray(numbers) ? numbers : [];
  labs.forEach((label, i) => {
    const num = String(nums[i] || '').trim();
    if (!num) return;
    const formatted = formatPhoneNumber(num);
    if (!formatted) return;
    out.push({ numero: formatted, label: String(label || '').trim() || '' });
  });
  return out;
}

/**
 * @param {string} nome
 * @param {string} endereco
 * @returns {boolean}
 */
function isValidEditNameAddress(nome, endereco) {
  return !!(String(nome || '').trim() && String(endereco || '').trim());
}

/**
 * Applies edit-modal payload onto a delivery object (mutates). Returns address change info.
 * @param {Delivery} delivery
 * @param {Delivery} updatedData
 * @returns {{ oldAddress: string, addressChanged: boolean }}
 */
function applyDeliveryUpdatedFields(delivery, updatedData) {
  const oldAddress = delivery.endereco;
  const data = updatedData || /** @type {any} */ ({});
  delivery.nome = data.nome;
  delivery.endereco = data.endereco;
  delivery.telefones = data.telefones || [];
  delivery.pacotes = data.pacotes;
  delivery.status = data.status;
  if (data.photos) delivery.photos = data.photos;
  if (data.photoIds) delivery.photoIds = data.photoIds;
  if (data.notes !== undefined) delivery.notes = data.notes;
  if (data.valor !== undefined) {
    const n = Number(data.valor);
    if (Number.isFinite(n) && n >= 0) delivery.valor = n;
    else delete delivery.valor;
  }
  if (data.janelaInicio !== undefined) {
    const v = String(data.janelaInicio || '').trim();
    if (v) delivery.janelaInicio = v;
    else delete delivery.janelaInicio;
  }
  // Patch 22: campos de operação da ficha da parada.
  if (data.tipo !== undefined) {
    delivery.tipo = String(data.tipo) === 'coleta' ? 'coleta' : 'entrega';
  }
  ['complemento', 'referencia'].forEach((campo) => {
    if (data[campo] === undefined) return;
    const v = String(data[campo] || '').trim().slice(0, 120);
    if (v) delivery[campo] = v;
    else delete delivery[campo];
  });
  if (data.pedido !== undefined) {
    const v = String(data.pedido || '').trim().slice(0, 40);
    if (v) delivery.pedido = v;
    else delete delivery.pedido;
  }
  if (data.tempoParadaMin !== undefined) {
    const n = Number(data.tempoParadaMin);
    if (Number.isFinite(n) && n > 0) delivery.tempoParadaMin = Math.min(240, Math.round(n));
    else delete delivery.tempoParadaMin;
  }
  if (data.janelaFim !== undefined) {
    const v = String(data.janelaFim || '').trim();
    if (v) delivery.janelaFim = v;
    else delete delivery.janelaFim;
  }
  return {
    oldAddress,
    addressChanged: data.endereco !== oldAddress
  };
}

/**
 * Merges agenda item fields; optional lat/lng override when geocode succeeds.
 * @param {Delivery} existing
 * @param {Delivery} updatedData
 * @param {{ lat?: number, lng?: number }|null|undefined} coords
 * @returns {Record<string, *>}
 */
function mergeAgendaItemFields(existing, updatedData, coords) {
  const next = { ...(existing || /** @type {any} */ ({})), ...(updatedData || /** @type {any} */ ({})) };
  if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
    next.lat = coords.lat;
    next.lng = coords.lng;
  }
  return next;
}

/**
 * HTML option tags for delivery status select (selected attribute only).
 * @param {string} currentStatus
 * @returns {string}
 */
function deliveryStatusOptionsHtml(currentStatus) {
  const statuses = ['pendente', 'em-rota', 'entregue', 'falhou'];
  return statuses
    .map((s) => `<option ${currentStatus === s ? 'selected' : ''}>${s}</option>`)
    .join('');
}

/**
 * Same as the edit-agenda modal: `parseInt(value) || fallback`.
 * @param {unknown} value
 * @param {number} [fallback=1]
 * @returns {number}
 */
/** @param {any} value @param {number} [fallback] @returns {number} */
function parsePacotesInput(value, fallback = 1) {
  return parseInt(String(value), 10) || fallback;
}

module.exports = {
  alignPhotoIdArray,
  photoSlotsLeft,
  collectPhonesFromPairs,
  isValidEditNameAddress,
  applyDeliveryUpdatedFields,
  mergeAgendaItemFields,
  deliveryStatusOptionsHtml,
  parsePacotesInput
};
