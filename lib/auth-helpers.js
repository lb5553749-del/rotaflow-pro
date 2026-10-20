'use strict';

/**
 * Helpers puros de autenticação local / sessão.
 * Sem DOM, sem Capacitor — só storage injetável e objetos de usuário.
 */

const AUTH_SESSION_KEY = 'rotaflow_auth_session';
const LOCAL_UID_KEY = 'rotaflow_local_uid';

/**
 * @param {{ uid?: string }|null|undefined} user
 * @returns {string}
 */
function currentUidFromUser(user) {
  return (user && user.uid) ? String(user.uid) : 'guest';
}

/**
 * @param {string} base
 * @param {string} [uid]
 * @returns {string}
 */
function storageKeyFor(base, uid) {
  return `rotaflow_${base}_${uid || 'guest'}`;
}

/**
 * @param {Storage|null|undefined} storage
 * @param {Delivery|null|undefined} user
 */
function saveAuthSession(storage, user) {
  try {
    if (!storage || typeof storage.setItem !== 'function' || !user) return;
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
  } catch (_) {}
}

/**
 * @param {Storage|null|undefined} storage
 */
function clearAuthSession(storage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return;
    storage.removeItem(AUTH_SESSION_KEY);
  } catch (_) {}
}

/**
 * @param {Storage|null|undefined} storage
 * @returns {object|null}
 */
function loadAuthSession(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Sessão local válida (provider local ou legado sem provider).
 * @param {Delivery|null|undefined} session
 * @returns {boolean}
 */
function isValidLocalSession(session) {
  return !!(session && session.uid && (session.provider === 'local' || !session.provider));
}

/**
 * @param {Delivery|null|undefined} session
 * @returns {{ uid: string, displayName: string, email: string, photoURL: string, provider: string }|null}
 */
function localUserFromSession(session) {
  if (!isValidLocalSession(session)) return null;
  return {
    uid: String(session.uid),
    displayName: session.displayName || 'Neste aparelho',
    email: '',
    photoURL: '',
    provider: 'local'
  };
}

/**
 * @param {string} uid
 * @returns {{ uid: string, displayName: string, email: string, photoURL: string, provider: string }}
 */
function createLocalUser(uid) {
  return {
    uid: String(uid || ''),
    displayName: 'Neste aparelho',
    email: '',
    photoURL: '',
    provider: 'local'
  };
}

/**
 * @param {{ now?: () => number, random?: () => number }} [opts]
 * @returns {string}
 */
function generateLocalUid(opts) {
  const now = opts && typeof opts.now === 'function' ? opts.now() : Date.now();
  const random = opts && typeof opts.random === 'function' ? opts.random() : Math.random();
  return 'local_' + Number(now).toString(36) + Number(random).toString(36).slice(2, 6);
}

/**
 * Lê ou cria uid local estável no storage.
 * @param {Storage|null|undefined} storage
 * @param {{ now?: () => number, random?: () => number }} [opts]
 * @returns {string}
 */
function ensureLocalUid(storage, opts) {
  try {
    if (storage && typeof storage.getItem === 'function') {
      const existing = storage.getItem(LOCAL_UID_KEY);
      if (existing) return existing;
      const next = generateLocalUid(opts);
      if (typeof storage.setItem === 'function') storage.setItem(LOCAL_UID_KEY, next);
      return next;
    }
  } catch (_) {}
  return generateLocalUid(opts);
}

/**
 * @param {{ empresaPadrao?: string, mensagemPadrao?: string }} [opts]
 * @returns {{ motorista: string, empresa: string, mensagemPadrao: string }}
 */
function defaultUserProfile(opts) {
  const empresa = (opts && opts.empresaPadrao) || '';
  const mensagem = (opts && opts.mensagemPadrao) || '';
  return {
    motorista: 'Motorista',
    empresa,
    mensagemPadrao: mensagem
  };
}

/**
 * Rótulo curto da conta para UI de perfil.
 * @param {{ provider?: string, email?: string, displayName?: string }|null|undefined} user
 * @returns {string}
 */
function accountLabelForUser(user) {
  if (!user) return 'Conta';
  if (user.provider === 'local') return 'Conta neste aparelho';
  return user.email || user.displayName || 'Conta';
}

module.exports = {
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
};
