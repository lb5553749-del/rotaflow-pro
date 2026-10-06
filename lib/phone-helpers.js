'use strict';

/**
 * Brazilian phone normalization used by the driver app and WhatsApp links.
 */

const DDD_PADRAO = '69';

function getDigits(phone) {
  return phone ? String(phone).replace(/\D/g, '') : '';
}

function getNationalDigits(phone) {
  let d = getDigits(phone);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

function formatPhoneNumber(raw, defaultDdd = DDD_PADRAO) {
  let d = getNationalDigits(raw);
  if (d.length === 8 || d.length === 9) d = defaultDdd + d;
  if (d.length !== 10 && d.length !== 11) return '';
  const ddd = d.slice(0, 2);
  const num = d.slice(2);
  return num.length === 9
    ? `+55 ${ddd} ${num.slice(0, 1)} ${num.slice(1, 5)}-${num.slice(5)}`
    : `+55 ${ddd} ${num.slice(0, 4)}-${num.slice(4)}`;
}

function formatPhoneShort(phone) {
  if (!phone) return '';
  const d = getNationalDigits(phone);
  if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function normalizeStoredPhone(numero, defaultDdd = DDD_PADRAO) {
  let d = getNationalDigits(numero);
  while (d.length > 11 && d.startsWith(defaultDdd)) d = d.slice(2);
  return formatPhoneNumber(d, defaultDdd) || numero;
}

function getWhatsAppPhoneDigits(phone, defaultDdd = DDD_PADRAO) {
  let d = getNationalDigits(phone);
  if (d.length === 8 || d.length === 9) d = defaultDdd + d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  d = getDigits(phone);
  if (d.length > 11 && d.startsWith('55')) return d;
  return d;
}

function getWhatsAppLink(phone, msg, defaultDdd = DDD_PADRAO) {
  const d = getWhatsAppPhoneDigits(phone, defaultDdd);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(msg)}` : null;
}

function getWhatsAppAppLink(phone, msg, defaultDdd = DDD_PADRAO) {
  const d = getWhatsAppPhoneDigits(phone, defaultDdd);
  return d ? `whatsapp://send?phone=${d}&text=${encodeURIComponent(msg)}` : null;
}

module.exports = {
  DDD_PADRAO,
  getDigits,
  getNationalDigits,
  formatPhoneNumber,
  formatPhoneShort,
  normalizeStoredPhone,
  getWhatsAppPhoneDigits,
  getWhatsAppLink,
  getWhatsAppAppLink
};
