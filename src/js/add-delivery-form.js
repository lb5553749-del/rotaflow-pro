/**
 * Formulário "Nova entrega": limpeza, validação de duplicata, submit e addDeliveryDirect.
 * Estado de rota/agenda e geocoder vêm via configureAddDeliveryForm().
 */
import { getSequentialId } from '../../lib/ids.js';
import { PORTO_VELHO_CENTER } from './map-layer.js';
import {
    getTempPhones,
    setTempPhones,
    clearTempPhones,
    renderTempPhones
} from './form-phones.js';

let deps = {
    getAgenda: () => [],
    getDeliveries: () => [],
    getNextSequenceNumber: () => 1,
    setNextSequenceNumber: () => {},
    getNextAgendaId: () => 1,
    setNextAgendaId: () => {},
    pushDelivery: () => {},
    pushAgendaItem: () => {},
    findActiveRouteByAddress: () => null,
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
    centerMapOnMarkers: () => {}
};

export function configureAddDeliveryForm(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let duplicateCheckTimer = null;

export function clearForm() {
    document.getElementById("customerName").value = "";
    document.getElementById("address").value = "";
    document.getElementById("newPhoneInput").value = "";
    document.getElementById("newPhoneLabel").value = "";
    clearTempPhones();
    renderTempPhones();
    document.getElementById("pacotes").value = "1";
    document.getElementById("saveToAgendaCheckbox").checked = false;

    document.getElementById("nameSuggestions").style.display = 'none';
    document.getElementById('addressWarning').classList.remove('show');
    document.getElementById('address').classList.remove('duplicate');
}

export function checkAddressDuplicate() {
    const addressInput = document.getElementById('address');
    const warningDiv = document.getElementById('addressWarning');
    const warningText = document.getElementById('addressWarningText');
    const address = addressInput.value.trim().toLowerCase();
    if (!address) {
        warningDiv.classList.remove('show');
        addressInput.classList.remove('duplicate');
        return;
    }
    const found = deps.findActiveRouteByAddress(address);
    if (found) {
        warningText.textContent = `Este endereço já está na rota (ID ${found.sequentialId})`;
        warningDiv.classList.add('show');
        addressInput.classList.add('duplicate');
        warningDiv.onclick = () => {
            document.getElementById('customerName').value = found.nome;
            document.getElementById('address').value = found.endereco;
            setTempPhones(found.telefones || []);
            renderTempPhones();
            document.getElementById('pacotes').value = found.pacotes || 1;
            warningDiv.classList.remove('show');
            addressInput.classList.remove('duplicate');
            deps.showToast(`Dados da entrega ${found.sequentialId} preenchidos`);
        };
    } else {
        warningDiv.classList.remove('show');
        addressInput.classList.remove('duplicate');
        warningDiv.onclick = null;
    }
}

const geocodePrefetchCache = new Map();

export function prefetchGeocodeAddress(rawAddress) {
    const addr = (rawAddress || '').trim();
    if (addr.length < 4) return;
    const key = addr.toLowerCase();
    if (geocodePrefetchCache.has(key)) return;
    const geocoder = deps.getGeocoder();
    if (!geocoder) return;
    try {
        geocoder.geocode({ address: addr }, (res, stat) => {
            if (stat === "OK" && res && res[0] && res[0].geometry && res[0].geometry.location) {
                geocodePrefetchCache.set(key, {
                    lat: res[0].geometry.location.lat(),
                    lng: res[0].geometry.location.lng()
                });
            }
        });
    } catch (_) {}
}

export function setupAddressDuplicateCheck() {
    const addressInput = document.getElementById('address');
    if (addressInput) {
        addressInput.addEventListener('input', function() {
            clearTimeout(duplicateCheckTimer);
            duplicateCheckTimer = setTimeout(() => {
                checkAddressDuplicate();
                prefetchGeocodeAddress(addressInput.value);
            }, 300);
        });
    }
}

export function addDeliveryDirect(nome, endereco, telefones, pacotes, notes, extras) {
    if (!nome || !endereco) { deps.showToast("Preencha nome e endereço para continuar", true); return; }

    // Verifica se já está na rota (pendente / em rota)
    const already = deps.findActiveRouteByAddress(endereco);
    if (already) {
        deps.showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
        return;
    }

    // Permite adicionar mesmo que esteja na agenda (não verifica agenda)

    const agenda = deps.getAgenda();
    const known = agenda.find(a => a.endereco.toLowerCase() === endereco.toLowerCase());
    const _extra = extras || {};
    const finish = (lat, lng) => {
        const seqId = getSequentialId(deps.getNextSequenceNumber());
        const newDelivery = { 
            id: deps.newId(), 
            sequentialId: seqId, 
            nome, 
            endereco, 
            telefones: telefones || [], 
            pacotes, 
            status: "pendente", 
            lat, 
            lng, 
            savedToAgenda: !!known, 
            photos: known ? [...(known.photos || [])] : [], 
            notes: notes || '',
            favorito: known ? !!known.favorito : false
        };
        deps.pushDelivery(newDelivery);
        deps.setNextSequenceNumber(deps.getNextSequenceNumber() + 1);
        deps.persistStorageNow(); deps.renderDeliveriesList(); deps.upsertMarker(newDelivery);
        deps.updateLastIdDisplay(seqId);
        deps.clearRouteOverlay();
        deps.updateProgressAndEstimates();
        deps.showToast(`Entrega ${seqId} incluída na rota`);
        if (deps.getDeliveries().length === 1) deps.centerMapOnMarkers();
        clearForm();
    };
    if (known && known.lat && known.lng) {
        finish(known.lat, known.lng);
        return;
    }
    const cached = geocodePrefetchCache.get(endereco.trim().toLowerCase());
    if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
        finish(cached.lat, cached.lng);
        return;
    }
    deps.showToast("Localizando endereço…");
    const geocoder = deps.getGeocoder();
    if (!geocoder) {
        finish(PORTO_VELHO_CENTER.lat, PORTO_VELHO_CENTER.lng);
        return;
    }
    geocoder.geocode({ address: endereco }, (res, stat) => {
        let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
        if (stat === "OK" && res[0]) {
            lat = res[0].geometry.location.lat();
            lng = res[0].geometry.location.lng();
            geocodePrefetchCache.set(endereco.trim().toLowerCase(), { lat, lng });
        } else {
            deps.showToast("Endereço não encontrado. Usando o centro do mapa", true);
        }
        finish(lat, lng);
    });
}

export function setupAddDeliveryForm() {
    document.getElementById("addDeliveryBtn").addEventListener('click', function() {
        const nome = document.getElementById("customerName").value.trim();
        const end = document.getElementById("address").value.trim();
        const pacotes = parseInt(document.getElementById("pacotes").value) || 1;
        const saveAgenda = document.getElementById("saveToAgendaCheckbox").checked;
        const telefones = [...getTempPhones()];
        const notes = "";
        if (!nome || !end) { deps.showToast("Preencha nome e endereço para continuar", true); return; }
        const geocoder = deps.getGeocoder();
        if (!geocoder) { deps.showToast("Aguarde o mapa carregar completamente", true); return; }

        // Verifica se o endereço já está na rota (pendente / em rota)
        const already = deps.findActiveRouteByAddress(end);
        if (already) {
            deps.showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
            return;
        }

        // *** BLOQUEIA SE O ENDEREÇO JÁ ESTIVER NA AGENDA ***
        const agenda = deps.getAgenda();
        if (agenda.some(item => item.endereco.toLowerCase() === end.toLowerCase())) {
            deps.showToast("Este endereço já está na agenda. Use '+ Rota' na agenda para incluí-lo.", true);
            return;
        }

        deps.showToast("Localizando endereço…");
        geocoder.geocode({ address: end }, (res, stat) => {
            let lat = PORTO_VELHO_CENTER.lat, lng = PORTO_VELHO_CENTER.lng;
            if (stat === "OK" && res[0]) {
                lat = res[0].geometry.location.lat();
                lng = res[0].geometry.location.lng();
            } else {
                deps.showToast("Endereço não encontrado. Usando o centro do mapa", true);
            }
            const seqId = getSequentialId(deps.getNextSequenceNumber());
            const newDelivery = { 
                id: deps.newId(), 
                sequentialId: seqId, 
                nome, 
                endereco: end, 
                telefones, 
                pacotes, 
                status: "pendente", 
                lat, 
                lng, 
                savedToAgenda: false, 
                photos: [],
                photoIds: [],
                notes: notes,
                favorito: false
            };
            deps.pushDelivery(newDelivery);
            deps.setNextSequenceNumber(deps.getNextSequenceNumber() + 1);
            deps.persistStorageNow(); deps.renderDeliveriesList(); deps.upsertMarker(newDelivery);
            deps.updateLastIdDisplay(seqId);
            deps.clearRouteOverlay();
            deps.updateProgressAndEstimates();
            if (saveAgenda) {
                const agendaDup = deps.getAgenda().some(item => item.endereco.toLowerCase() === end.toLowerCase());
                if (agendaDup) {
                    deps.showToast(`Entrega ${seqId} incluída na rota. Endereço já constava na agenda`);
                } else {
                    deps.pushAgendaItem({ agendaId: deps.getNextAgendaId(), nome, endereco: end, telefones, pacotes, lat, lng, photos: [], photoIds: [], notes: notes });
                    deps.setNextAgendaId(deps.getNextAgendaId() + 1);
                    newDelivery.savedToAgenda = true;
                    deps.saveStorage();
                    deps.renderAgendaList();
                    deps.renderDeliveriesList();
                    deps.showToast(`Entrega ${seqId} incluída na rota e salva na agenda`);
                }
            } else {
                deps.showToast(`Entrega ${seqId} incluída na rota`);
            }
            if (deps.getDeliveries().length === 1) deps.centerMapOnMarkers();
            clearForm();
        });
    });
}
