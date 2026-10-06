/**
 * Telefones temporários do formulário "Nova entrega" (tags + input).
 * main.js lê/escreve a lista via getTempPhones / setTempPhones.
 */
import { escapeHtml } from '../../lib/html.js';
import {
    formatPhoneNumber,
    formatPhoneShort
} from '../../lib/phone-helpers.js';

let deps = {
    showToast: () => {}
};

export function configureFormPhones(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let tempPhones = [];

export function getTempPhones() {
    return tempPhones;
}

export function setTempPhones(phones) {
    tempPhones = Array.isArray(phones) ? phones.slice() : [];
}

export function clearTempPhones() {
    tempPhones = [];
}

export function renderTempPhones() {
    const container = document.getElementById('phoneTagsContainer');
    container.innerHTML = tempPhones.map(p => {
        const label = p.label ? p.label + ': ' : '';
        return `<span class="phone-tag"><span class="phone-label">${escapeHtml(label)}</span>${escapeHtml(formatPhoneShort(p.numero))} <span class="remove-phone" data-phone="${escapeHtml(p.numero)}">&times;</span></span>`;
    }).join('');
    container.querySelectorAll('.remove-phone').forEach(el => {
        el.addEventListener('click', () => {
            const phone = el.dataset.phone;
            tempPhones = tempPhones.filter(p => p.numero !== phone);
            renderTempPhones();
        });
    });
}

export function setupNewDeliveryPhoneUI() {
    const addBtn = document.getElementById('addPhoneBtn');
    const numInput = document.getElementById('newPhoneInput');
    const labelInput = document.getElementById('newPhoneLabel');
    addBtn.addEventListener('click', () => {
        const numero = numInput.value.trim();
        const label = labelInput.value.trim();
        if (!numero) return deps.showToast("Informe um número de telefone", true);
        const formatted = formatPhoneNumber(numero);
        if (!formatted) return deps.showToast("Número de telefone inválido", true);
        tempPhones.push({ numero: formatted, label: label || '' });
        renderTempPhones();
        numInput.value = '';
        labelInput.value = '';
    });
    numInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    renderTempPhones();
}
