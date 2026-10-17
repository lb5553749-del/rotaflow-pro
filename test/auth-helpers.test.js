'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTH_SESSION_KEY,
  LOCAL_UID_KEY,
  currentUidFromUser,
  storageKeyFor,
  saveAuthSession,
  clearAuthSession,
  loadAuthSession,
  isValidLocalSession,
  localUserFromSession,
  createLocalUser,
  generateLocalUid,
  ensureLocalUid,
  defaultUserProfile,
  accountLabelForUser
} = require('../lib/auth-helpers.js');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
    key(i) { return [...map.keys()][i] ?? null; }
  };
}

describe('currentUidFromUser / storageKeyFor', () => {
  it('returns guest without user', () => {
    assert.equal(currentUidFromUser(null), 'guest');
    assert.equal(currentUidFromUser({}), 'guest');
  });

  it('returns uid when present', () => {
    assert.equal(currentUidFromUser({ uid: 'local_abc' }), 'local_abc');
  });

  it('builds scoped storage keys', () => {
    assert.equal(storageKeyFor('data', 'u1'), 'rotaflow_data_u1');
    assert.equal(storageKeyFor('profile'), 'rotaflow_profile_guest');
  });
});

describe('auth session storage', () => {
  it('saves, loads and clears session', () => {
    const storage = memoryStorage();
    const user = createLocalUser('local_x');
    saveAuthSession(storage, user);
    assert.equal(storage.getItem(AUTH_SESSION_KEY), JSON.stringify(user));
    assert.deepEqual(loadAuthSession(storage), user);
    clearAuthSession(storage);
    assert.equal(loadAuthSession(storage), null);
  });

  it('tolerates broken JSON / missing storage', () => {
    assert.equal(loadAuthSession(null), null);
    assert.equal(loadAuthSession(memoryStorage({ [AUTH_SESSION_KEY]: '{bad' })), null);
  });
});

describe('local session helpers', () => {
  it('accepts local provider and legacy without provider', () => {
    assert.equal(isValidLocalSession({ uid: 'a', provider: 'local' }), true);
    assert.equal(isValidLocalSession({ uid: 'a' }), true);
    assert.equal(isValidLocalSession({ uid: 'a', provider: 'google' }), false);
    assert.equal(isValidLocalSession(null), false);
  });

  it('builds local user from session', () => {
    assert.deepEqual(localUserFromSession({ uid: 'u1', displayName: 'Ana' }), {
      uid: 'u1',
      displayName: 'Ana',
      email: '',
      photoURL: '',
      provider: 'local'
    });
    assert.equal(localUserFromSession({ uid: 'u1', provider: 'google' }), null);
  });

  it('createLocalUser shape', () => {
    assert.deepEqual(createLocalUser('local_1'), {
      uid: 'local_1',
      displayName: 'Neste aparelho',
      email: '',
      photoURL: '',
      provider: 'local'
    });
  });
});

describe('ensureLocalUid', () => {
  it('reuses existing uid', () => {
    const storage = memoryStorage({ [LOCAL_UID_KEY]: 'local_existing' });
    assert.equal(ensureLocalUid(storage), 'local_existing');
  });

  it('creates deterministic uid with injected clock/random', () => {
    const storage = memoryStorage();
    const uid = ensureLocalUid(storage, { now: () => 1000, random: () => 0.123456 });
    assert.equal(uid, generateLocalUid({ now: () => 1000, random: () => 0.123456 }));
    assert.equal(storage.getItem(LOCAL_UID_KEY), uid);
  });
});

describe('profile / account label', () => {
  it('defaultUserProfile', () => {
    assert.deepEqual(defaultUserProfile({ empresaPadrao: 'Acme', mensagemPadrao: 'Oi' }), {
      motorista: 'Motorista',
      empresa: 'Acme',
      mensagemPadrao: 'Oi'
    });
  });

  it('accountLabelForUser', () => {
    assert.equal(accountLabelForUser(null), 'Conta');
    assert.equal(accountLabelForUser({ provider: 'local' }), 'Conta neste aparelho');
    assert.equal(accountLabelForUser({ email: 'a@b.c', displayName: 'X' }), 'a@b.c');
    assert.equal(accountLabelForUser({ displayName: 'X' }), 'X');
  });
});
