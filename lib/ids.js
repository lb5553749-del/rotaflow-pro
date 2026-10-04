'use strict';

/**
 * Sequential stop IDs (A1..Z10, then AA1) and monotonic numeric ids.
 */

function getSequentialId(seq) {
  const number = ((seq - 1) % 10) + 1;
  let block = Math.floor((seq - 1) / 10);
  let letter = '';
  do {
    letter = String.fromCharCode(65 + (block % 26)) + letter;
    block = Math.floor(block / 26) - 1;
  } while (block >= 0);
  return `${letter}${number}`;
}

/**
 * @param {{ lastGeneratedId: number }} state
 * @param {() => number} [nowFn]
 */
function nextGeneratedId(state, nowFn) {
  const now = typeof nowFn === 'function' ? nowFn() : Date.now();
  state.lastGeneratedId = now > state.lastGeneratedId ? now : state.lastGeneratedId + 1;
  return state.lastGeneratedId;
}

/**
 * @param {{ lastGeneratedId: number }} state
 * @param {Array<Array<{ id?: number }>>} lists
 */
function seedIdCounterFromLists(state, lists) {
  for (const list of lists || []) {
    (list || []).forEach((d) => {
      if (typeof d.id === 'number' && d.id > state.lastGeneratedId) {
        state.lastGeneratedId = d.id;
      }
    });
  }
  return state.lastGeneratedId;
}

module.exports = {
  getSequentialId,
  nextGeneratedId,
  seedIdCounterFromLists
};
