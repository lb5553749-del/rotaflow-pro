/**
 * UI de backup/restore (lembrete, exportação JSON, restauração).
 * Persistência silenciosa e nuvem ficam em backup-store.js.
 */
import { cloneWithoutHeavyPhotos } from '../../lib/persist-helpers.js';
import { parseBackupPayload, parseAgendaBackup } from '../../lib/backup-schema.js';

import {
    attachPhotoBlobs,
    collectBackupPhotoIds,
    collectPhotoBlobsMap,
    planPhotoRestoreEntries
} from '../../lib/backup-photos.js';
import {
    BACKUP_REMIND_DAYS,
    BACKUP_DISMISS_DAYS,
    BACKUP_AUTO_DELIVERIES,
    BACKUP_AUTO_IDLE_MS,
    BACKUP_AUTO_MIN_GAP_MS,
    CLOUD_BACKUP_ENABLED,
    readBackupMeta,
    writeBackupMeta,
    daysSince,
    todayBackupDayKey,
    writeSilentLocalBackup,
    uploadCloudBackup
} from './backup-store.js';

let deps = {
    getDeliveries: () => [],
    getAgenda: () => [],
    setAgenda: () => {},
    getRoutes: () => [],
    getActiveRouteId: () => null,
    getNextSequenceNumber: () => 1,
    setNextAgendaId: () => {},
    getNextAgendaId: () => 1,
    getUserProfile: () => ({}),
    setUserProfile: () => {},
    persistStorageNow: () => {},
    syncActiveRouteIntoRoutes: () => {},
    isNativeApp: () => false,
    showToast: () => {},
    showConfirmModal: async () => false,
    showChoiceModal: async () => null,
    hydrateRoutesFromData: () => {},
    migrateTelefones: () => {},
    migrateFavorito: () => {},
    normalizeDeliveryCoords: () => {},
    hydrateAllPhotos: async () => {},
    exportPhotoDataUrl: async () => null,
    idbPutPhoto: async () => {},
    yieldToUiFrame: async () => {},
    seedIdCounter: () => {},
    clearRouteOverlay: () => {},
    renderDeliveriesList: () => {},
    renderRouteSwitcher: () => {},
    renderAgendaList: () => {},
    rebuildMarkers: () => {},
    updateDeliveryStats: () => {},
    updateOptimizeFabVisibility: () => {},
    updateLastIdDisplay: () => {},
    getAuthReady: () => false,
    recoverUiAfterResume: () => {}
};

export function configureBackupUi(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let backupAutoTimer = null;
let backupAutoRunning = false;
let backupDeliveriesSinceAuto = 0;
let backupDayKey = '';

export function hideBackupReminder() {
    const el = document.getElementById('backupReminder');
    if (el) el.classList.remove('is-visible');
}

export function maybeShowBackupReminder() {
    const el = document.getElementById('backupReminder');
    const text = document.getElementById('backupReminderText');
    if (!el) return;

    const hasData = (deps.getDeliveries() && deps.getDeliveries().length) || (deps.getAgenda() && deps.getAgenda().length);
    if (!hasData) {
        hideBackupReminder();
        return;
    }

    const meta = readBackupMeta();
    const sinceBackup = daysSince(meta.lastBackupAt);
    const sinceDismiss = daysSince(meta.lastDismissAt);
    const needsRemind = sinceBackup >= BACKUP_REMIND_DAYS;
    const coolDownOk = sinceDismiss >= BACKUP_DISMISS_DAYS;

    if (!needsRemind || !coolDownOk) {
        hideBackupReminder();
        return;
    }

    if (text) {
        if (!meta.lastBackupAt) {
            text.textContent = 'Ainda não há backup neste aparelho. Exporte a rota e a agenda para ficar seguro.';
        } else {
            const d = Math.floor(sinceBackup);
            text.textContent = `Último backup há ${d} dia${d === 1 ? '' : 's'}. Exporte um JSON para não perder dados.`;
        }
    }
    el.classList.add('is-visible');
}

export function dismissBackupReminder() {
    writeBackupMeta({ lastDismissAt: Date.now() });
    hideBackupReminder();
    deps.showToast('Lembrete adiado');
}

export function setupBackupReminderUi() {
    const nowBtn = document.getElementById('backupReminderNowBtn');
    const dismissBtn = document.getElementById('backupReminderDismissBtn');
    if (nowBtn && !nowBtn.dataset.ready) {
        nowBtn.dataset.ready = '1';
        nowBtn.addEventListener('click', () => { backupData(); });
    }
    if (dismissBtn && !dismissBtn.dataset.ready) {
        dismissBtn.dataset.ready = '1';
        dismissBtn.addEventListener('click', dismissBackupReminder);
    }
}

/** Backup leve (sem blobs) — auto-backup / silencioso. */
export function buildFullBackupObject() {
    deps.persistStorageNow();
    deps.syncActiveRouteIntoRoutes();
    const lightRoutes = (deps.getRoutes() || []).map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        nextSequenceNumber: r.nextSequenceNumber,
        routeActive: !!r.routeActive,
        routeMetrics: r.routeMetrics || null,
        deliveries: cloneWithoutHeavyPhotos(r.deliveries || [])
    }));
    return {
        version: 1,
        exportedAt: Date.now(),
        routes: lightRoutes,
        activeRouteId: deps.getActiveRouteId(),
        deliveries: cloneWithoutHeavyPhotos(deps.getDeliveries()),
        agenda: cloneWithoutHeavyPhotos(deps.getAgenda()),
        nextSequenceNumber: deps.getNextSequenceNumber(),
        nextAgendaId: deps.getNextAgendaId(),
        userProfile: deps.getUserProfile()
    };
}

/**
 * Exportação do menu ⋯: apenas a rota atual (não a agenda nem outras rotas).
 * O marcador `kind: 'route-export'` faz a restauração importar como rota nova
 * em vez de substituir tudo — é o formato que "abre em outro celular".
 */
export function buildRouteExportObject() {
    deps.persistStorageNow();
    deps.syncActiveRouteIntoRoutes();
    const activeId = deps.getActiveRouteId();
    const route = (deps.getRoutes() || []).find((r) => r && r.id === activeId) || {};
    const deliveries = cloneWithoutHeavyPhotos(
        Array.isArray(route.deliveries) ? route.deliveries : deps.getDeliveries()
    );
    const routeRow = {
        id: String(route.id || activeId || ''),
        name: route.name || 'Rota 1',
        createdAt: route.createdAt,
        nextSequenceNumber: route.nextSequenceNumber || deps.getNextSequenceNumber(),
        routeActive: !!route.routeActive,
        routeMetrics: route.routeMetrics || null,
        deliveries
    };
    return {
        kind: 'route-export',
        version: 1,
        exportedAt: Date.now(),
        routes: [routeRow],
        activeRouteId: routeRow.id,
        deliveries,
        agenda: [],
        nextSequenceNumber: routeRow.nextSequenceNumber,
        nextAgendaId: deps.getNextAgendaId(),
        userProfile: deps.getUserProfile()
    };
}

/**
 * Arquivo de exportação da rota atual: JSON leve + mapa `photoBlobs` (data URLs).
 * Carrega fotos do IndexedDB uma a uma para não estourar a WebView.
 */
export async function buildExportBackupObject() {
    const data = buildRouteExportObject();
    const ids = collectBackupPhotoIds(data);
    if (!ids.length) {
        return attachPhotoBlobs(data, {});
    }
    deps.showToast(`A incluir ${ids.length} foto${ids.length === 1 ? '' : 's'} no backup…`);
    const photoBlobs = await collectPhotoBlobsMap(
        ids,
        (id) => deps.exportPhotoDataUrl(id),
        {
            onProgress: async (done, total) => {
                if (done % 3 === 0 || done === total) {
                    await deps.yieldToUiFrame();
                }
            }
        }
    );
    return attachPhotoBlobs(data, photoBlobs);
}

async function restorePhotoBlobsIntoIdb(data) {
    const entries = planPhotoRestoreEntries(data);
    for (let i = 0; i < entries.length; i++) {
        const { id, dataUrl } = entries[i];
        try {
            await deps.idbPutPhoto(id, dataUrl);
        } catch (e) {
            console.warn('restore photo', id, e);
        }
        if (i % 3 === 2) await deps.yieldToUiFrame();
    }
    return entries.length;
}

export async function runAutoBackup({ reason = 'auto', cloud = true, silent = true } = {}) {
    cloud = cloud && CLOUD_BACKUP_ENABLED;
    if (backupAutoRunning) return null;
    if (!deps.getAuthReady()) return null;
    const hasData = (deps.getDeliveries() && deps.getDeliveries().length) || (deps.getAgenda() && deps.getAgenda().length);
    if (!hasData) return null;

    const meta = readBackupMeta();
    if (reason === 'idle' || reason === 'tick') {
        if (meta.lastAutoAt && (Date.now() - meta.lastAutoAt) < BACKUP_AUTO_MIN_GAP_MS) return null;
    }

    backupAutoRunning = true;
    try {
        const data = buildFullBackupObject();
        const json = JSON.stringify(data);
        const local = await writeSilentLocalBackup(json);
        let cloudRes = { ok: false, error: 'skipped' };
        if (cloud) cloudRes = await uploadCloudBackup(json);

        const patch = {
            lastAutoAt: Date.now(),
            dayKey: todayBackupDayKey(),
            deliveriesSinceBackup: 0
        };
        if (local.ok) {
            patch.lastBackupAt = Date.now();
            patch.lastDismissAt = Date.now();
        }
        if (cloudRes.ok) {
            patch.lastCloudAt = Date.now();
            patch.lastCloudOk = true;
            patch.lastCloudError = '';
        } else if (cloud) {
            patch.lastCloudOk = false;
            patch.lastCloudError = cloudRes.error || 'falha';
        }
        writeBackupMeta(patch);
        backupDeliveriesSinceAuto = 0;
        hideBackupReminder();

        if (!silent) {
            if (!cloud) deps.showToast(local.ok ? 'Backup automático salvo neste aparelho' : 'Não foi possível fazer o backup automático', !local.ok);
            else if (local.ok && cloudRes.ok) deps.showToast('Backup automático salvo neste aparelho e na nuvem');
            else if (local.ok && cloudRes.error === 'offline') deps.showToast('Backup local ok. Sem internet para a nuvem');
            else if (local.ok) deps.showToast('Backup local ok. Nuvem indisponível agora');
            else deps.showToast('Não foi possível fazer o backup automático', true);
        }
        return { local, cloud: cloudRes };
    } catch (e) {
        console.warn('auto backup', e);
        if (!silent) deps.showToast('Falha no backup automático', true);
        return null;
    } finally {
        backupAutoRunning = false;
    }
}

export function noteDeliveryCompletedForBackup() {
    backupDeliveriesSinceAuto += 1;
    const meta = readBackupMeta();
    const nextCount = (meta.deliveriesSinceBackup || 0) + 1;
    writeBackupMeta({ deliveriesSinceBackup: nextCount });
    if (backupDeliveriesSinceAuto >= BACKUP_AUTO_DELIVERIES || nextCount >= BACKUP_AUTO_DELIVERIES) {
        const kick = () => {
            runAutoBackup({ reason: 'deliveries', silent: true }).catch(() => {});
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(kick, { timeout: 4000 });
        else setTimeout(kick, 1200);
    }
}

export function maybeAutoBackupOnDayChange() {
    const day = todayBackupDayKey();
    const meta = readBackupMeta();
    if (meta.dayKey && meta.dayKey !== day) {
        const kick = () => runAutoBackup({ reason: 'day-change', silent: true }).catch(() => {});
        if (typeof requestIdleCallback === 'function') requestIdleCallback(kick, { timeout: 8000 });
        else setTimeout(kick, 1500);
        return;
    }
    if (!meta.dayKey) writeBackupMeta({ dayKey: day });
    backupDayKey = day;
}

export function setupAutoBackupScheduler() {
    maybeAutoBackupOnDayChange();
    if (backupAutoTimer) clearInterval(backupAutoTimer);
    backupAutoTimer = setInterval(() => {
        if (document.visibilityState === 'hidden') {
            runAutoBackup({ reason: 'idle', silent: true }).catch(() => {});
        } else {
            const meta = readBackupMeta();
            if (!meta.lastAutoAt || (Date.now() - meta.lastAutoAt) > 24 * 60 * 60 * 1000) {
                runAutoBackup({ reason: 'daily', silent: true }).catch(() => {});
            }
        }
        const day = todayBackupDayKey();
        if (backupDayKey && backupDayKey !== day) maybeAutoBackupOnDayChange();
        backupDayKey = day;
    }, BACKUP_AUTO_IDLE_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const kick = () => runAutoBackup({ reason: 'idle', silent: true }).catch(() => {});
            if (typeof requestIdleCallback === 'function') requestIdleCallback(kick, { timeout: 5000 });
            else setTimeout(kick, 800);
        } else {
            deps.recoverUiAfterResume();
        }
    });
}

export async function downloadJsonFile(filename, data, successMsg) {
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    try {
        if (deps.isNativeApp() && window.RotaFlowCap && typeof window.RotaFlowCap.saveAndShareTextFile === 'function') {
            await window.RotaFlowCap.saveAndShareTextFile(filename, json, filename);
            deps.showToast(successMsg || 'Arquivo pronto para salvar');
            return true;
        }
    } catch (e) {
        console.warn('native backup', e);
        deps.showToast('Não foi possível salvar o arquivo neste aparelho', true);
        return false;
    }

    try {
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(link.href);
            link.remove();
        }, 1500);
        deps.showToast(successMsg || 'Download iniciado');
        return true;
    } catch (e) {
        deps.showToast('Não foi possível baixar o arquivo', true);
        return false;
    }
}

export async function backupAgenda() {
    if (deps.getAgenda().length === 0) { deps.showToast('A agenda está vazia', true); return; }
    const data = { agenda: deps.getAgenda(), nextAgendaId: deps.getNextAgendaId() };
    const filename = `agenda_${new Date().toISOString().slice(0, 10)}.json`;
    await downloadJsonFile(filename, data, 'Escolha onde salvar o backup da agenda');
}

export function restoreAgenda(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = parseAgendaBackup(JSON.parse(e.target.result));
            if (!parsed.ok) throw new Error(parsed.error);
            const ok = await deps.showConfirmModal({
                title: 'Restaurar agenda',
                message: 'A agenda atual será substituída pelos dados do arquivo. Deseja continuar?',
                confirmText: 'Substituir',
                danger: true
            });
            if (!ok) return;
            const agenda = parsed.data.agenda;
            deps.setAgenda(agenda);
            deps.setNextAgendaId(parsed.data.nextAgendaId || 1);
            agenda.forEach((a) => {
                deps.migrateTelefones(a);
                deps.migrateFavorito(a);
                if (a.pacotes === undefined) a.pacotes = 1;
                if (!a.photos) a.photos = [];
                if (!a.photoIds) a.photoIds = [];
                if (a.notes === undefined) a.notes = '';
            });
            await deps.hydrateAllPhotos();
            deps.persistStorageNow();
            deps.renderAgendaList();
            deps.showToast('Agenda restaurada com sucesso');
        } catch (err) {
            deps.showToast('Não foi possível restaurar a agenda. Arquivo inválido', true);
        }
    };
    reader.readAsText(file);
}

async function backupDataLocal(filename, data) {
    const ok = await downloadJsonFile(filename, data, 'Escolha onde salvar o arquivo da rota');
    if (ok) {
        // Cópia silenciosa continua completa (rota + agenda) — é a rede de segurança local.
        await writeSilentLocalBackup(JSON.stringify(buildFullBackupObject())).catch(() => {});
        writeBackupMeta({
            lastBackupAt: Date.now(),
            lastDismissAt: Date.now(),
            lastAutoAt: Date.now(),
            deliveriesSinceBackup: 0,
            dayKey: todayBackupDayKey()
        });
        hideBackupReminder();
    }
    return ok;
}

export async function backupData() {
    if (!deps.getDeliveries().length) { deps.showToast('A rota atual está vazia', true); return; }
    const data = await buildExportBackupObject();
    const filename = `rotaflow_rota_${new Date().toISOString().slice(0, 10)}.rfpro`;

    if (!CLOUD_BACKUP_ENABLED) {
        await backupDataLocal(filename, data);
        return;
    }

    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const options = [
        { label: 'Neste aparelho (JSON)', value: 'local', icon: 'fas fa-download', iconColor: '#0f172a' }
    ];
    if (online) {
        options.push({ label: 'Nuvem + aparelho', value: 'cloud', icon: 'fas fa-cloud-upload-alt', iconColor: '#2563eb' });
    }
    const choice = await deps.showChoiceModal({
        title: 'Exportar rota atual',
        message: online
            ? 'Exporta apenas a rota de hoje com as fotos tiradas. A nuvem guarda tudo (rota + agenda):'
            : 'Sem internet — só é possível salvar neste aparelho.',
        options
    });
    if (!choice) return;

    if (choice === 'local') {
        await backupDataLocal(filename, data);
        return;
    }

    deps.showToast('A guardar backup…');
    const local = await writeSilentLocalBackup(JSON.stringify(buildFullBackupObject()));
    const cloudRes = await uploadCloudBackup(JSON.stringify(buildFullBackupObject()));
    await downloadJsonFile(filename, data, 'Arquivo da rota pronto para partilhar');

    const patch = {
        lastDismissAt: Date.now(),
        lastAutoAt: Date.now(),
        deliveriesSinceBackup: 0,
        dayKey: todayBackupDayKey()
    };
    if (local.ok) patch.lastBackupAt = Date.now();
    if (cloudRes.ok) {
        patch.lastCloudAt = Date.now();
        patch.lastCloudOk = true;
        patch.lastCloudError = '';
        if (!local.ok) patch.lastBackupAt = Date.now();
        deps.showToast('Backup na nuvem concluído' + (local.ok ? ' (e neste aparelho)' : ''));
    } else if (cloudRes.error === 'offline') {
        patch.lastCloudOk = false;
        patch.lastCloudError = 'offline';
        deps.showToast(local.ok
            ? 'Salvo neste aparelho. Sem internet para a nuvem'
            : 'Sem internet para enviar à nuvem', !local.ok);
    } else {
        patch.lastCloudOk = false;
        patch.lastCloudError = cloudRes.error || 'falha';
        if (local.ok) {
            deps.showToast('Salvo neste aparelho. Nuvem indisponível (verifique o Firebase)');
        } else {
            const shared = await downloadJsonFile(filename, data, 'Salve o JSON manualmente');
            if (shared) patch.lastBackupAt = Date.now();
            deps.showToast('Nuvem indisponível. Use o arquivo JSON se foi partilhado', true);
        }
    }
    writeBackupMeta(patch);
    hideBackupReminder();
}

export async function restoreFromJson(rawJson) {
    try {
        const parsed = parseBackupPayload(typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson);
        if (!parsed.ok) throw new Error(parsed.error);
        const data = parsed.data;
        const count = Array.isArray(data.deliveries) ? data.deliveries.length : 0;
        const ok = await deps.showConfirmModal({
            title: 'Carregar rota recebida',
            message: `Deseja abrir esta rota (${count} parada${count === 1 ? '' : 's'}) no RotaFlow Pro agora? A rota atual será substituída.`,
            confirmText: 'Abrir rota',
            danger: false
        });
        if (!ok) return false;
        deps.showToast('A restaurar fotos da rota…');
        const photosRestored = await restorePhotoBlobsIntoIdb(data);
        if (data.agenda && data.agenda.length) {
            deps.setAgenda(data.agenda);
            deps.setNextAgendaId(data.nextAgendaId || 1);
        }
        if (data.userProfile) deps.setUserProfile(data.userProfile);
        deps.hydrateRoutesFromData(data);
        deps.getAgenda().forEach((a) => {
            deps.migrateTelefones(a);
            deps.migrateFavorito(a);
            if (a.pacotes === undefined) a.pacotes = 1;
            if (!a.photos) a.photos = [];
            if (!a.photoIds) a.photoIds = [];
            if (a.notes === undefined) a.notes = '';
            deps.normalizeDeliveryCoords(a);
        });
        deps.seedIdCounter();
        deps.clearRouteOverlay();
        await deps.hydrateAllPhotos();
        deps.persistStorageNow();
        deps.renderDeliveriesList();
        deps.renderRouteSwitcher();
        deps.renderAgendaList();
        deps.rebuildMarkers(false);
        deps.updateDeliveryStats();
        deps.updateOptimizeFabVisibility();
        deps.updateLastIdDisplay(deps.getDeliveries().length ? deps.getDeliveries()[deps.getDeliveries().length - 1].sequentialId : null);
        deps.showToast(
            photosRestored
                ? `Rota carregada (${photosRestored} foto${photosRestored === 1 ? '' : 's'})`
                : 'Rota carregada com sucesso!'
        );
        return true;
    } catch (err) {
        deps.showToast('Não foi possível carregar a rota. Arquivo inválido', true);
        return false;
    }
}

export function restoreData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        await restoreFromJson(e.target.result);
    };
    reader.readAsText(file);
}

export function bindBackupButtons() {
    document.getElementById('backupBtn')?.addEventListener('click', backupData);
    document.getElementById('restoreBtn')?.addEventListener('click', () => document.getElementById('importFileInput')?.click());
    document.getElementById('importFileInput')?.addEventListener('change', (e) => {
        if (e.target.files.length) {
            restoreData(e.target.files[0]);
            e.target.value = '';
        }
    });
    document.getElementById('backupAgendaBtn')?.addEventListener('click', backupAgenda);
    document.getElementById('restoreAgendaBtn')?.addEventListener('click', () => document.getElementById('restoreAgendaInput')?.click());
    document.getElementById('restoreAgendaInput')?.addEventListener('change', (e) => {
        if (e.target.files.length) {
            restoreAgenda(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Escuta evento nativo disparado pelo Android ao clicar num arquivo .rfpro
    window.addEventListener('rotaflow:openBackup', (e) => {
        if (e && e.detail) {
            restoreFromJson(e.detail).catch(() => {});
        }
    });
}
