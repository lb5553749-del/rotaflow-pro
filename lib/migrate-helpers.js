'use strict';

/**
 * Legacy field migrations for deliveries/agenda items loaded from storage.
 */

const { normalizeStoredPhone } = require('./phone-helpers.js');

/**
 * @param {Delivery|null|undefined} obj
 * @returns {object|undefined}
 */
function migrateTelefones(obj) {
  if (!obj) return;
  if (obj.telefones && Array.isArray(obj.telefones) && obj.telefones.length > 0 && typeof obj.telefones[0] === 'string') {
    obj.telefones = obj.telefones.map((num) => ({ numero: String(num), label: '' }));
  }
  if (!obj.telefones) obj.telefones = [];
  if (obj.telefone && typeof obj.telefone === 'string') {
    obj.telefones.push({ numero: obj.telefone, label: '' });
    delete obj.telefone;
  }
  obj.telefones.forEach((p) => { p.numero = normalizeStoredPhone(p.numero); });
  return obj;
}

/**
 * @param {Delivery} obj
 * @returns {Delivery}
 */
function migrateFavorito(obj) {
  if (obj.favorito === undefined) obj.favorito = false;
  return obj;
}

module.exports = {
  migrateTelefones,
  migrateFavorito
};
