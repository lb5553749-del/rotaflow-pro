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
    attachAgendaEvents();
    document.querySelectorAll('.agenda-photo').forEach((img) => {
        img.addEventListener('click', async (e) => {
            e.stopPropagation();
            const found = deps.getAgenda().find((a) => a.agendaId === parseInt(img.dataset.agendaId, 10));
            if (!found) return;
            await ensureItemPhotos(found);
            if (found.photos && found.photos.length) openGallery(found.photos, 0);
        });
    });
}

function attachAgendaEvents() {
    document.querySelectorAll('#agendaList .overflow-trigger').forEach((btn) => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wrap = btn.closest('.overflow-wrap');
            const wasOpen = wrap && wrap.classList.contains('open');
            deps.closeAllOverflowMenus();
            if (wrap && !wasOpen) deps.openOverflowWrap(wrap);
        };
    });
    document.querySelectorAll('.add-agenda').forEach((btn) => {
        btn.onclick = () => {
            deps.closeAllOverflowMenus();
            const id = parseInt(btn.dataset.id, 10);
            const item = deps.getAgenda().find((i) => i.agendaId === id);
            if (item) deps.addAgendaToRoute(item);
        };
    });
    document.querySelectorAll('.remove-agenda').forEach((btn) => {
        btn.onclick = async () => {
            deps.closeAllOverflowMenus();
            const id = parseInt(btn.dataset.id, 10);
            const item = deps.getAgenda().find((i) => i.agendaId === id);
            if (!item) return;
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
        };
    });
    document.querySelectorAll('.edit-agenda').forEach((btn) => {
        btn.onclick = async () => {
            deps.closeAllOverflowMenus();
            const id = parseInt(btn.dataset.id, 10);
            const item = deps.getAgenda().find((i) => i.agendaId === id);
            if (item) {
                await ensureItemPhotos(item);
                deps.showEditAgendaModal(item, (updated) => deps.editAgendaItem(id, updated));
            }
        };
    });
    document.querySelectorAll('.agenda-take-photo').forEach((btn) => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            const item = deps.getAgenda().find((i) => i.agendaId === id);
            if (!item) return;
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
        };
    });
    document.querySelectorAll('.agenda-pick-photo').forEach((btn) => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            const item = deps.getAgenda().find((i) => i.agendaId === id);
            if (!item) return;
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
        };
    });
}
