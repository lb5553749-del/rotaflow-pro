/**
 * Modais de edição de entrega e agenda + apply dos campos salvos.
 * Helpers puros em lib/edit-helpers.js; main injeta estado via configureEditModals().
 */
import { escapeHtml } from '../../lib/html.js';
import { formatPhoneNumber } from '../../lib/phone-helpers.js';
import {
    alignPhotoIdArray,
    photoSlotsLeft,
    collectPhonesFromPairs,
    isValidEditNameAddress,
    applyDeliveryUpdatedFields,
    mergeAgendaItemFields,
    deliveryStatusOptionsHtml,
    parsePacotesInput
} from '../../lib/edit-helpers.js';
import { normalizeTimeInputValue } from '../../lib/routing-helpers.js';
import { PHOTO_MAX_PER_ITEM, idbDeletePhoto } from './photo-store.js';
import {
    itemPhotoScope,
    isDuplicatePhotoSave,
    markPhotoSaved,
    persistPhotoDataUrl,
    photoFingerprint
} from './item-photos.js';
import { pickPhotoDataUrls } from './camera.js';
import { openGallery } from './gallery.js';

let deps = {
    showToast: () => {},
    persistStorageNow: () => false,
    saveStorage: () => {},
    getCurrentSelectedDelivery: () => null,
    refreshPanelPhotos: () => {},
    scheduleDeliveriesListPhotoRefresh: () => {},
    geocodeAddressAndUpdate: () => {},
    getMarker: () => null,
    updateMarkerIcon: () => {},
    rebuildMarkers: () => {},
    updateDeliveryStats: () => {},
    renderDeliveriesList: () => {},
    syncAgendaByDelivery: () => {},
    syncActiveStopNotification: () => {},
    getAgenda: () => [],
    setAgendaItemAt: () => {},
    getGeocoder: () => null,
    renderAgendaList: () => {}
};

export function configureEditModals(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function showEditDeliveryModal(delivery, onSave) {
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    const currentPhotos = delivery.photos || [];
    const currentPhones = delivery.telefones || [];
    const currentPacotes = delivery.pacotes || 1;
    overlay.innerHTML = `<div class="modal-container modal-edit-dense">
        <h3 class="modal-title">Editar entrega</h3>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNome">Nome</label>
            <input id="editNome" class="edit-input" value="${escapeHtml(delivery.nome)}" placeholder="Nome do cliente">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editEndereco">Endereço</label>
            <input id="editEndereco" class="edit-input" value="${escapeHtml(delivery.endereco)}" placeholder="Endereço completo">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Telefones</label>
            <div id="editPhonesList" class="modal-phone-list"></div>
            <div class="modal-add-phone">
                <input type="text" id="editNewPhoneLabel" placeholder="Identificação">
                <input type="tel" id="editNewPhone" placeholder="(69) 99999-9999">
                <button type="button" id="editAddPhoneBtn" class="modal-add-phone-btn" aria-label="Adicionar telefone"><i class="fas fa-plus"></i></button>
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Pacotes</label>
            <div class="modal-pacotes-control">
                <button type="button" id="modalPacotesMinus" aria-label="Diminuir pacotes">−</button>
                <span id="modalPacotesValue">${currentPacotes}</span>
                <button type="button" id="modalPacotesPlus" aria-label="Aumentar pacotes">+</button>
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editStatus">Status</label>
            <select id="editStatus" class="edit-input">
                ${deliveryStatusOptionsHtml(delivery.status)}
            </select>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNotes">Observações</label>
            <input id="editNotes" class="edit-input" value="${escapeHtml(delivery.notes || '')}" placeholder="Ex.: deixar com o porteiro">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editValor">Valor / receita (R$)</label>
            <input id="editValor" class="edit-input" type="number" min="0" step="0.01" inputmode="decimal" value="${delivery.valor != null ? escapeHtml(String(delivery.valor)) : ''}" placeholder="Opcional">
        </div>
        <div class="modal-form-row-2">
            <div class="modal-form-group">
                <label class="modal-field-label" for="editJanelaInicio">Janela início</label>
                <input id="editJanelaInicio" class="edit-input" type="time" value="${escapeHtml(normalizeTimeInputValue(delivery.janelaInicio))}">
            </div>
            <div class="modal-form-group">
                <label class="modal-field-label" for="editJanelaFim">Entregar até</label>
                <input id="editJanelaFim" class="edit-input" type="time" value="${escapeHtml(normalizeTimeInputValue(delivery.janelaFim))}">
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Fotos</label>
            <div class="modal-photo-block">
                <div class="modal-photo-toolbar">
                    <button type="button" id="editCameraBtn" class="photo-btn"><i class="fas fa-camera"></i> Tirar foto</button>
                    <button type="button" id="editGalleryBtn" class="photo-btn"><i class="fas fa-images"></i> Galeria</button>
                </div>
                <input type="file" id="editCameraInput" accept="image/*" capture="environment" style="display:none;">
                <input type="file" id="editGalleryInput" accept="image/*" multiple style="display:none;">
                <div id="editPhotosPreview" class="modal-photo-grid photos-preview"></div>
            </div>
        </div>
        <div class="modal-buttons"><button type="button" class="modal-confirm" id="saveEdit">Salvar</button><button type="button" class="modal-cancel" id="cancelEdit">Cancelar</button></div>
    </div>`;
    document.body.appendChild(overlay);

    const editPhones = [...currentPhones];
    function renderEditPhones() {
        const list = overlay.querySelector('#editPhonesList');
        list.innerHTML = editPhones.map((p, i) => `
            <div class="modal-phone-row">
                <input type="text" class="edit-phone-label-modal" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Identificação">
                <input type="tel" class="edit-phone-number-modal" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número">
                <button type="button" class="remove-edit-phone-modal modal-phone-remove" data-index="${i}" aria-label="Remover telefone"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
        list.querySelectorAll('.remove-edit-phone-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editPhones.splice(idx, 1);
                renderEditPhones();
            });
        });
        list.querySelectorAll('.edit-phone-label-modal').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-phone-number-modal').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].numero = this.value;
            });
        });
    }
    renderEditPhones();

    overlay.querySelector('#editAddPhoneBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#editNewPhoneLabel');
        const numInput = overlay.querySelector('#editNewPhone');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return deps.showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return deps.showToast("Número de telefone inválido", true);
        editPhones.push({ numero: formatted, label: label || '' });
        renderEditPhones();
        labelInput.value = '';
        numInput.value = '';
    });
    overlay.querySelector('#editNewPhone').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#editAddPhoneBtn').click();
    });

    const newPhotosArray = [...currentPhotos];
    const newPhotoIdsArray = alignPhotoIdArray(newPhotosArray, delivery.photoIds);
    // Se só há dataURLs antigas sem ids, alinha com vazios (migração no save).

    const cameraInput = overlay.querySelector('#editCameraInput');
    const galleryInput = overlay.querySelector('#editGalleryInput');
    const previewContainer = overlay.querySelector('#editPhotosPreview');
    function updateEditPreview() {
        previewContainer.innerHTML = '';
        if (!newPhotosArray.length) {
            previewContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.75rem;">Nenhuma foto</span>';
            return;
        }
        newPhotosArray.forEach((photo, idx) => {
            const div = document.createElement('div');
            div.className = 'modal-photo-item';
            const img = document.createElement('img');
            img.src = photo;
            img.className = 'preview-thumb';
            img.alt = 'Foto da entrega';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-photo-btn';
            removeBtn.setAttribute('aria-label', 'Remover foto');
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = async () => {
                const pid = newPhotoIdsArray[idx];
                if (pid) {
                    try { await idbDeletePhoto(pid); } catch (e) {}
                }
                newPhotosArray.splice(idx, 1);
                newPhotoIdsArray.splice(idx, 1);
                delivery.photos = [...newPhotosArray];
                delivery.photoIds = newPhotoIdsArray.filter(Boolean);
                deps.persistStorageNow();
                const selected = deps.getCurrentSelectedDelivery();
                if (selected && selected.id === delivery.id) {
                    deps.refreshPanelPhotos(delivery);
                }
                deps.scheduleDeliveriesListPhotoRefresh();
                updateEditPreview();
            };
            div.appendChild(img);
            div.appendChild(removeBtn);
            previewContainer.appendChild(div);
        });
    }
    updateEditPreview();

    async function addPhotoFromDataUrls(urls) {
        if (!urls || !urls.length) return;
        try {
            let saved = 0;
            const scope = itemPhotoScope(delivery);
            for (const dataUrl of urls) {
                if (newPhotoIdsArray.filter(Boolean).length >= PHOTO_MAX_PER_ITEM) {
                    throw new Error('photo-limit');
                }
                if (isDuplicatePhotoSave(scope, dataUrl)) continue;
                if (newPhotosArray.some((p) => p === dataUrl || photoFingerprint(p) === photoFingerprint(dataUrl))) {
                    continue;
                }
                const id = await persistPhotoDataUrl(dataUrl);
                newPhotosArray.push(dataUrl);
                newPhotoIdsArray.push(id);
                markPhotoSaved(scope, dataUrl);
                saved += 1;
            }
            if (!saved) return;
            // Liga já à entrega — fechar o modal sem "Salvar" não perde as fotos.
            delivery.photos = [...newPhotosArray];
            delivery.photoIds = newPhotoIdsArray.filter(Boolean);
            deps.persistStorageNow();
            const selected = deps.getCurrentSelectedDelivery();
            if (selected && selected.id === delivery.id) {
                deps.refreshPanelPhotos(delivery);
            }
            deps.scheduleDeliveriesListPhotoRefresh();
            updateEditPreview();
            deps.showToast(saved > 1 ? `${saved} fotos adicionadas` : 'Foto adicionada com sucesso');
        } catch (e) {
            if (String(e?.message || e) === 'photo-limit') {
                deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
            } else {
                deps.showToast('Não foi possível salvar a foto. Tente novamente', true);
            }
        }
    }

    overlay.querySelector('#editCameraBtn').addEventListener('click', async () => {
        const slots = photoSlotsLeft(newPhotoIdsArray, PHOTO_MAX_PER_ITEM);
        if (slots <= 0) {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('camera', {
            fileInput: cameraInput,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-delivery', sequentialId: delivery.sequentialId }
        });
        if (urls.length) await addPhotoFromDataUrls(urls);
    });
    overlay.querySelector('#editGalleryBtn').addEventListener('click', async () => {
        const slots = photoSlotsLeft(newPhotoIdsArray, PHOTO_MAX_PER_ITEM);
        if (slots <= 0) {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por entrega`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('gallery', {
            fileInput: galleryInput,
            multiple: true,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-delivery', sequentialId: delivery.sequentialId }
        });
        if (urls.length) await addPhotoFromDataUrls(urls);
    });

    let editPacotes = currentPacotes;
    function updatePacotesDisplay() { overlay.querySelector('#modalPacotesValue').innerText = editPacotes; }
    overlay.querySelector('#modalPacotesMinus').addEventListener('click', () => { if (editPacotes > 1) { editPacotes--; updatePacotesDisplay(); } });
    overlay.querySelector('#modalPacotesPlus').addEventListener('click', () => { editPacotes++; updatePacotesDisplay(); });

    overlay.querySelector('#saveEdit').onclick = async () => {
        const list = overlay.querySelector('#editPhonesList');
        const labels = [...list.querySelectorAll('.edit-phone-label-modal')].map((inp) => inp.value);
        const numbers = [...list.querySelectorAll('.edit-phone-number-modal')].map((inp) => inp.value);
        const finalPhones = collectPhonesFromPairs(labels, numbers, formatPhoneNumber);
        const newNome = overlay.querySelector('#editNome').value.trim();
        const newEndereco = overlay.querySelector('#editEndereco').value.trim();
        const newStatus = overlay.querySelector('#editStatus').value;
        const newNotes = overlay.querySelector('#editNotes').value.trim();
        const valorRaw = overlay.querySelector('#editValor')?.value;
        const valorNum = valorRaw !== undefined && String(valorRaw).trim() !== ''
            ? Number(String(valorRaw).replace(',', '.'))
            : NaN;
        const newValor = Number.isFinite(valorNum) && valorNum >= 0 ? valorNum : undefined;
        const newJanelaInicio = (overlay.querySelector('#editJanelaInicio')?.value || '').trim();
        const newJanelaFim = (overlay.querySelector('#editJanelaFim')?.value || '').trim();
        if (!isValidEditNameAddress(newNome, newEndereco)) return deps.showToast("Preencha nome e endereço para continuar", true);
        // Garante ids para qualquer foto dataURL restante.
        for (let i = 0; i < newPhotosArray.length; i++) {
            if (!newPhotoIdsArray[i] && typeof newPhotosArray[i] === 'string' && newPhotosArray[i].startsWith('data:')) {
                newPhotoIdsArray[i] = await persistPhotoDataUrl(newPhotosArray[i]);
            }
        }
        onSave({
            nome: newNome,
            endereco: newEndereco,
            telefones: finalPhones,
            pacotes: editPacotes,
            status: newStatus,
            photos: newPhotosArray,
            photoIds: newPhotoIdsArray.filter(Boolean),
            notes: newNotes,
            valor: newValor,
            janelaInicio: newJanelaInicio,
            janelaFim: newJanelaFim
        });
        overlay.remove();
    };
    overlay.querySelector('#cancelEdit').onclick = () => overlay.remove();
}

export function editDeliveryInRoute(delivery, updatedData) {
    const { oldAddress, addressChanged } = applyDeliveryUpdatedFields(delivery, updatedData);
    if (addressChanged) {
        deps.geocodeAddressAndUpdate(delivery, updatedData.endereco, (success) => {
            if (!success) { delivery.endereco = oldAddress; deps.saveStorage(); deps.renderDeliveriesList(); }
            else if (deps.getCurrentSelectedDelivery() && deps.getCurrentSelectedDelivery().id === delivery.id) {
                deps.syncActiveStopNotification(delivery);
            }
        });
    } else {
        deps.saveStorage();
        const marker = deps.getMarker(delivery.sequentialId);
        if (marker) deps.updateMarkerIcon(marker, delivery);
        else deps.rebuildMarkers(false);
        deps.updateDeliveryStats();
        deps.renderDeliveriesList();
        deps.syncAgendaByDelivery(delivery);
        if (deps.getCurrentSelectedDelivery() && deps.getCurrentSelectedDelivery().id === delivery.id) {
            deps.syncActiveStopNotification(delivery);
        }
        deps.showToast(`Entrega ${delivery.sequentialId} atualizada`);
    }
}

export function editAgendaItem(agendaId, updatedData) {
    const agenda = deps.getAgenda();
    const idx = agenda.findIndex(i => i.agendaId === agendaId);
    if (idx === -1) return;
    if (updatedData.endereco !== agenda[idx].endereco) {
        deps.showToast("Atualizando coordenadas…");
        const geocoder = deps.getGeocoder();
        geocoder.geocode({ address: updatedData.endereco }, (res, stat) => {
            if (stat === "OK" && res[0]) {
                deps.setAgendaItemAt(idx, mergeAgendaItemFields(agenda[idx], updatedData, {
                    lat: res[0].geometry.location.lat(),
                    lng: res[0].geometry.location.lng()
                }));
                deps.saveStorage(); deps.renderAgendaList(); deps.showToast(`"${updatedData.nome}" atualizado na agenda`);
            } else deps.showToast("Não foi possível localizar este endereço", true);
        });
    } else {
        deps.setAgendaItemAt(idx, mergeAgendaItemFields(agenda[idx], updatedData));
        deps.saveStorage(); deps.renderAgendaList(); deps.showToast(`"${updatedData.nome}" atualizado na agenda`);
    }
}

export function showEditAgendaModal(item, onSave) {
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    const currentPhones = item.telefones || [];
    overlay.innerHTML = `<div class="modal-container modal-edit-dense">
        <h3 class="modal-title">Editar na agenda</h3>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNome">Nome</label>
            <input id="editNome" class="edit-input" value="${escapeHtml(item.nome)}" placeholder="Nome do cliente">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editEndereco">Endereço</label>
            <input id="editEndereco" class="edit-input" value="${escapeHtml(item.endereco)}" placeholder="Endereço completo">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Telefones</label>
            <div id="editAgendaPhonesList" class="modal-phone-list"></div>
            <div class="modal-add-phone">
                <input type="text" id="editAgendaNewPhoneLabel" placeholder="Identificação">
                <input type="tel" id="editAgendaNewPhone" placeholder="(69) 99999-9999">
                <button type="button" id="editAgendaAddPhoneBtn" class="modal-add-phone-btn" aria-label="Adicionar telefone"><i class="fas fa-plus"></i></button>
            </div>
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editPacotes">Pacotes</label>
            <input id="editPacotes" class="edit-input" type="number" min="1" value="${item.pacotes || 1}">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label" for="editNotes">Observações</label>
            <input id="editNotes" class="edit-input" value="${escapeHtml(item.notes || '')}" placeholder="Observações">
        </div>
        <div class="modal-form-group">
            <label class="modal-field-label">Fotos do cliente</label>
            <div class="modal-photo-block">
                <div class="modal-photo-toolbar">
                    <button type="button" id="editAgendaCameraBtn" class="photo-btn"><i class="fas fa-camera"></i> Tirar foto</button>
                    <button type="button" id="editAgendaGalleryBtn" class="photo-btn"><i class="fas fa-images"></i> Galeria</button>
                </div>
                <input type="file" id="editAgendaCameraInput" accept="image/*" capture="environment" style="display:none;">
                <input type="file" id="editAgendaGalleryInput" accept="image/*" multiple style="display:none;">
                <div id="editAgendaPhotosPreview" class="modal-photo-grid photos-preview"></div>
            </div>
        </div>
        <div class="modal-buttons"><button type="button" class="modal-confirm" id="saveEdit">Salvar</button><button type="button" class="modal-cancel" id="cancelEdit">Cancelar</button></div>
    </div>`;
    document.body.appendChild(overlay);

    const editPhones = [...currentPhones];
    function renderEditAgendaPhones() {
        const list = overlay.querySelector('#editAgendaPhonesList');
        list.innerHTML = editPhones.map((p, i) => `
            <div class="modal-phone-row">
                <input type="text" class="edit-agenda-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Identificação">
                <input type="tel" class="edit-agenda-phone-number" data-index="${i}" value="${escapeHtml(p.numero)}" placeholder="Número">
                <button type="button" class="remove-edit-agenda-phone modal-phone-remove" data-index="${i}" aria-label="Remover telefone"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
        list.querySelectorAll('.remove-edit-agenda-phone').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editPhones.splice(idx, 1);
                renderEditAgendaPhones();
            });
        });
        list.querySelectorAll('.edit-agenda-phone-label').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-agenda-phone-number').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (editPhones[idx]) editPhones[idx].numero = this.value;
            });
        });
    }
    renderEditAgendaPhones();

    overlay.querySelector('#editAgendaAddPhoneBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#editAgendaNewPhoneLabel');
        const numInput = overlay.querySelector('#editAgendaNewPhone');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return deps.showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return deps.showToast("Número de telefone inválido", true);
        editPhones.push({ numero: formatted, label: label || '' });
        renderEditAgendaPhones();
        labelInput.value = '';
        numInput.value = '';
    });

    const newPhotosArray = Array.isArray(item.photos) ? [...item.photos] : [];
    const newPhotoIdsArray = alignPhotoIdArray(newPhotosArray, item.photoIds);

    const cameraInput = overlay.querySelector('#editAgendaCameraInput');
    const galleryInput = overlay.querySelector('#editAgendaGalleryInput');
    const previewContainer = overlay.querySelector('#editAgendaPhotosPreview');
    function updateEditAgendaPreview() {
        previewContainer.innerHTML = '';
        if (!newPhotosArray.length) {
            previewContainer.innerHTML = '<span style="color:#94a3b8; font-size:0.75rem;">Nenhuma foto</span>';
            return;
        }
        newPhotosArray.forEach((photo, idx) => {
            const div = document.createElement('div');
            div.className = 'modal-photo-item';
            const img = document.createElement('img');
            img.src = photo;
            img.className = 'preview-thumb';
            img.alt = 'Foto do cliente';
            img.style.cursor = 'pointer';
            img.onclick = () => openGallery(newPhotosArray, idx);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-photo-btn';
            removeBtn.setAttribute('aria-label', 'Remover foto');
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = async () => {
                const pid = newPhotoIdsArray[idx];
                if (pid) {
                    try { await idbDeletePhoto(pid); } catch (e) {}
                }
                newPhotosArray.splice(idx, 1);
                newPhotoIdsArray.splice(idx, 1);
                item.photos = [...newPhotosArray];
                item.photoIds = newPhotoIdsArray.filter(Boolean);
                deps.persistStorageNow();
                deps.renderAgendaList();
                updateEditAgendaPreview();
            };
            div.appendChild(img);
            div.appendChild(removeBtn);
            previewContainer.appendChild(div);
        });
    }
    updateEditAgendaPreview();

    async function addAgendaPhotosFromDataUrls(urls) {
        if (!urls || !urls.length) return;
        try {
            for (const dataUrl of urls) {
                if (newPhotoIdsArray.filter(Boolean).length >= PHOTO_MAX_PER_ITEM) {
                    throw new Error('photo-limit');
                }
                const id = await persistPhotoDataUrl(dataUrl);
                newPhotosArray.push(dataUrl);
                newPhotoIdsArray.push(id);
            }
            // Liga já ao cliente da agenda — fechar sem "Salvar" não perde as fotos.
            item.photos = [...newPhotosArray];
            item.photoIds = newPhotoIdsArray.filter(Boolean);
            deps.persistStorageNow();
            deps.renderAgendaList();
            updateEditAgendaPreview();
            deps.showToast(urls.length > 1 ? `${urls.length} fotos adicionadas` : 'Foto adicionada');
        } catch (e) {
            if (String(e?.message || e) === 'photo-limit') {
                deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
            } else {
                deps.showToast('Não foi possível salvar a foto. Tente novamente', true);
            }
        }
    }

    overlay.querySelector('#editAgendaCameraBtn').addEventListener('click', async () => {
        const slots = photoSlotsLeft(newPhotoIdsArray, PHOTO_MAX_PER_ITEM);
        if (slots <= 0) {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('camera', {
            fileInput: cameraInput,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-agenda', agendaId: item.agendaId }
        });
        if (urls.length) await addAgendaPhotosFromDataUrls(urls);
    });
    overlay.querySelector('#editAgendaGalleryBtn').addEventListener('click', async () => {
        const slots = photoSlotsLeft(newPhotoIdsArray, PHOTO_MAX_PER_ITEM);
        if (slots <= 0) {
            deps.showToast(`Limite de ${PHOTO_MAX_PER_ITEM} fotos por item`, true);
            return;
        }
        const urls = await pickPhotoDataUrls('gallery', {
            fileInput: galleryInput,
            multiple: true,
            maxPhotos: slots,
            pendingTarget: { kind: 'edit-agenda', agendaId: item.agendaId }
        });
        if (urls.length) await addAgendaPhotosFromDataUrls(urls);
    });

    overlay.querySelector('#saveEdit').onclick = async () => {
        const list = overlay.querySelector('#editAgendaPhonesList');
        const labels = [...list.querySelectorAll('.edit-agenda-phone-label')].map((inp) => inp.value);
        const numbers = [...list.querySelectorAll('.edit-agenda-phone-number')].map((inp) => inp.value);
        const finalPhones = collectPhonesFromPairs(labels, numbers, formatPhoneNumber);
        const newNome = overlay.querySelector('#editNome').value.trim();
        const newEndereco = overlay.querySelector('#editEndereco').value.trim();
        const newPacotes = parsePacotesInput(overlay.querySelector('#editPacotes').value, 1);
        const newNotes = overlay.querySelector('#editNotes').value.trim();
        if (!isValidEditNameAddress(newNome, newEndereco)) return deps.showToast("Preencha nome e endereço para continuar", true);
        for (let i = 0; i < newPhotosArray.length; i++) {
            if (!newPhotoIdsArray[i] && typeof newPhotosArray[i] === 'string' && newPhotosArray[i].startsWith('data:')) {
                newPhotoIdsArray[i] = await persistPhotoDataUrl(newPhotosArray[i]);
            }
        }
        onSave({
            nome: newNome,
            endereco: newEndereco,
            telefones: finalPhones,
            pacotes: newPacotes,
            notes: newNotes,
            photos: newPhotosArray,
            photoIds: newPhotoIdsArray.filter(Boolean)
        });
        overlay.remove();
    };
    overlay.querySelector('#cancelEdit').onclick = () => overlay.remove();
}
