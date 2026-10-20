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
                <div class="pref-toggle-row">
                    <div>
                        <span>Modo escuro</span>
                        <small>Tema escuro para conforto visual à noite</small>
                    </div>
                    <input type="checkbox" id="profileDarkMode" ${document.documentElement.classList.contains('dark-theme') ? 'checked' : ''} aria-label="Ativar modo escuro">
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
        const darkMode = !!document.getElementById('profileDarkMode')?.checked;
        applyDarkMode(darkMode);
        try {
            localStorage.setItem('rotaflow_dark_map', document.getElementById('profileDarkMap')?.checked ? '1' : '0');
        } catch (_) {}
        refreshMapTheme();
        deps.saveStorage();
        deps.showToast("Perfil salvo");
        overlay.remove();
    };
    document.getElementById('cancelProfileBtn').onclick = () => overlay.remove();
    document.getElementById('logoutProfileBtn').onclick = () => {
        overlay.remove();
        deps.logoutUser();
    };
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
