'use strict';

/**
 * Helpers puros da busca por texto das entregas.
 *
 * O numero da casa fica embutido na string de endereco ("Rua, 123, Centro"),
 * entao a busca normaliza o texto (sem acentos, minusculas) e casa todos os
 * tokens da query, em qualquer ordem. Assim "flores 123" encontra
 * "Rua das Flores, 123, Centro".
 */

/**
 * Normaliza um texto para busca: sem acentos, minusculas, pontuacao de
 * separador vira espaco e espacos colapsados.
 * @param {*} value
 * @returns {string}
 */
function normalizeSearchText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[,;|./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Monta a string de busca de uma entrega com todos os campos pesquisaveis.
 * @param {object|null|undefined} delivery
 * @returns {string}
 */
function buildDeliverySearchText(delivery) {
  if (!delivery) return '';
  const telefones = Array.isArray(delivery.telefones)
    ? delivery.telefones.map((p) => (p && p.numero) || '')
    : [];
  const parts = [
    delivery.nome,
    delivery.endereco,
    delivery.notes,
    delivery.sequentialId == null ? '' : String(delivery.sequentialId),
    delivery.id == null ? '' : String(delivery.id),
    ...telefones
  ];
  return parts.map(normalizeSearchText).join(' ');
}

/**
 * Casa uma entrega contra a query: todos os tokens precisam aparecer.
 * @param {object|null|undefined} delivery
 * @param {string} query
 * @returns {boolean}
 */
function matchDeliveryQuery(delivery, query) {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = buildDeliverySearchText(delivery);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Filtra uma lista de entregas pela query de texto.
 * @param {object[]} deliveries
 * @param {string} query
 * @returns {object[]}
 */
function filterDeliveriesByText(deliveries, query) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!tokens.length) return list.slice();
  return list.filter((d) => {
    const haystack = buildDeliverySearchText(d);
    return tokens.every((token) => haystack.includes(token));
  });
}

module.exports = {
  normalizeSearchText,
  buildDeliverySearchText,
  matchDeliveryQuery,
  filterDeliveriesByText
};
