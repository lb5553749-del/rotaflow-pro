/**
 * Modal de perfil e preferências (empresa, WhatsApp, pins, feedback, backup).
 * Carregado sob demanda (patch 06): só ao abrir o perfil. O tema escuro do boot
 * fica em theme.js, que é eager.
 * Helpers puros em lib/profile-helpers.js; main injeta prefs via configureProfile().
 */
import { escapeHtml } from '../../lib/html.js';
import {
    formatLastBackupLabel,
    applyProfileFormValues
} from '../../lib/profile-helpers.js';
import { EMPRESA_PADRAO } from './auth.js';
import { readBackupMeta } from './backup-store.js';
import { refreshMapTheme } from './map-layer.js';

let deps = {
    getUserProfile: () => ({}),
    getCurrentUser: () => null,
    accountLabel: () => 'Sem conta',
    getPinSizePref: () => 'p',
    getFeedbackVibrateEnabled: () => true,
    getFeedbackSoundEnabled: () => true,
    getVehicleModeEnabled: () => false,
    setPinSizePref: () => {},
    setFeedbackPrefs: () => {},
    setVehicleModeEnabled: () => {},
    showRiskAreasModal: () => {},
    saveStorage: () => {},
    backupData: async () => {},
    logoutUser: () => {},
    showToast: () => {}
};

export function configureProfile(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function showProfileModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const userProfile = deps.getUserProfile();
    const accountLabelText = deps.getCurrentUser() ? deps.accountLabel() : 'Sem conta';
    const pinSizePref = deps.getPinSizePref();
    const feedbackVibrateEnabled = deps.getFeedbackVibrateEnabled();
    const feedbackSoundEnabled = deps.getFeedbackSoundEnabled();
    const vehicleModeEnabled = !!deps.getVehicleModeEnabled();
    let darkMapPref = false;
    try { darkMapPref = localStorage.getItem('rotaflow_dark_map') === '1'; } catch (_) {}
    const prefTema = getPrefTema();
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:450px;">
            <h3 class="modal-title">Perfil e preferências</h3>
            <div class="form-group">
                <label>Conta</label>
                <div class="profile-account-chip">${escapeHtml(accountLabelText)}</div>
            </div>
            <div class="form-group">
                <label for="profileMotorista">Nome do motorista</label>
                <input type="text" id="profileMotorista" value="${escapeHtml(userProfile.motorista)}" class="edit-input">
            </div>
            <div class="form-group">
                <label for="profileEmpresa">Nome da empresa</label>
                <input type="text" id="profileEmpresa" value="${escapeHtml(userProfile.empresa || EMPRESA_PADRAO)}" class="edit-input" placeholder="${escapeHtml(EMPRESA_PADRAO)}">
                <span class="profile-hint">Usado no WhatsApp como 📦 {empresa}</span>
            </div>
            <div class="form-group">
                <label for="profileMensagem">Mensagem padrão do WhatsApp</label>
                <textarea id="profileMensagem" class="edit-input" rows="8" style="resize:vertical;">${escapeHtml(userProfile.mensagemPadrao)}</textarea>
                <span class="profile-hint">Placeholders: {nome}, {id}, {pacotes}, {endereco}, {empresa}, {obs}, {link}</span>
            </div>
            <div class="form-group">
                <label>Custos e lucro da rota</label>
                <div class="form-row-2cols" style="margin-bottom:8px;">
                    <div style="flex:1;">
                        <label for="profileConsumo" class="profile-field-sublabel">Consumo (km/l)</label>
                        <input type="number" id="profileConsumo" class="edit-input" min="0" step="0.1" inputmode="decimal" placeholder="Ex.: 12" value="${userProfile.consumoKmL != null ? escapeHtml(String(userProfile.consumoKmL)) : ''}">
                    </div>
                    <div style="flex:1;">
                        <label for="profilePrecoCombustivel" class="profile-field-sublabel">Combustível (R$/l)</label>
                        <input type="number" id="profilePrecoCombustivel" class="edit-input" min="0" step="0.01" inputmode="decimal" placeholder="Ex.: 6,49" value="${userProfile.precoCombustivel != null ? escapeHtml(String(userProfile.precoCombustivel)) : ''}">
                    </div>
                </div>
                <label for="profileValorPadrao" class="profile-field-sublabel">Receita padrão por entrega (R$)</label>
                <input type="number" id="profileValorPadrao" class="edit-input" min="0" step="0.01" inputmode="decimal" placeholder="Ex.: 12,00" value="${userProfile.valorPadraoEntrega != null ? escapeHtml(String(userProfile.valorPadraoEntrega)) : ''}">
                <span class="profile-hint">Usado no resumo ao arquivar o dia (pode sobrescrever por entrega)</span>
            </div>
            <div class="form-group">
                <label>Tamanho dos pins no mapa</label>
                <div class="pin-size-options" id="pinSizeOptions">
                    <button type="button" class="pin-size-option${pinSizePref === 'p' ? ' active' : ''}" data-size="p">Pequeno</button>
                    <button type="button" class="pin-size-option${pinSizePref === 'm' ? ' active' : ''}" data-size="m">Médio</button>
                    <button type="button" class="pin-size-option${pinSizePref === 'g' ? ' active' : ''}" data-size="g">Grande</button>
                </div>
            </div>
            <div class="form-group">
                <label>Feedback ao entregar</label>
                <div class="pref-toggle-row">
                    <div>
                        <span>Vibração</span>
                        <small>Ao concluir entrega ou lembrete</small>
                    </div>
                    <input type="checkbox" id="profileVibrate" ${feedbackVibrateEnabled ? 'checked' : ''} aria-label="Ativar vibração">
                </div>
                <div class="pref-toggle-row">
                    <div>
                        <span>Som</span>
                        <small>Beep curto de confirmação</small>
                    </div>
                    <input type="checkbox" id="profileSound" ${feedbackSoundEnabled ? 'checked' : ''} aria-label="Ativar som">
                </div>
            </div>
            <div class="form-group">
                <label>Aparência</label>
                <div class="pref-toggle-row pref-toggle-col">
                    <div>
                        <span>Tema do app</span>
                        <small>Claro, escuro, ou seguindo o aparelho</small>
                    </div>
                    <div class="tema-seletor" role="radiogroup" aria-label="Tema do app">
                        <button type="button" role="radio" data-tema="claro" aria-checked="${prefTema === 'claro'}"><i class="fas fa-sun" aria-hidden="true"></i> Claro</button>
                        <button type="button" role="radio" data-tema="escuro" aria-checked="${prefTema === 'escuro'}"><i class="fas fa-moon" aria-hidden="true"></i> Escuro</button>
                        <button type="button" role="radio" data-tema="sistema" aria-checked="${prefTema === 'sistema'}"><i class="fas fa-mobile-screen" aria-hidden="true"></i> Sistema</button>
                    </div>
                </div>
                <div class="pref-toggle-row">
                    <div>
                        <span>Mapa escuro</span>
                        <small>Só o mapa noturno, mesmo com app claro</small>
                    </div>
                    <input type="checkbox" id="profileDarkMap" ${darkMapPref ? 'checked' : ''} aria-label="Ativar mapa escuro">
                </div>
            </div>
            <div class="form-group">
                <label>Modo suporte veicular</label>
                <div class="pref-toggle-row">
                    <div>
                        <span>Alto contraste e botões maiores</span>
                        <small>Próximo destino em destaque · Maps/Waze</small>
                    </div>
                    <input type="checkbox" id="profileVehicleMode" ${vehicleModeEnabled ? 'checked' : ''} aria-label="Ativar modo suporte veicular">
                </div>
            </div>
            <div class="form-group">
                <label>Áreas de risco</label>
                <div class="pref-toggle-row">
                    <div>
                        <span>Bairros / ruas com alerta</span>
                        <small>Amarelo ou vermelho (priorize diurno)</small>
                    </div>
                    <button type="button" class="action-btn backup-agenda-btn" id="profileRiskAreasBtn" style="margin:0;white-space:nowrap;"><i class="fas fa-exclamation-triangle"></i> Gerir</button>
                </div>
            </div>
            <div class="form-group">
                <label>Backup</label>
                <div class="pref-toggle-row">
                    <div>
                        <span>Exportar dados</span>
                        <small id="profileBackupMeta">${escapeHtml(formatLastBackupLabel(readBackupMeta()))}</small>
                    </div>
                    <button type="button" class="action-btn backup-agenda-btn" id="profileBackupBtn" style="margin:0;white-space:nowrap;"><i class="fas fa-download"></i> Backup</button>
                </div>
            </div>
            <div class="modal-buttons">
                <button type="button" class="modal-confirm" id="saveProfileBtn">Salvar</button>
                <button type="button" class="modal-cancel" id="cancelProfileBtn">Fechar</button>
            </div>
            <button type="button" class="modal-text-danger" id="logoutProfileBtn">Sair da conta</button>
        </div>
    `;
    document.body.appendChild(overlay);

    let pendingPinSize = pinSizePref;
    overlay.querySelectorAll('.pin-size-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            pendingPinSize = btn.dataset.size;
            overlay.querySelectorAll('.pin-size-option').forEach((b) => b.classList.toggle('active', b === btn));
        });
    });

    document.getElementById('profileBackupBtn')?.addEventListener('click', async () => {
        await deps.backupData();
        const metaEl = document.getElementById('profileBackupMeta');
        const m = readBackupMeta();
        if (metaEl && m.lastBackupAt) {
            metaEl.textContent = formatLastBackupLabel(m);
        }
    });

    document.getElementById('profileRiskAreasBtn')?.addEventListener('click', () => {
        overlay.remove();
        deps.showRiskAreasModal();
    });

    document.getElementById('saveProfileBtn').onclick = () => {
        applyProfileFormValues(userProfile, {
            motorista: document.getElementById('profileMotorista').value,
            empresa: document.getElementById('profileEmpresa').value,
            mensagemPadrao: document.getElementById('profileMensagem').value,
            consumoKmL: document.getElementById('profileConsumo')?.value,
            precoCombustivel: document.getElementById('profilePrecoCombustivel')?.value,
            valorPadraoEntrega: document.getElementById('profileValorPadrao')?.value
        }, EMPRESA_PADRAO);
        deps.setPinSizePref(pendingPinSize);
        deps.setFeedbackPrefs({
            vibrate: !!document.getElementById('profileVibrate')?.checked,
            sound: !!document.getElementById('profileSound')?.checked
        });
        deps.setVehicleModeEnabled(!!document.getElementById('profileVehicleMode')?.checked);
        const temaEscolhido = overlay.querySelector('.tema-seletor [aria-checked="true"]')?.dataset.tema || 'sistema';
        applyTema(temaEscolhido);
        try {
            localStorage.setItem('rotaflow_dark_map', document.getElementById('profileDarkMap')?.checked ? '1' : '0');
        } catch (_) {}
        refreshMapTheme();
        deps.saveStorage();
        deps.showToast("Perfil salvo");
        overlay.remove();
    };
    // Seletor de tema: exclusivo, acessível (role=radio) e com retorno imediato.
    overlay.querySelectorAll('.tema-seletor [data-tema]').forEach((btn) => {
        btn.onclick = () => {
            overlay.querySelectorAll('.tema-seletor [data-tema]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
            applyTema(btn.dataset.tema);
        };
    });
    document.getElementById('cancelProfileBtn').onclick = () => overlay.remove();
    document.getElementById('logoutProfileBtn').onclick = () => {
        overlay.remove();
        deps.logoutUser();
    };
}

/**
 * Preferência de tema em três estados: 'claro' | 'escuro' | 'sistema'.
 * Compatível com o formato antigo ('1' = escuro, '0' = claro, ausente = sistema).
 * @returns {'claro'|'escuro'|'sistema'}
 */
export function getPrefTema() {
    try {
        const v = localStorage.getItem('rotaflow_dark_theme');
        if (v === '1') return 'escuro';
        if (v === '0') return 'claro';
    } catch (_) {}
    return 'sistema';
}

/**
 * Aplica e salva o tema. 'sistema' volta a seguir o aparelho (prefers-color-scheme).
 * @param {'claro'|'escuro'|'sistema'} tema
 */
export function applyTema(tema) {
    const escolhido = tema === 'claro' || tema === 'escuro' ? tema : 'sistema';
    try {
        if (escolhido === 'sistema') localStorage.removeItem('rotaflow_dark_theme');
        else localStorage.setItem('rotaflow_dark_theme', escolhido === 'escuro' ? '1' : '0');
    } catch (_) {}
    const escuro = escolhido === 'escuro'
        || (escolhido === 'sistema'
            && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    document.documentElement.classList.toggle('dark-theme', escuro);
    refreshMapTheme();
}

export function applyDarkMode(enabled) {
    try {
        localStorage.setItem('rotaflow_dark_theme', enabled ? '1' : '0');
    } catch (_) {}
    document.documentElement.classList.toggle('dark-theme', !!enabled);
    // Web JS API: reaplica o estilo no mapa já carregado. No nativo o estilo
    // vale a partir do próximo init (o boot aplica o tema via theme.js antes).
    refreshMapTheme();
}
