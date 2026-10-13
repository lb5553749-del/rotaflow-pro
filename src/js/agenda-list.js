/**
 * Lista da agenda — render + eventos (add/remove/edit/fotos).
 * Helpers puros em lib/list-helpers.js; main injeta estado via configureAgendaList().
 */
import {
    filterItemsByTextQuery,
    buildAgendaListItemHtml,
    emptyListStateHtml,
    findActiveDeliveryByAddress
} from '../../lib/list-helpers.js';
import { PHOTO_MAX_PER_ITEM } from './photo-store.js';
import {
    remainingPhotoSlots,
    addPhotoDataUrlToItem,
    ensureItemPhotos
} from './item-photos.js';
import { pickPhotoDataUrls } from './camera.js';
import { openGallery } from './gallery.js';

let deps = {
    getAgenda: () => [],
    setAgenda: () => {},
    getAgendaFilter: () => '',
    getDeliveries: () => [],
    closeAllOverflowMenus: () => {},
    openOverflowWrap: () => {},
    addAgendaToRoute: () => {},
    showConfirmModal: async () => false,
    saveStorage: () => {},
    persistStorageNow: () => false,
    showToast: () => {},
    showEditAgendaModal: () => {},
    editAgendaItem: () => {}
};

let agendaListDelegationReady = false;

export function configureAgendaList(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function renderAgendaList() {
    const container = document.getElementById('agendaList');
    if (!container) return;
    const agenda = deps.getAgenda();
    const filtered = filterItemsByTextQuery(agenda, deps.getAgendaFilter());
    if (filtered.length === 0) {
        container.innerHTML = emptyListStateHtml('agenda', !!deps.getAgendaFilter());
        return;
    }
    const deliveries = deps.getDeliveries();
    let html = '';
    filtered.forEach((item) => {
        html += buildAgendaListItemHtml(item, {
            onRoute: findActiveDeliveryByAddress(deliveries, item.endereco)
        });
    });
    container.innerHTML = html;
    ensureAgendaListDelegation(container);
}

/**
 * Um listener por container em vez de um listener por botão por item.
 * Com 200 paradas na agenda, anexar ~6 handlers por item a cada render (e a cada
 * tecla da busca, que é debounced mas re-renderiza) chega a travar a lista.
 */
function ensureAgendaListDelegation(container) {
    if (agendaListDelegationReady || !container) return;
    agendaListDelegationReady = true;

    container.addEventListener('click', async (e) => {
        const photoImg = e.target.closest('.agenda-photo');
        if (photoImg) {
            e.stopPropagation();
            const found = deps.getAgenda().find((a) => a.agendaId === parseInt(photoImg.dataset.agendaId, 10));
            if (!found) return;
            await ensureItemPhotos(found);
            if (found.photos && found.photos.length) openGallery(found.photos, 0);
            return;
        }

        const actionEl = e.target.closest('[data-id]');
        if (!actionEl) return;
        const id = parseInt(actionEl.dataset.id, 10);
        if (!Number.isFinite(id)) return;
        const item = deps.getAgenda().find((i) => i.agendaId === id);
        if (!item) return;

        if (actionEl.classList.contains('overflow-trigger')) {
            e.preventDefault();
            e.stopPropagation();
            const wrap = actionEl.closest('.overflow-wrap');
            const wasOpen = wrap && wrap.classList.contains('open');
            deps.closeAllOverflowMenus();
            if (wrap && !wasOpen) deps.openOverflowWrap(wrap);
            return;
        }

        if (actionEl.classList.contains('add-agenda')) {
            deps.closeAllOverflowMenus();
            deps.addAgendaToRoute(item);
            return;
        }

        if (actionEl.classList.contains('remove-agenda')) {
            e.preventDefault();
            e.stopPropagation();
            deps.closeAllOverflowMenus();
            const ok = await deps.showConfirmModal({
                title: 'Remover da agenda',
                message: `Deseja remover "${item.nome}" da agenda de paradas?`,
                confirmText: 'Remover',
                danger: true
            });
            if (!ok) return;
            deps.setAgenda(deps.getAgenda().filter((i) => i.agendaId !== id));
            deps.saveStorage();
            renderAgendaList();
            deps.showToast('Parada removida da agenda');
            return;
        }

        if (actionEl.classList.contains('edit-agenda')) {
            e.preventDefault();
            e.stopPropagation();
            deps.closeAllOverflowMenus();
            await ensureItemPhotos(item);
            deps.showEditAgendaModal(item, (updated) => deps.editAgendaItem(id, updated));
            return;
        }

        if (actionEl.classList.contains('agenda-take-photo')) {
            e.stopPropagation();
            await takeAgendaPhoto(item);
            return;
        }

        if (actionEl.classList.contains('agenda-pick-photo')) {
            e.stopPropagation();
            await pickAgendaPhoto(item);
            return;
        }
    });
}

async function takeAgendaPhoto(item) {
    const slots = remainingPhotoSlots(item);
    if (slots <= 0) {
        deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
        return;
    }
    const cameraInput = document.getElementById('agendaCameraInput');
    let savedIncremental = 0;
    const urls = await pickPhotoDataUrls('camera', {
        fileInput: cameraInput,
        maxPhotos: slots,
        pendingTarget: { kind: 'agenda', agendaId: item.agendaId },
        onPhoto: async (dataUrl, n, total) => {
            const photoId = await addPhotoDataUrlToItem(item, dataUrl);
            if (!photoId) return;
            savedIncremental += 1;
            deps.persistStorageNow();
            if (total && total > 1) deps.showToast(`A guardar fotos… ${n}/${total}`);
        }
    });
    let batchSaved = 0;
    if (urls.length) {
        for (const url of urls) {
            try {
                const photoId = await addPhotoDataUrlToItem(item, url);
                if (photoId) {
                    batchSaved += 1;
                    deps.persistStorageNow();
                }
            } catch (err) {
                if (String(err?.message || err) === 'photo-limit') {
                    deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
                    break;
                }
            }
        }
    }
    const totalSaved = savedIncremental + batchSaved;
    if (totalSaved > 0) {
        renderAgendaList();
        deps.showToast(totalSaved > 1 ? `${totalSaved} fotos salvas na agenda` : 'Foto salva na agenda');
    }
}

async function pickAgendaPhoto(item) {
    const slots = remainingPhotoSlots(item);
    if (slots <= 0) {
        deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
        return;
    }
    const galleryInput = document.getElementById('agendaGalleryInput');
    const urls = await pickPhotoDataUrls('gallery', {
        fileInput: galleryInput,
        multiple: true,
        maxPhotos: slots,
        pendingTarget: { kind: 'agenda', agendaId: item.agendaId }
    });
    if (!urls.length) return;
    try {
        for (const url of urls) await addPhotoDataUrlToItem(item, url);
        deps.persistStorageNow();
        renderAgendaList();
        deps.showToast(urls.length > 1 ? `${urls.length} fotos salvas na agenda` : 'Foto salva na agenda');
    } catch (err) {
        if (String(err?.message || err) === 'photo-limit') {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
        } else {
            deps.showToast('Não foi possível salvar a foto', true);
        }
    }
}
