/**
 * Persistência de fotos no item — add / hydrate / restore / prune / migrate.
 * Reutiliza photo-store (IndexedDB) + lib/photo-helpers; não duplica schema.
 * main.js injeta estado (rotas, agenda, UI) via configureItemPhotos().
 */
import {
    photoFingerprint,
    itemPhotoScope,
    remainingPhotoSlots as remainingPhotoSlotsFor,
    slicePhotoIdsForHydrate,
    collectKeepPhotoIds,
    DEFAULT_FINISHED_PHOTO_TTL_DAYS,
    isDuplicatePhotoSaveInMap,
    markPhotoSavedInMap,
    itemNeedsPhotoHydrate,
    hasLegacyDataUrlPhotos
} from '../../lib/photo-helpers.js';
import {
    PHOTO_MAX_PER_ITEM,
    newPhotoId,
    revokePhotoObjectUrl,
    revokeDisplayUrl,
    idbPutPhoto,
    idbGetPhoto,
    enqueuePhotoOp,
    clearPendingPhotoTarget,
    getPendingPhotoTarget,
    yieldToUiFrame,
    compressDataUrl,
    purgeStalePhotos,
    schedulePhotoHousekeeping
} from './photo-store.js';

let deps = {
    currentUid: () => 'guest',
    getRoutes: () => [],
    getAgenda: () => [],
    getDeliveries: () => [],
    getActiveRouteId: () => null,
    getRouteHistory: () => [],
    syncActiveRouteIntoRoutes: () => {},
    persistStorageNow: () => false,
    getCurrentSelectedDelivery: () => null,
    refreshPanelPhotos: () => {},
    renderDeliveriesList: () => {},
    renderAgendaList: () => {},
    showToast: () => {}
};

const recentPhotoSaveKeys = new Map();
const inflightPhotoSaves = new Set();
let photoMigrateQueued = false;
let listPhotoHydrateTimer = null;

export function configureItemPhotos(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function remainingPhotoSlots(item) {
    return remainingPhotoSlotsFor(item, PHOTO_MAX_PER_ITEM);
}

export function isDuplicatePhotoSave(scopeKey, dataUrl) {
    return isDuplicatePhotoSaveInMap(recentPhotoSaveKeys, scopeKey, dataUrl);
}

export function markPhotoSaved(scopeKey, dataUrl) {
    return markPhotoSavedInMap(recentPhotoSaveKeys, scopeKey, dataUrl);
}

/**
 * Housekeeping IndexedDB: remove fotos órfãs e fotos só referenciadas por
 * histórico/rotas finalizadas além do TTL (default 30 dias; configurável).
 */
export async function pruneOrphanPhotos(ttlDays = DEFAULT_FINISHED_PHOTO_TTL_DAYS) {
    const uid = deps.currentUid();
    if (!uid) return 0;
    deps.syncActiveRouteIntoRoutes();
    const keepPhotoIds = collectKeepPhotoIds({
        routes: deps.getRoutes(),
        agenda: deps.getAgenda(),
        history: deps.getRouteHistory(),
        ttlDays
    });
    return purgeStalePhotos({ uid, keepPhotoIds });
}

export function scheduleOrphanPhotoPrune() {
    schedulePhotoHousekeeping(() => {
        pruneOrphanPhotos().catch(() => {});
    });
}

export async function persistPhotoDataUrl(dataUrl) {
    const id = newPhotoId();
    // Grava Blob no IDB (não data URL) — menos pressão de memória no WebView.
    await idbPutPhoto(id, dataUrl);
    return id;
}

export async function addPhotoDataUrlToItem(item, dataUrl) {
    if (!item || !dataUrl) return null;
    if (!Array.isArray(item.photos)) item.photos = [];
    if (!Array.isArray(item.photoIds)) item.photoIds = [];
    if (item.photoIds.length >= PHOTO_MAX_PER_ITEM) {
        throw new Error('photo-limit');
    }
    const scope = itemPhotoScope(item);
    const fp = photoFingerprint(dataUrl);
    const lockKey = `${scope}::${fp}`;
    if (inflightPhotoSaves.has(lockKey) || isDuplicatePhotoSave(scope, dataUrl)) return null;
    if (item.photos.includes(dataUrl)) return null;
    if (fp && item.photos.some((p) => photoFingerprint(p) === fp)) return null;

    inflightPhotoSaves.add(lockKey);
    try {
        const photoId = await persistPhotoDataUrl(dataUrl);
        // Se só havia thumb parcial, hidrata completo depois via ensureItemPhotos.
        if (item.photos.length && item.photoIds.length > item.photos.length) {
            for (const u of item.photos) revokeDisplayUrl(u);
            item.photos = [];
        }
        // Exibe via blob: (revogável) em vez de manter data URL gigante na RAM.
        let display = await idbGetPhoto(photoId);
        if (!display) display = dataUrl;
        item.photos.push(display);
        item.photoIds.push(photoId);
        markPhotoSaved(scope, dataUrl);
        return photoId;
    } finally {
        inflightPhotoSaves.delete(lockKey);
    }
}

/**
 * @param {object} item
 * @param {{ maxPhotos?: number }} [opts] maxPhotos=1 para thumbs da lista (economiza RAM)
 */
export async function hydrateItemPhotos(item, opts = {}) {
    if (!item) return item;
    if (!Array.isArray(item.photoIds)) item.photoIds = [];
    if (!Array.isArray(item.photos)) item.photos = [];
    const maxPhotos = Number.isFinite(opts.maxPhotos) ? Math.max(0, opts.maxPhotos) : null;

    // Migração legado: data URLs sem photoIds → IndexedDB (só ids vão para localStorage).
    if (!item.photoIds.length && item.photos.some((p) => typeof p === 'string' && p.startsWith('data:'))) {
        const ids = [];
        const urls = [];
        for (const p of item.photos) {
            if (typeof p === 'string' && p.startsWith('data:')) {
                ids.push(await persistPhotoDataUrl(p));
                urls.push(p);
            }
        }
        item.photoIds = ids;
        item.photos = maxPhotos != null ? urls.slice(0, maxPhotos) : urls;
        return item;
    }

    const idsAll = slicePhotoIdsForHydrate(item.photoIds, maxPhotos);
    const want = idsAll.length;
    if (want > 0 && item.photos.length < want) {
        for (const u of item.photos) revokeDisplayUrl(u);
        const urls = [];
        for (const id of idsAll) {
            const url = await idbGetPhoto(id);
            if (url) urls.push(url);
            await yieldToUiFrame();
        }
        item.photos = urls;
    }
    return item;
}

/** Não hidrata tudo de uma vez — só migração legado / uso pontual. */
export async function hydrateAllPhotos() {
    // Preferir hydrate sob demanda (painel / thumbs). Migração idle cobre data URLs legadas.
    scheduleBackgroundPhotoMigrate();
    scheduleListPhotoHydration();
}

export async function ensureItemPhotos(item) {
    if (!item) return item;
    try {
        if (!Array.isArray(item.photoIds)) item.photoIds = [];
        if (!Array.isArray(item.photos)) item.photos = [];
        if (itemNeedsPhotoHydrate(item)) {
            await hydrateItemPhotos(item);
        }
        if (!item.photos) item.photos = [];
    } catch (e) {
        console.warn('ensureItemPhotos', e);
        if (!item.photos) item.photos = [];
        if (!item.photoIds) item.photoIds = [];
    }
    return item;
}

export async function applyRestoredCameraPhoto(photoData) {
    const pending = getPendingPhotoTarget();
    clearPendingPhotoTarget();
    if (!pending || !photoData) return false;
    let dataUrl = null;
    try {
        if (window.RotaFlowCap && typeof window.RotaFlowCap.photoResultToDataUrl === 'function') {
            dataUrl = await window.RotaFlowCap.photoResultToDataUrl(photoData);
        } else if (photoData.dataUrl) {
            dataUrl = await compressDataUrl(photoData.dataUrl);
        } else if (photoData.webPath) {
            dataUrl = await compressDataUrl(photoData.webPath);
        }
    } catch (e) {
        console.warn('restored photo compress', e);
        return false;
    }
    if (!dataUrl) return false;

    const deliveries = deps.getDeliveries();
    const agenda = deps.getAgenda();
    try {
        if (pending.kind === 'delivery' && pending.sequentialId != null) {
            const delivery = deliveries.find((d) => d.sequentialId === pending.sequentialId);
            if (!delivery) return false;
            await addPhotoDataUrlToItem(delivery, dataUrl);
            deps.persistStorageNow();
            const selected = deps.getCurrentSelectedDelivery();
            if (selected && selected.sequentialId === delivery.sequentialId) {
                deps.refreshPanelPhotos(delivery);
            }
            deps.renderDeliveriesList();
            deps.showToast('Foto recuperada após reinício do app');
            return true;
        }
        if (pending.kind === 'agenda' && pending.agendaId != null) {
            const item = agenda.find((a) => a.agendaId === pending.agendaId);
            if (!item) return false;
            await addPhotoDataUrlToItem(item, dataUrl);
            deps.persistStorageNow();
            deps.renderAgendaList();
            deps.showToast('Foto recuperada após reinício do app');
            return true;
        }
        if (pending.kind === 'edit-delivery' || pending.kind === 'edit-agenda') {
            // Modais de edição não sobrevivem ao kill — salva na entrega/agenda se possível.
            if (pending.sequentialId != null) {
                const delivery = deliveries.find((d) => d.sequentialId === pending.sequentialId);
                if (delivery) {
                    await addPhotoDataUrlToItem(delivery, dataUrl);
                    deps.persistStorageNow();
                    deps.renderDeliveriesList();
                    deps.showToast('Foto salva na entrega após reinício');
                    return true;
                }
            }
            if (pending.agendaId != null) {
                const item = agenda.find((a) => a.agendaId === pending.agendaId);
                if (item) {
                    await addPhotoDataUrlToItem(item, dataUrl);
                    deps.persistStorageNow();
                    deps.renderAgendaList();
                    deps.showToast('Foto salva na agenda após reinício');
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('applyRestoredCameraPhoto', e);
        deps.showToast('Não foi possível recuperar a foto', true);
    }
    return false;
}

export function scheduleBackgroundPhotoMigrate() {
    if (photoMigrateQueued) return;
    photoMigrateQueued = true;
    const run = async () => {
        try {
            const deliveries = deps.getDeliveries();
            // Só migra base64 legado → IndexedDB, sem forçar tudo na UI.
            for (const d of deliveries) {
                if (hasLegacyDataUrlPhotos(d)) {
                    await hydrateItemPhotos(d);
                }
            }
            deps.syncActiveRouteIntoRoutes();
            const routes = deps.getRoutes();
            const activeRouteId = deps.getActiveRouteId();
            for (const r of routes) {
                if (!r || r.id === activeRouteId) continue;
                for (const d of (r.deliveries || [])) {
                    if (hasLegacyDataUrlPhotos(d)) {
                        await hydrateItemPhotos(d);
                    }
                }
            }
            for (const a of deps.getAgenda()) {
                if (hasLegacyDataUrlPhotos(a)) {
                    await hydrateItemPhotos(a);
                }
            }
            deps.persistStorageNow();
        } catch (_) { /* ignore idle migrate errors */ }
        photoMigrateQueued = false;
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { run(); }, { timeout: 2500 });
    else setTimeout(run, 600);
}

export async function hydrateAgendaListPhotos() {
    let needsRender = false;
    for (const a of deps.getAgenda()) {
        const hasIds = Array.isArray(a.photoIds) && a.photoIds.length;
        const hasUrls = Array.isArray(a.photos) && a.photos.length;
        // Só a 1ª foto para thumb da lista — evita carregar dezenas de data URLs na RAM.
        if (hasIds && !hasUrls) {
            await hydrateItemPhotos(a, { maxPhotos: 1 });
            needsRender = true;
        }
    }
    if (needsRender) deps.renderAgendaList();
}

export function scheduleListPhotoHydration() {
    // Entregas: fotos sob demanda no painel. Agenda: hidrata thumbs (lista menor).
    clearTimeout(listPhotoHydrateTimer);
    listPhotoHydrateTimer = setTimeout(() => {
        hydrateAgendaListPhotos().catch(() => {});
    }, 350);
}

/** Descarta URLs em RAM (mantém photoIds no IndexedDB; revoga blob:). */
export function releaseInMemoryPhotosExcept(keepDeliveryId) {
    const clear = (item) => {
        if (!item || !Array.isArray(item.photos) || !item.photos.length) return;
        for (const u of item.photos) revokeDisplayUrl(u);
        const ids = Array.isArray(item.photoIds) ? item.photoIds : [];
        for (const id of ids) revokePhotoObjectUrl(id);
        item.photos = [];
    };
    for (const d of deps.getDeliveries()) {
        if (keepDeliveryId != null && d.id === keepDeliveryId) continue;
        clear(d);
    }
    const agenda = deps.getAgenda();
    // Agenda thumbs: limpa se lista grande.
    if (agenda && agenda.length > 40) {
        for (const a of agenda) clear(a);
    }
}

export { enqueuePhotoOp, PHOTO_MAX_PER_ITEM, itemPhotoScope, photoFingerprint };
