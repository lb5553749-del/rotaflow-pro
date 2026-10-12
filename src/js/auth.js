/**
 * Auth local / sessão / logout / chip de usuário.
 * Estado compartilhado (currentUser, authReady, userProfile) vive aqui —
 * main.js e outros módulos leem via getters (evita regressão de estado apagado).
 */
import {
    currentUidFromUser,
    storageKeyFor,
    saveAuthSession,
    clearAuthSession,
    loadAuthSession,
    localUserFromSession,
    createLocalUser,
    ensureLocalUid,
    defaultUserProfile,
    accountLabelForUser
} from '../../lib/auth-helpers.js';

export const EMPRESA_PADRAO = 'Correx express';
export const MENSAGEM_WHATSAPP_PADRAO =
    'Olá {nome}! 🚚\n' +
    'Sua encomenda ({id} - {pacotes} pacote(s)) está a caminho.\n' +
    '📍 Endereço: {endereco}\n' +
    '\n' +
    '⚠️ Estamos chegando em breve! Por favor, esteja disponível para receber.⚠️\n' +
    '📦 {empresa}\n' +
    '🗺️ Acompanhe no mapa: {link}';

let deps = {
    loadStorage: async () => {},
    persistStorageNow: () => false,
    maybeAutoBackupOnDayChange: () => {},
    resetAppAfterLogout: () => {},
    showToast: () => {},
    showConfirmModal: async () => false
};

/** @type {{ uid: string, displayName?: string, email?: string, photoURL?: string, provider?: string }|null} */
let currentUser = null;
let authReady = false;
let userProfile = defaultUserProfile({
    empresaPadrao: EMPRESA_PADRAO,
    mensagemPadrao: MENSAGEM_WHATSAPP_PADRAO
});

export function configureAuth(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function getCurrentUser() {
    return currentUser;
}

export function getAuthReady() {
    return authReady;
}

export function getUserProfile() {
    return userProfile;
}

export function setUserProfile(p) {
    if (p) userProfile = p;
}

export function currentUid() {
    return currentUidFromUser(currentUser);
}

export function storageKey(base) {
    return storageKeyFor(base, currentUid());
}

export function accountLabel() {
    return accountLabelForUser(currentUser);
}

export function updateUserChip() {
    const chip = document.getElementById('userChip');
    const name = document.getElementById('userChipName');
    const photo = document.getElementById('userChipPhoto');
    if (!chip || !currentUser) return;
    name.textContent = currentUser.displayName || currentUser.email || 'Conta local';
    if (currentUser.photoURL) {
        photo.src = currentUser.photoURL;
        photo.style.display = 'block';
    } else {
        photo.removeAttribute('src');
        photo.style.display = 'none';
    }
    chip.classList.add('show');
}

export function hideLoginScreen() {
    document.getElementById('loginScreen')?.classList.add('hidden');
}

export function showLoginScreen() {
    document.getElementById('loginScreen')?.classList.remove('hidden');
}

export async function enterAsUser(user) {
    currentUser = user;
    authReady = true;
    saveAuthSession(typeof localStorage !== 'undefined' ? localStorage : null, user);
    try {
        if (window.RotaFlowCap && typeof window.RotaFlowCap.setCrashlyticsUser === 'function') {
            window.RotaFlowCap.setCrashlyticsUser(user && user.uid);
        }
    } catch (_) {}
    updateUserChip();
    hideLoginScreen();
    await deps.loadStorage();
    deps.showToast(`Bem-vindo, ${user.displayName || 'motorista'}`);
    deps.maybeAutoBackupOnDayChange();
}

export async function continueLocally() {
    const localId = ensureLocalUid(typeof localStorage !== 'undefined' ? localStorage : null);
    await enterAsUser(createLocalUser(localId));
}

export async function logoutUser() {
    const ok = await deps.showConfirmModal({
        title: 'Sair',
        message: 'Deseja sair agora? Seus dados permanecem salvos neste aparelho e estarão disponíveis ao retornar.',
        confirmText: 'Sair',
        danger: true
    });
    if (!ok) return;
    deps.persistStorageNow();
    clearAuthSession(typeof localStorage !== 'undefined' ? localStorage : null);
    currentUser = null;
    authReady = false;
    deps.resetAppAfterLogout();
    document.getElementById('userChip')?.classList.remove('show');
    showLoginScreen();
}

export function initAuthUi() {
    const localBtn = document.getElementById('loginLocalBtn');
    const hint = document.getElementById('loginHint');
    if (hint) hint.textContent = 'Os dados ficam neste aparelho.';

    if (localBtn) localBtn.addEventListener('click', continueLocally);

    const session = loadAuthSession(typeof localStorage !== 'undefined' ? localStorage : null);
    const restored = localUserFromSession(session);
    if (restored) {
        enterAsUser(restored);
    } else {
        // Único modo: entra direto neste aparelho.
        continueLocally();
    }
}
