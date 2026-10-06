/**
 * Ponte agenda ↔ rota: adicionar à rota, salvar/copiar para agenda, sync e fotos.
 * Estado e side-effects via configureAgendaRoute().
 */
import { getSequentialId } from '../../lib/ids.js';
import { hasMapCoords } from '../../lib/routing-helpers.js';
import { findActiveDeliveryByAddress } from '../../lib/list-helpers.js';
import { PORTO_VELHO_CENTER } from './map-layer.js';

let deps = {
    getAgenda: () => [],
    pushAgendaItem: () => {},
    getNextAgendaId: () => 1,
    setNextAgendaId: () => {},
    getDeliveries: () => [],
    pushDelivery: () => {},
    getNextSequenceNumber: () => 1,
    setNextSequenceNumber: () => {},
    getGeocoder: () => null,
    newId: () => 0,
    showToast: () => {},
    persistStorageNow: () => {},
    saveStorage: () => {},
    renderDeliveriesList: () => {},
    renderAgendaList: () => {},
    upsertMarker: () => {},
    updateLastIdDisplay: () => {},
    clearRouteOverlay: () => {},
    updateProgressAndEstimates: () => {},
    ensureItemPhotos: async () => {},
    idbGetPhoto: async () => null,
    persistPhotoDataUrl: async () => '',
    deliveryPhotoCount: () => 0
};

export function configureAgendaRoute(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function findActiveRouteByAddress(endereco) {
    return findActiveDeliveryByAddress(deps.getDeliveries(), endereco);
}

export function findAgendaItemForDelivery(delivery) {
    if (!delivery || !delivery.endereco) return null;
    const key = String(delivery.endereco).toLowerCase();
    return deps.getAgenda().find(item => String(item.endereco || '').toLowerCase() === key) || null;
}

export function syncFavoritoToAgenda(delivery) {
    const agendaItem = findAgendaItemForDelivery(delivery);
    if (agendaItem && agendaItem.favorito !== delivery.favorito) {
        agendaItem.favorito = delivery.favorito;
        deps.saveStorage();
        deps.renderAgendaList();
        return true;
    }
    return false;
}

export function syncAgendaByDelivery(delivery) {
    const agendaItem = findAgendaItemForDelivery(delivery);
    if (agendaItem) {
        let changed = false;
        const str1 = JSON.stringify(delivery.telefones || []);
        const str2 = JSON.stringify(agendaItem.telefones || []);
        if (str1 !== str2) {
            agendaItem.telefones = delivery.telefones || [];
            changed = true;
        }
        if (agendaItem.favorito !== delivery.favorito) {
            agendaItem.favorito = delivery.favorito;
            changed = true;
        }
        if (changed) {
            deps.saveStorage();
            deps.renderAgendaList();
            deps.showToast("Agenda atualizada");
        }
    }
}

export function addAgendaToRoute(item) {
    const already = findActiveRouteByAddress(item.endereco);
    if (already) {
        deps.showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
        return;
    }

    const finish = async (lat, lng) => {
        // Cópia própria das fotos — apagar na rota não apaga na agenda.
        const cloned = await cloneItemPhotosForCopy(item);
        const seqId = getSequentialId(deps.getNextSequenceNumber());
        deps.pushDelivery({
            id: deps.newId(),
            sequentialId: seqId,
            nome: item.nome,
            endereco: item.endereco,
            telefones: item.telefones || [],
            pacotes: item.pacotes || 1,
            status: "pendente",
            lat,
            lng,
            savedToAgenda: true,
            photos: cloned.photos,
            photoIds: cloned.photoIds,
            notes: item.notes || '',
            favorito: item.favorito || false
        });
        deps.setNextSequenceNumber(deps.getNextSequenceNumber() + 1);
        deps.persistStorageNow();
        deps.renderDeliveriesList();
        deps.renderAgendaList();
        const deliveries = deps.getDeliveries();
        deps.upsertMarker(deliveries[deliveries.length - 1]);
        deps.updateLastIdDisplay(seqId);
        deps.clearRouteOverlay();
        deps.updateProgressAndEstimates();
        deps.showToast(`${item.nome} adicionado à rota (ID ${seqId})`);
    };

    if (hasMapCoords(item)) {
        finish(Number(item.lat), Number(item.lng));
        return;
    }
    if (!deps.getGeocoder()) {
        deps.showToast("Aguarde o mapa carregar completamente", true);
        return;
    }
    deps.showToast("Localizando endereço…");
    deps.getGeocoder().geocode({ address: item.endereco }, (res, stat) => {
        let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
        if (stat === "OK" && res[0]) {
            lat = res[0].geometry.location.lat();
            lng = res[0].geometry.location.lng();
            item.lat = lat;
            item.lng = lng;
            deps.saveStorage();
        } else {
            deps.showToast("Endereço sem coordenadas precisas. Usando o centro do mapa", true);
        }
        finish(lat, lng);
    });
}

export async function cloneItemPhotosForCopy(src) {
    await deps.ensureItemPhotos(src);
    const photos = [];
    const photoIds = [];
    const urls = Array.isArray(src.photos) ? src.photos : [];
    const ids = Array.isArray(src.photoIds) ? src.photoIds : [];
    const n = Math.max(urls.length, ids.length);
    for (let i = 0; i < n; i++) {
        let dataUrl = urls[i];
        if (!dataUrl && ids[i]) {
            try { dataUrl = await deps.idbGetPhoto(ids[i]); } catch (_) { dataUrl = null; }
        }
        if (!dataUrl || typeof dataUrl !== 'string') continue;
        try {
            const newId = await deps.persistPhotoDataUrl(dataUrl);
            photos.push(dataUrl);
            photoIds.push(newId);
        } catch (_) {}
    }
    return { photos, photoIds };
}

export async function saveToAgenda(del, fromCard = false) {
    const duplicate = findAgendaItemForDelivery(del);
    if (duplicate) {
        deps.showToast(`O endereço "${del.endereco}" já existe na agenda`, true);
        return false;
    }
    // Cópia própria no IndexedDB — agenda e entrega não partilham o mesmo photoId.
    const cloned = await cloneItemPhotosForCopy(del);
    deps.pushAgendaItem({ 
        agendaId: deps.getNextAgendaId(), 
        nome: del.nome, 
        endereco: del.endereco, 
        telefones: del.telefones || [], 
        pacotes: del.pacotes, 
        lat: del.lat, 
        lng: del.lng, 
        photos: cloned.photos,
        photoIds: cloned.photoIds,
        notes: del.notes || '',
        favorito: del.favorito || false
    });
    deps.setNextAgendaId(deps.getNextAgendaId() + 1);
    if (!del.savedToAgenda) { del.savedToAgenda = true; deps.saveStorage(); deps.renderDeliveriesList(); }
    deps.saveStorage(); deps.renderAgendaList();
    deps.showToast(`"${del.nome}" salvo na agenda`);
    return true;
}

export async function copyFromOtherRoute() {
    const deliveries = deps.getDeliveries();
    if (deliveries.length === 0) return deps.showToast("Não há entregas na rota para copiar", true);
    let count = 0;
    for (const del of deliveries) {
        if (await saveToAgenda(del, false)) count++;
    }
    deps.showToast(`${count} parada${count === 1 ? "" : "s"} adicionada${count === 1 ? "" : "s"} à agenda`);
}

export async function copyDeliveryPhotoIndexToAgenda(agendaItem, delivery, idx) {
    await deps.ensureItemPhotos(delivery);
    await deps.ensureItemPhotos(agendaItem);
    if (!Array.isArray(delivery.photos) || !delivery.photos[idx]) {
        return { added: false, reason: 'missing' };
    }
    if (!Array.isArray(agendaItem.photos)) agendaItem.photos = [];
    if (!Array.isArray(agendaItem.photoIds)) agendaItem.photoIds = [];

    const srcId = Array.isArray(delivery.photoIds) ? delivery.photoIds[idx] : null;
    if (srcId && agendaItem.photoIds.includes(srcId)) {
        return { added: false, reason: 'dup' };
    }

    const dataUrl = delivery.photos[idx];
    // Nova cópia no IndexedDB para a agenda não depender da foto da entrega.
    const newId = await deps.persistPhotoDataUrl(dataUrl);
    agendaItem.photos.push(dataUrl);
    agendaItem.photoIds.push(newId);
    return { added: true, photoId: newId };
}

/**
 * Salva foto da entrega no cliente correspondente da agenda (match por endereço).
 * @param {object} delivery
 * @param {number|null} photoIndex índice específico; null = última foto
 */
export async function saveDeliveryPhotoToAgenda(delivery, photoIndex = null) {
    if (!delivery) {
        deps.showToast('Selecione uma entrega no mapa', true);
        return false;
    }
    await deps.ensureItemPhotos(delivery);
    const count = deps.deliveryPhotoCount(delivery);
    if (!count) {
        deps.showToast('Nenhuma foto nesta entrega', true);
        return false;
    }

    const agendaItem = findAgendaItemForDelivery(delivery);
    if (!agendaItem) {
        // Fluxo existente: cria o cliente na agenda com as fotos da entrega.
        return !!(await saveToAgenda(delivery, true));
    }

    const idx = photoIndex == null ? (delivery.photos.length - 1) : photoIndex;
    if (idx < 0 || idx >= delivery.photos.length) {
        deps.showToast('Foto não encontrada', true);
        return false;
    }

    const result = await copyDeliveryPhotoIndexToAgenda(agendaItem, delivery, idx);
    if (!result.added) {
        deps.showToast(result.reason === 'dup' ? 'Esta foto já está na agenda' : 'Não foi possível salvar a foto', true);
        return false;
    }

    if (!delivery.savedToAgenda) delivery.savedToAgenda = true;
    deps.saveStorage();
    deps.renderAgendaList();
    deps.renderDeliveriesList();
    deps.showToast('Foto salva na agenda');
    return true;
}
