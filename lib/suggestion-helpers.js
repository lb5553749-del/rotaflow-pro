'use strict';

/**
 * Ranking helpers for name/address autocomplete suggestions in the driver form.
 */

/**
 * Rank match quality of text vs query (lower = better).
 * @param {string} text
 * @param {string} query
 * @returns {number}
 */
function suggestionFieldRank(text, query) {
  const t = String(text || '').toLowerCase().trim();
  const q = String(query || '').toLowerCase().trim();
  if (!q || !t.includes(q)) return 10000;

  if (t === q) return 0;

  const isNumericQ = /^\d+$/.test(q);
  const lengthDelta = Math.abs(t.length - q.length);

  if (isNumericQ) {
    // Scan all occurrences; prefer exact number tokens over substrings of longer numbers (80 vs 8050).
    let best = 9000;
    for (let idx = t.indexOf(q); idx !== -1; idx = t.indexOf(q, idx + 1)) {
      const before = idx > 0 ? t[idx - 1] : '';
      const after = idx + q.length < t.length ? t[idx + q.length] : '';
      const beforeDigit = /\d/.test(before);
      const afterDigit = /\d/.test(after);
      let score;
      if (!beforeDigit && !afterDigit) {
        // Number-boundary: "80", "casa 80", "A80", "80-B"
        score = idx === 0 ? 10 : 20;
      } else if (!beforeDigit && afterDigit) {
        // Prefix of a longer number: "8050" when typing "80"
        score = 200 + Math.min(40, lengthDelta);
      } else if (beforeDigit && !afterDigit) {
        // Suffix of a longer number: "180"
        score = 220 + Math.min(40, lengthDelta);
      } else {
        score = 250 + Math.min(40, lengthDelta);
      }
      if (score < best) best = score;
    }
    return best + Math.min(15, lengthDelta);
  }

  if (t.startsWith(q)) return 10 + Math.min(20, lengthDelta);

  // Word-boundary / token start (space, punctuation, hyphen)
  const boundaryRe = new RegExp('(?:^|[\\s\\-_/.,;:#()\\[\\]])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (boundaryRe.test(t)) return 30 + Math.min(20, lengthDelta);

  const pos = t.indexOf(q);
  return 100 + Math.min(50, pos) + Math.min(30, lengthDelta);
}

/**
 * @param {{ nome?: string, endereco?: string }} item
 * @param {string} query
 * @returns {number}
 */
function suggestionItemRank(item, query) {
  const nome = String(item.nome || '').toLowerCase();
  const end = String(item.endereco || '').toLowerCase();
  const q = String(query || '').toLowerCase();
  const nomeRank = nome.includes(q) ? suggestionFieldRank(nome, q) : 10000;
  const endRank = end.includes(q) ? suggestionFieldRank(end, q) + 8 : 10000; // slight preference for nome
  return Math.min(nomeRank, endRank);
}

module.exports = {
  suggestionFieldRank,
  suggestionItemRank
};
