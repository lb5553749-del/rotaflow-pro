'use strict';

/**
 * Ranking puro das sugestões de endereço do formulário "Nova entrega".
 *
 * O autocomplete antigo do Google (`google.maps.places.Autocomplete`) saiu do ar
 * para contas novas em março/2025 — o campo de endereço ficou sem sugestão
 * nenhuma. Aqui a lista é montada em duas camadas:
 *   1. endereços que o motorista já usou (rota + agenda + histórico) — instantâneo
 *      e funciona sem internet;
 *   2. resultados do Google (Places novo ou Geocoder) — chegam depois.
 *
 * Este arquivo é só a parte determinística (sem DOM, sem rede) para poder testar.
 */

/** Normaliza para comparação: minúsculas, sem acento, espaços simples. */
function normalizeAddressText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave de deduplicação: rua + número, sem bairro/cidade.
 * "Rua Getúlio Vargas, 1120 - Centro" e "Rua Getulio Vargas 1120" caem na mesma chave.
 */
function addressKey(text) {
  const n = normalizeAddressText(text).replace(/[.,]/g, ' ');
  const m = n.match(/^(.+?)\s+(\d+[a-z]?)\b/);
  if (m) return `${m[1].replace(/\s+/g, ' ').trim()}|${m[2]}`;
  return n.replace(/\s+/g, ' ').trim();
}

/**
 * Pontua a qualidade do casamento (menor = melhor).
 * @param {string} address
 * @param {string} query
 * @returns {number}
 */
function addressMatchRank(address, query) {
  const a = normalizeAddressText(address);
  const q = normalizeAddressText(query);
  if (!q) return 10000;
  const idx = a.indexOf(q);
  if (idx === -1) return 10000;
  if (a === q) return 0;
  if (idx === 0) return 10 + (a.length - q.length) / 100; // começa com o que foi digitado
  // casamento por número da casa, ex.: "1120" em "Rua Getúlio Vargas, 1120 - Centro"
  if (/^\d+$/.test(q) && new RegExp(`\\b${q}\\b`).test(a)) return 20;
  return 100 + idx + (a.length - q.length) / 100;
}

/**
 * Sugestões a partir do que o motorista já tem: rota, agenda e histórico.
 * @param {Array<{endereco?: string, nome?: string, bairro?: string, origem?: string}>} items
 * @param {string} query
 * @param {{ limit?: number, minChars?: number }} [opts]
 * @returns {Array<{endereco: string, nome?: string, origem: 'rota'|'agenda'|'historico'}>}
 */
function rankLocalAddresses(items, query, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : 4;
  const minChars = Number.isFinite(opts.minChars) ? opts.minChars : 2;
  const q = normalizeAddressText(query);
  if (q.length < minChars) return [];

  const vistos = new Set();
  const pontos = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.endereco !== 'string' || !item.endereco.trim()) continue;
    const rank = addressMatchRank(item.endereco, q);
    if (rank >= 10000) continue;
    const chave = addressKey(item.endereco);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pontos.push({
      endereco: item.endereco.trim(),
      nome: item.nome || '',
      origem: item.origem || 'rota',
      rank
    });
  }
  // Empate (mesma qualidade de casamento) mantém a ordem de chegada: rota antes
  // de agenda, agenda antes de histórico — sort do V8 é estável.
  pontos.sort((a, b) => Math.round(a.rank) - Math.round(b.rank));
  return pontos.slice(0, limit).map(({ endereco, nome, origem }) => ({ endereco, nome, origem }));
}

/**
 * Junta sugestões locais com as do Google, sem repetir endereço.
 * As locais vêm primeiro (são as que o motorista reconhece).
 * @param {Array<{endereco: string, nome?: string, origem?: string}>} locais
 * @param {Array<{endereco: string}>} remotas
 * @param {number} [limit]
 */
function mergeAddressSuggestions(locais, remotas, limit = 5) {
  const out = [];
  const vistos = new Set();
  const push = (s, origem) => {
    if (!s || typeof s.endereco !== 'string' || !s.endereco.trim()) return;
    const chave = addressKey(s.endereco);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    out.push({ endereco: s.endereco.trim(), nome: s.nome || '', origem: s.origem || origem });
  };
  (Array.isArray(locais) ? locais : []).forEach((s) => push(s, 'rota'));
  (Array.isArray(remotas) ? remotas : []).forEach((s) => push(s, 'google'));
  return out.slice(0, limit);
}

module.exports = {
  normalizeAddressText,
  addressKey,
  addressMatchRank,
  rankLocalAddresses,
  mergeAddressSuggestions
};
