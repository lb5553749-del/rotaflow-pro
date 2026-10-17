'use strict';

/**
 * Pure helpers for "não entregue" / "voltar depois" stop counting and notify gate.
 */

/**
 * @param {Array<{ status?: string, voltarDepois?: boolean }>} deliveries
 * @param {(d: object) => boolean} isActiveStop
 * @returns {number}
 */
function countNormalActiveStops(deliveries, isActiveStop) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  const active = typeof isActiveStop === 'function' ? isActiveStop : () => false;
  return list.filter((d) => active(d) && !d.voltarDepois).length;
}

/**
 * @template {{ voltarDepois?: boolean }} T
 * @param {T[]} deliveries
 * @param {(d: object) => boolean} isActiveStop
 * @returns {T[]}
 */
function getVoltarDepoisStops(deliveries, isActiveStop) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  const active = typeof isActiveStop === 'function' ? isActiveStop : () => false;
  return list.filter((d) => active(d) && d.voltarDepois);
}

/**
 * Gate for the penultimate-normal-stop reminder.
 * @param {{ normalsBefore: number, normalsAfter: number, alreadyShown: boolean, postponedCount: number }} opts
 * @returns {boolean}
 */
function shouldNotifyVoltarDepois(opts) {
  const o = opts || {};
  if (!(Number(o.postponedCount) > 0)) return false;
  if (!(Number(o.normalsBefore) > 1 && Number(o.normalsAfter) <= 1)) return false;
  if (o.alreadyShown) return false;
  return true;
}

module.exports = {
  countNormalActiveStops,
  getVoltarDepoisStops,
  shouldNotifyVoltarDepois
};
