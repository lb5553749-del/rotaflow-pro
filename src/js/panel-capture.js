/**
 * Captura de fotos no painel da entrega (câmera/galeria + save incremental).
 */
import { PHOTO_MAX_PER_ITEM } from './photo-store.js';

let deps = {
    getCurrentSelectedDelivery: () => null,
    showToast: () => {},
    remainingPhotoSlots: () => 0,
    pickPhotoDataUrls: async () => [],
    addPhotoDataUrlToItem: async () => null,
    persistStorageNow: () => {},
    refreshPanelPhotos: () => {},
    showOptimisticPanelPhoto: () => null,
    updatePanelMiniPhotoUi: () => {},
    renderDeliveriesList: () => {},
    saveDeliveryPhotoToAgenda: async () => false
};

export function configurePanelCapture(opts) {
    deps = { ...deps, ...(opts || {}) };
}

/** Atualiza só a lista de entregas depois (badge de fotos) sem travar o thumb. */
export function scheduleDeliveriesListPhotoRefresh() {
    const run = () => deps.renderDeliveriesList();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 700 });
    else setTimeout(run, 120);
}

export async function addPhotoDataUrlsToDelivery(delivery, dataUrls, opts = {}) {
    if (!delivery || !dataUrls || !dataUrls.length) return 0;
    const { hadOptimistic = false, silent = false } = opts;
    let saved = 0;
    try {
        for (const dataUrl of dataUrls) {
            const id = await deps.addPhotoDataUrlToItem(delivery, dataUrl);
            if (!id) continue; // duplicata (onPhoto + lote / 2º shutter)
            saved += 1;
            // Persistência por foto: sobrevive a kill/troca de cliente a meio do lote.
            deps.persistStorageNow();
            deps.refreshPanelPhotos(delivery);
        }
        if (saved) {
            scheduleDeliveriesListPhotoRefresh();
            if (!silent) {
                deps.showToast(saved > 1 ? `${saved} fotos salvas nesta entrega` : 'Foto salva nesta entrega');
            }
        } else if (hadOptimistic && !silent) {
            deps.refreshPanelPhotos(delivery);
        }
        return saved;
    } catch (e) {
        if (hadOptimistic || saved) deps.refreshPanelPhotos(delivery);
        if (saved) {
            scheduleDeliveriesListPhotoRefresh();
            if (!silent) deps.showToast(`${saved} foto(s) salvas; algumas falharam`, true);
            return saved;
        }
        if (String(e?.message || e) === 'photo-limit') {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
        } else if (!silent) {
            deps.showToast('Não foi possível adicionar a foto', true);
        }
        return saved;
    }
}

export async function capturePhotoForSelectedDelivery(mode = 'camera') {
    const delivery = deps.getCurrentSelectedDelivery();
    if (!delivery) {
        deps.showToast('Selecione uma entrega no mapa', true);
        return;
    }
    const slots = deps.remainingPhotoSlots(delivery);
    if (slots <= 0) {
        deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
        return;
    }
    const cameraInput = document.getElementById('panelCameraInput');
    const galleryInput = document.getElementById('panelGalleryInput');
    const fileInput = mode === 'gallery' ? galleryInput : cameraInput;
    let optimisticEl = null;
    let optimisticUrl = null;
    let savedIncremental = 0;
    let lastErr = null;
    const urls = await deps.pickPhotoDataUrls(mode, {
        fileInput,
        multiple: mode === 'gallery',
        maxPhotos: slots,
        pendingTarget: { kind: 'delivery', sequentialId: delivery.sequentialId },
        onPreview: (previewUrl) => {
            if (!previewUrl || optimisticEl) return;
            optimisticUrl = previewUrl;
            optimisticEl = deps.showOptimisticPanelPhoto(delivery, previewUrl);
        },
        onPhoto: async (dataUrl, n, total) => {
            try {
                const id = await deps.addPhotoDataUrlToItem(delivery, dataUrl);
                if (!id) return; // já gravada (dedupe)
                savedIncremental += 1;
                deps.persistStorageNow();
                if (optimisticEl) {
                    try { optimisticEl.remove(); } catch (_) {}
                    optimisticEl = null;
                }
                deps.refreshPanelPhotos(delivery);
                if (total && total > 1) {
                    deps.showToast(`A guardar fotos… ${n}/${total}`);
                }
            } catch (e) {
                lastErr = e;
                if (String(e?.message || e) === 'photo-limit') throw e;
                console.warn('incremental photo save', e);
            }
        }
    });
    // Segurança: lote final com dedupe — cobre corrida onPhoto vs Concluir e caminhos sem onPhoto.
    let batchSaved = 0;
    if (urls.length) {
        batchSaved = await addPhotoDataUrlsToDelivery(delivery, urls, {
            hadOptimistic: !!optimisticEl,
            silent: savedIncremental > 0
        }) || 0;
    }
    const totalSaved = savedIncremental + batchSaved;
    if (totalSaved > 0) {
        scheduleDeliveriesListPhotoRefresh();
        if (savedIncremental > 0) {
            deps.showToast(totalSaved > 1 ? `${totalSaved} fotos salvas nesta entrega` : 'Foto salva nesta entrega');
        }
    } else if (optimisticEl) {
        optimisticEl.remove();
        deps.updatePanelMiniPhotoUi(delivery);
        if (lastErr && String(lastErr?.message || lastErr) === 'photo-limit') {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
        }
    }
    if (optimisticUrl && String(optimisticUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(optimisticUrl); } catch (_) {}
    }
}

export function setupPanelPhotoCapture() {
    const cameraBtn = document.getElementById('panelCameraBtn');
    const galleryBtn = document.getElementById('panelGalleryBtn');
    const saveAgendaBtn = document.getElementById('panelSavePhotoAgendaBtn');
    if (!cameraBtn || cameraBtn.dataset.ready) return;
    cameraBtn.dataset.ready = '1';

    cameraBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await capturePhotoForSelectedDelivery('camera');
    });
    galleryBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await capturePhotoForSelectedDelivery('gallery');
    });
    if (saveAgendaBtn) {
        saveAgendaBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deps.saveDeliveryPhotoToAgenda(deps.getCurrentSelectedDelivery(), null);
        });
    }
}
