/**
 * Indicador de sincronização — reflete os eventos reais de persistência do app:
 *  - saveStorage()/persistStorageNow() (persist.js): "Salvando…" → "Salvo no aparelho"
 *  - uploadCloudBackup() (backup-ui.js): "Enviando para a nuvem…" → "Sincronizado"
 *  - online/offline do navegador: bolinha cinza e aviso no detalhe
 *
 * Não há sync contínuo de rota/agenda: o app é local-first. A nuvem só entra no backup.
 */

import { openAppModal } from './modals.js';
import { escapeHtml } from '../../lib/html.js';

const STATE_KEY = 'rotaflow_sync_state';
/** Resultados de nuvem que não são erro de verdade (só estavam sem internet/desativado). */
const BENIGN_CLOUD_ERRORS = new Set(['offline', 'disabled', 'skipped', 'storage-missing']);

function readPersistedState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            lastSaveAt: Number(parsed.lastSaveAt) || null,
            lastCloudAt: Number(parsed.lastCloudAt) || null
        };
    } catch (_) {
        return null;
    }
}

function writePersistedState({ lastSaveAt, lastCloudAt }) {
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify({ lastSaveAt, lastCloudAt }));
    } catch (_) { /* quota: indicador continua funcionando só nesta sessão */ }
}

export class SyncStatusManager {
    constructor() {
        const persisted = readPersistedState();
        this.state = {
            online: typeof navigator === 'undefined' ? true : navigator.onLine,
            saving: false,
            syncing: false,
            lastSaveAt: persisted ? persisted.lastSaveAt : null,
            lastCloudAt: persisted ? persisted.lastCloudAt : null,
            pendingChanges: 0,
            syncError: null
        };
        this.listeners = [];
        this.setupNetworkListeners();
        this.startPeriodicUpdate();
    }

    /**
     * Configura listeners de rede
     */
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.state.online = true;
            this.updateUI();
            this.notifyListeners('online');
        });

        window.addEventListener('offline', () => {
            this.state.online = false;
            this.updateUI();
            this.notifyListeners('offline');
        });
    }

    /**
     * Atualização periódica do timestamp ("há 5min")
     */
    startPeriodicUpdate() {
        setInterval(() => {
            if (this.state.lastSaveAt || this.state.lastCloudAt) {
                this.updateTimestamp();
            }
        }, 30000);
    }

    /**
     * Uma edição foi feita e ainda não foi descarregada no armazenamento (debounce do saveStorage).
     */
    markDirty() {
        this.state.pendingChanges = 1;
        this.state.syncError = null;
        this.updateUI();
    }

    /**
     * Inicia/finaliza uma gravação local em andamento.
     */
    setSaving(saving) {
        this.state.saving = !!saving;
        if (!saving) this.state.pendingChanges = 0;
        this.updateUI();
    }

    /**
     * Gravação local concluída com sucesso.
     */
    markLocalSave() {
        this.state.lastSaveAt = Date.now();
        this.state.saving = false;
        this.state.pendingChanges = 0;
        this.state.syncError = null;
        writePersistedState(this.state);
        this.updateUI();
        this.notifyListeners('localSave');
    }

    /**
     * Falha ao gravar localmente (geralmente armazenamento cheio).
     */
    markSaveError(message) {
        this.state.saving = false;
        this.state.syncError = message || 'Falha ao salvar';
        this.updateUI();
        this.notifyListeners('error', { error: this.state.syncError });
    }

    /**
     * Começou um envio para a nuvem (backup).
     */
    markCloudStart() {
        this.state.syncing = true;
        this.updateUI();
        this.notifyListeners('sync', { syncing: true });
    }

    /**
     * Envio para a nuvem concluído.
     */
    markCloudSuccess() {
        this.state.lastCloudAt = Date.now();
        this.state.syncing = false;
        this.state.syncError = null;
        writePersistedState(this.state);
        this.updateUI();
        this.notifyListeners('cloudSuccess');
    }

    /**
     * Envio para a nuvem terminou sem sucesso.
     * Erros benignos (offline/disabled) apenas liberam o indicador, sem alarmar.
     */
    markCloudError(error) {
        this.state.syncing = false;
        const code = String(error || 'falha');
        if (!BENIGN_CLOUD_ERRORS.has(code)) {
            this.state.syncError = `Nuvem: ${code}`;
            this.notifyListeners('error', { error: this.state.syncError });
        }
        this.updateUI();
    }

    /**
     * Define erro genérico (mantido p/ compatibilidade da API).
     */
    setSyncError(error) {
        this.state.syncError = error;
        this.updateUI();
        this.notifyListeners('error', { error });
    }

    /**
     * Limpa erro de sincronização
     */
    clearSyncError() {
        this.state.syncError = null;
        this.updateUI();
    }

    /**
     * Retorna estado atual
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Atualiza UI completa
     */
    updateUI() {
        this.updateIndicator();
        this.updateStateText();
        this.updateTimestamp();
        this.updateTooltip();
    }

    /**
     * Atualiza indicador visual (bolinha colorida)
     */
    updateIndicator() {
        const indicator = document.getElementById('syncIndicator');
        if (!indicator) return;

        indicator.className = 'sync-indicator';

        if (this.state.syncError) {
            indicator.classList.add('error');
        } else if (this.state.syncing) {
            indicator.classList.add('syncing');
        } else if (this.state.saving || this.state.pendingChanges > 0) {
            indicator.classList.add('saving');
        } else if (!this.state.online) {
            indicator.classList.add('offline');
        } else {
            indicator.classList.add('synced');
        }
    }

    /**
     * Atualiza texto do estado
     */
    updateStateText() {
        const stateEl = document.getElementById('syncState');
        if (!stateEl) return;

        let text = '';
        if (this.state.syncError) {
            text = this.state.syncError.length > 22
                ? this.state.syncError.slice(0, 21) + '…'
                : this.state.syncError;
        } else if (this.state.syncing) {
            text = 'Enviando para a nuvem…';
        } else if (this.state.saving || this.state.pendingChanges > 0) {
            text = 'Salvando…';
        } else if (!this.state.online) {
            text = 'Offline';
        } else if (this.cloudUpToDate()) {
            text = 'Sincronizado';
        } else if (this.state.lastSaveAt) {
            text = 'Salvo no aparelho';
        } else {
            text = 'Aguardando';
        }

        stateEl.textContent = text;
    }

    /**
     * A nuvem está tão atual quanto o último save local?
     */
    cloudUpToDate() {
        return !!this.state.lastCloudAt && this.state.lastCloudAt >= (this.state.lastSaveAt || 0);
    }

    /**
     * Atualiza timestamp do último salvamento
     */
    updateTimestamp() {
        const timestampEl = document.getElementById('syncTimestamp');
        if (!timestampEl) return;

        const last = Math.max(this.state.lastSaveAt || 0, this.state.lastCloudAt || 0);
        if (!last) {
            timestampEl.textContent = '';
            return;
        }

        const minutes = Math.floor((Date.now() - last) / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let timeText = '';
        if (days > 0) {
            timeText = `há ${days}d`;
        } else if (hours > 0) {
            timeText = `há ${hours}h`;
        } else if (minutes > 0) {
            timeText = `há ${minutes}min`;
        } else {
            timeText = 'agora mesmo';
        }

        timestampEl.textContent = timeText;
    }

    /**
     * Atualiza tooltip
     */
    updateTooltip() {
        const statusEl = document.getElementById('syncStatus');
        if (!statusEl) return;

        let tooltip = '';
        if (this.state.syncError) {
            tooltip = this.state.syncError;
        } else if (this.state.syncing) {
            tooltip = 'Enviando backup para a nuvem...';
        } else if (this.state.saving || this.state.pendingChanges > 0) {
            tooltip = 'Salvando suas alterações no aparelho...';
        } else if (!this.state.online) {
            tooltip = 'Sem conexão com a internet. Os dados estão salvos localmente.';
        } else if (this.cloudUpToDate()) {
            tooltip = 'Backup na nuvem atualizado';
        } else if (this.state.lastSaveAt) {
            tooltip = 'Tudo salvo neste aparelho. Use o backup para enviar à nuvem.';
        } else {
            tooltip = 'Aguardando o primeiro salvamento';
        }

        statusEl.title = tooltip;
    }

    /**
     * Adiciona listener de eventos
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove listener
     */
    removeListener(callback) {
        const idx = this.listeners.indexOf(callback);
        if (idx >= 0) {
            this.listeners.splice(idx, 1);
        }
    }

    /**
     * Notifica listeners
     */
    notifyListeners(event, data = {}) {
        this.listeners.forEach((callback) => {
            try {
                callback(event, { ...this.state, ...data });
            } catch (e) {
                console.error('Erro ao notificar listener:', e);
            }
        });
    }
}

// Singleton instance
export const syncStatus = new SyncStatusManager();

/**
 * Inicializa UI de sincronização
 */
export function initSyncStatusUI() {
    syncStatus.updateUI();

    const statusEl = document.getElementById('syncStatus');
    if (statusEl) {
        statusEl.style.cursor = 'pointer';
        statusEl.addEventListener('click', () => {
            showSyncDetails();
        });
    }
}

function formatTimestamp(ts) {
    if (!ts) return 'Nunca';
    return new Date(ts).toLocaleString('pt-BR');
}

/**
 * Mostra modal com detalhes de sincronização
 */
async function showSyncDetails() {
    const state = syncStatus.getState();

    const rows = [
        `<p><strong>Status:</strong> ${state.online ? '🟢 Online' : '🔴 Offline'}</p>`,
        `<p><strong>Salvo no aparelho:</strong><br>${escapeHtml(formatTimestamp(state.lastSaveAt))}</p>`,
        `<p><strong>Backup na nuvem:</strong><br>${escapeHtml(formatTimestamp(state.lastCloudAt))}</p>`
    ];

    if (state.syncError) {
        rows.push(`<p style="color: var(--danger);"><strong>Erro:</strong> ${escapeHtml(state.syncError)}</p>`);
    }

    rows.push('<hr style="margin: 16px 0; border: none; border-top: 1px solid var(--line);">');
    rows.push(
        '<p style="font-size: 13px; color: var(--muted);">'
        + 'Seus dados são salvos automaticamente neste aparelho. O backup na nuvem é opcional '
        + '(menu Backup) e só acontece com internet.</p>'
    );

    await openAppModal({
        title: 'Status de Sincronização',
        bodyHtml: `<div style="text-align: left; line-height: 1.6;">${rows.join('')}</div>`,
        buttons: [{ label: 'Fechar', value: null, className: 'modal-confirm' }]
    });
}
