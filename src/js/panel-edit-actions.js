/**
 * Ações de edição no painel inferior: pacotes, observação e telefones.
 */
import { escapeHtml } from '../../lib/html.js';
import {
    formatPhoneNumber,
    formatPhoneShort
} from '../../lib/phone-helpers.js';

let deps = {
    getCurrentSelectedDelivery: () => null,
    showToast: () => {},
    showPromptModal: async () => null,
    saveStorage: () => {},
    getMarker: () => null,
    updateMarkerIcon: () => {},
    renderDeliveriesList: () => {},
    renderDeliveryPanelActions: () => {},
    syncActiveStopNotification: () => {},
    syncAgendaByDelivery: () => {}
};

export function configurePanelEditActions(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function adjustPacotes(delta) {
    const currentSelectedDelivery = deps.getCurrentSelectedDelivery();
    if (!currentSelectedDelivery) return;
    const newValue = (currentSelectedDelivery.pacotes || 1) + delta;
    if (newValue < 1) return;
    currentSelectedDelivery.pacotes = newValue;
    const pacotesSpan = document.getElementById('panelPacotesValue');
    pacotesSpan.innerText = newValue;
    if (newValue >= 2) {
        pacotesSpan.classList.add('pacotes-highlight');
    } else {
        pacotesSpan.classList.remove('pacotes-highlight');
    }
    const miniQty = document.getElementById('panelMiniQty');
    if (miniQty) {
        miniQty.textContent = String(newValue);
        miniQty.classList.toggle('pacotes-highlight', newValue >= 2);
    }
    const panel = document.getElementById('deliveryPanel');
    if (newValue >= 2) {
        panel.classList.add('red-bg');
    } else {
        panel.classList.remove('red-bg');
    }
    deps.saveStorage();
    const marker = deps.getMarker(currentSelectedDelivery.sequentialId);
    if (marker) {
        deps.updateMarkerIcon(marker, currentSelectedDelivery);
    }
    deps.renderDeliveriesList();
    deps.syncActiveStopNotification(currentSelectedDelivery);
    deps.showToast(`Quantidade de pacotes atualizada para ${newValue}`);
}

export async function editObservation() {
    const currentSelectedDelivery = deps.getCurrentSelectedDelivery();
    if (!currentSelectedDelivery) return;
    const currentObs = currentSelectedDelivery.notes || '';
    const newObs = await deps.showPromptModal({
        title: 'Observação',
        message: 'Informe a observação desta entrega:',
        defaultValue: currentObs,
        placeholder: 'Ex.: deixar com o porteiro',
        multiline: true
    });
    if (newObs !== null) {
        currentSelectedDelivery.notes = newObs.trim();
        document.getElementById('panelObsText').innerText = currentSelectedDelivery.notes || 'Nenhuma observação';
        deps.saveStorage();
        deps.renderDeliveriesList();
        deps.showToast("Observação salva com sucesso");
    }
}

export function editPhonesPanel() {
    const currentSelectedDelivery = deps.getCurrentSelectedDelivery();
    if (!currentSelectedDelivery) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const phones = currentSelectedDelivery.telefones || [];
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:480px;">
            <h3 class="modal-title">Editar telefones</h3>
            <div class="modal-form-group">
                <label class="modal-field-label">Telefones</label>
                <div id="phoneListModal" class="modal-phone-list"></div>
                <div class="modal-add-phone">
                    <input type="text" id="newPhoneLabelModal" placeholder="Identificação">
                    <input type="tel" id="newPhoneModal" placeholder="(69) 99999-9999">
                    <button type="button" id="addPhoneModalBtn" class="modal-add-phone-btn" aria-label="Adicionar telefone"><i class="fas fa-plus"></i></button>
                </div>
            </div>
            <div class="modal-buttons">
                <button type="button" class="modal-confirm" id="savePhonesModal">Salvar</button>
                <button type="button" class="modal-cancel" id="cancelPhonesModal">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    function persistPhones(message) {
        currentSelectedDelivery.telefones = phones.filter(p => p && p.numero);
        deps.saveStorage();
        const phoneContainer = document.getElementById('panelPhone');
        if (phoneContainer) {
            if (currentSelectedDelivery.telefones.length) {
                phoneContainer.innerHTML = currentSelectedDelivery.telefones.map(p => {
                    const label = p.label ? p.label + ': ' : '';
                    return label + formatPhoneShort(p.numero);
                }).join(', ');
            } else {
                phoneContainer.innerText = 'Não informado';
            }
        }
        deps.renderDeliveriesList();
        deps.renderDeliveryPanelActions(currentSelectedDelivery);
        deps.syncAgendaByDelivery(currentSelectedDelivery);
        if (message) deps.showToast(message);
    }

    function refreshPhoneList() {
        const list = overlay.querySelector('#phoneListModal');
        list.innerHTML = phones.map((p, i) =>
            `<div class="modal-phone-row">
                <input type="text" class="edit-phone-label" data-index="${i}" value="${escapeHtml(p.label || '')}" placeholder="Identificação">
                <input type="tel" class="edit-phone-number" data-index="${i}" value="${escapeHtml(p.numero || '')}" placeholder="Número">
                <button type="button" class="remove-phone-modal modal-phone-remove" data-index="${i}" aria-label="Remover telefone"><i class="fas fa-times"></i></button>
            </div>`
        ).join('');
        list.querySelectorAll('.remove-phone-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                phones.splice(idx, 1);
                refreshPhoneList();
                persistPhones("Telefone removido");
            });
        });
        list.querySelectorAll('.edit-phone-label').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (phones[idx]) phones[idx].label = this.value;
            });
        });
        list.querySelectorAll('.edit-phone-number').forEach(inp => {
            inp.addEventListener('change', function() {
                const idx = parseInt(this.dataset.index);
                if (phones[idx]) phones[idx].numero = this.value;
            });
        });
    }
    refreshPhoneList();

    overlay.querySelector('#addPhoneModalBtn').addEventListener('click', () => {
        const labelInput = overlay.querySelector('#newPhoneLabelModal');
        const numInput = overlay.querySelector('#newPhoneModal');
        const label = labelInput.value.trim();
        const numero = numInput.value.trim();
        if (!numero) return deps.showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return deps.showToast("Número de telefone inválido", true);
        phones.push({ numero: formatted, label: label || '' });
        refreshPhoneList();
        persistPhones("Telefone salvo");
        labelInput.value = '';
        numInput.value = '';
    });

    overlay.querySelector('#savePhonesModal').addEventListener('click', () => {
        const list = overlay.querySelector('#phoneListModal');
        const labels = list.querySelectorAll('.edit-phone-label');
        const numbers = list.querySelectorAll('.edit-phone-number');
        const newPhones = [];
        labels.forEach((inp, i) => {
            const num = numbers[i]?.value?.trim() || '';
            if (num) {
                const formatted = formatPhoneNumber(num);
                if (formatted) {
                    newPhones.push({ numero: formatted, label: inp.value.trim() || '' });
                }
            }
        });
        currentSelectedDelivery.telefones = newPhones;
        deps.saveStorage();
        const phoneContainer = document.getElementById('panelPhone');
        if (newPhones.length) {
            phoneContainer.innerHTML = newPhones.map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
        } else {
            phoneContainer.innerText = 'Não informado';
        }
        deps.renderDeliveriesList();
        deps.renderDeliveryPanelActions(currentSelectedDelivery);
        deps.syncAgendaByDelivery(currentSelectedDelivery);
        deps.showToast("Telefones atualizados");
        overlay.remove();
    });
    overlay.querySelector('#cancelPhonesModal').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#newPhoneModal').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#addPhoneModalBtn').click();
    });
}
