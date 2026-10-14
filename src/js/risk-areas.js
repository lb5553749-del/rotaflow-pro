/**
 * Áreas de risco (amarelo/vermelho) — prefs local-first + modal mínimo.
 */
import { escapeHtml } from '../../lib/html.js';
import {
    readRiskAreasPref,
    writeRiskAreasPref,
    createRiskArea,
    matchDeliveryRiskArea,
    riskLevelBadgeLabel,
    RISK_LEVELS
} from '../../lib/risk-area-helpers.js';
import { extractDistrict as extractDistrictFromAddress } from '../../lib/map-helpers.js';

let deps = {
    getStorage: () => (typeof localStorage !== 'undefined' ? localStorage : null),
    showToast: () => {},
    onAreasChanged: () => {}
};

/** @type {{ id: string, label: string, match: string, level: 'amarelo'|'vermelho' }[]} */
let riskAreas = [];

export function configureRiskAreas(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function loadRiskAreas() {
    riskAreas = readRiskAreasPref(deps.getStorage());
    return riskAreas;
}

export function getRiskAreas() {
    return riskAreas.slice();
}

function persist() {
    riskAreas = writeRiskAreasPref(deps.getStorage(), riskAreas);
    try { deps.onAreasChanged(riskAreas); } catch (_) {}
    return riskAreas;
}

export function riskLevelForDelivery(delivery) {
    const hit = matchDeliveryRiskArea(delivery, riskAreas);
    return hit ? hit.level : null;
}

export function riskMatchForDelivery(delivery) {
    return matchDeliveryRiskArea(delivery, riskAreas);
}

export function addRiskArea(label, level) {
    const area = createRiskArea(label, level);
    if (!area) return null;
    riskAreas = riskAreas.filter((a) => !(a.match === area.match && a.level === area.level));
    riskAreas.push(area);
    persist();
    return area;
}

export function removeRiskArea(id) {
    const before = riskAreas.length;
    riskAreas = riskAreas.filter((a) => a.id !== id);
    if (riskAreas.length !== before) persist();
    return riskAreas;
}

export function setRiskLevelFromList(delivery, level) {
    if (!delivery) return null;
    const endereco = String(delivery.endereco || '').trim();
    if (!endereco) {
        deps.showToast('Endereço vazio — não dá para marcar área', true);
        return null;
    }
    // Label seed = bairro do endereço (parser único em lib/map-helpers.js).
    const district = extractDistrictFromAddress(endereco);
    let label = district || endereco.split(',')[0].trim();
    // If still long, take first 3 words of street.
    if (label && label.length > 40) {
        label = label.split(/\s+/).slice(0, 3).join(' ');
    }
    if (level === null || level === '' || level === 'none') {
        riskAreas = riskAreas.filter((a) => !matchDeliveryRiskArea(delivery, [a]));
        persist();
        deps.showToast(`Alerta removido para “${label || endereco}”`);
        return null;
    }
    const area = addRiskArea(label || endereco, level);
    if (area) {
        const badge = riskLevelBadgeLabel(area.level);
        deps.showToast(`${badge}: ${area.label}`);
    }
    return area;
}

function renderAreasListHtml(areas) {
    if (!areas.length) {
        return '<p class="profile-hint">Nenhuma área marcada. Use o menu da entrega ou adicione abaixo (bairro, rua ou região).</p>';
    }
    return `<ul class="risk-areas-list">${areas.map((a) => `
        <li class="risk-areas-item risk-${escapeHtml(a.level)}" data-id="${escapeHtml(a.id)}">
            <span class="risk-areas-badge" aria-hidden="true"></span>
            <span class="risk-areas-label">${escapeHtml(a.label)}</span>
            <span class="risk-areas-level">${a.level === RISK_LEVELS.vermelho ? 'Vermelho' : 'Amarelo'}</span>
            <button type="button" class="risk-areas-remove" data-action="remove" data-id="${escapeHtml(a.id)}" aria-label="Remover ${escapeHtml(a.label)}">&times;</button>
        </li>`).join('')}</ul>`;
}

export function showRiskAreasModal() {
    loadRiskAreas();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:440px;" role="dialog" aria-modal="true" aria-labelledby="riskAreasTitle">
            <h3 class="modal-title" id="riskAreasTitle">Áreas de risco</h3>
            <p class="profile-hint">Marque bairros, ruas ou regiões. Paradas que coincidirem no endereço ganham destaque amarelo/vermelho. Vermelho: priorize diurno.</p>
            <div id="riskAreasListHost">${renderAreasListHtml(riskAreas)}</div>
            <div class="form-group" style="margin-top:12px;">
                <label for="riskAreaLabel">Nova área (texto do endereço)</label>
                <input type="text" id="riskAreaLabel" class="edit-input" placeholder="Ex.: São João Bosco" autocomplete="off">
            </div>
            <div class="pin-size-options" id="riskLevelOptions" role="group" aria-label="Nível de alerta">
                <button type="button" class="pin-size-option active" data-level="amarelo">Amarelo</button>
                <button type="button" class="pin-size-option" data-level="vermelho">Vermelho</button>
            </div>
            <div class="modal-buttons">
                <button type="button" class="modal-confirm" id="riskAreaAddBtn">Adicionar</button>
                <button type="button" class="modal-cancel" id="riskAreaCloseBtn">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    let pendingLevel = RISK_LEVELS.amarelo;
    const refreshList = () => {
        const host = overlay.querySelector('#riskAreasListHost');
        if (host) host.innerHTML = renderAreasListHtml(riskAreas);
    };

    overlay.querySelectorAll('#riskLevelOptions .pin-size-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            pendingLevel = btn.dataset.level === 'vermelho' ? RISK_LEVELS.vermelho : RISK_LEVELS.amarelo;
            overlay.querySelectorAll('#riskLevelOptions .pin-size-option').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
        });
    });

    overlay.querySelector('#riskAreasListHost')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="remove"]');
        if (!btn) return;
        removeRiskArea(btn.dataset.id);
        refreshList();
        deps.showToast('Área removida');
    });

    overlay.querySelector('#riskAreaAddBtn')?.addEventListener('click', () => {
        const input = overlay.querySelector('#riskAreaLabel');
        const label = String(input?.value || '').trim();
        if (!label) {
            deps.showToast('Informe o bairro, rua ou região', true);
            return;
        }
        const area = addRiskArea(label, pendingLevel);
        if (!area) {
            deps.showToast('Não foi possível salvar a área', true);
            return;
        }
        if (input) input.value = '';
        refreshList();
        deps.showToast(`Área “${area.label}” salva`);
    });

    const close = () => overlay.remove();
    overlay.querySelector('#riskAreaCloseBtn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

export { riskLevelBadgeLabel, RISK_LEVELS };
