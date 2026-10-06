/**
 * Autocomplete de nome/endereço no formulário "Nova entrega".
 * Ranking puro em lib/suggestion-helpers.js; estado e ações vêm via configureNameSuggestions().
 */
import { escapeHtml } from '../../lib/html.js';
import { suggestionItemRank } from '../../lib/suggestion-helpers.js';
import { formatPhoneShort } from '../../lib/phone-helpers.js';

let deps = {
    debounce: (fn) => fn,
    getAgenda: () => [],
    getDeliveries: () => [],
    findActiveRouteByAddress: () => null,
    setTempPhones: () => {},
    renderTempPhones: () => {},
    checkAddressDuplicate: () => {},
    saveStorage: () => {},
    renderDeliveriesList: () => {},
    getMarker: () => null,
    updateMarkerIcon: () => {},
    updateDeliveryStats: () => {},
    showToast: () => {},
    addDeliveryDirect: () => {}
};

export function configureNameSuggestions(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function initNameSuggestions() {
    const input = document.getElementById('customerName');
    const suggestionsDiv = document.getElementById('nameSuggestions');
    input.addEventListener('input', deps.debounce(function() {
        const query = this.value.trim().toLowerCase();
        if (query.length < 1) { suggestionsDiv.style.display = 'none'; return; }

        const agenda = deps.getAgenda();
        const deliveries = deps.getDeliveries();

        const agendaMatches = agenda.filter(item => 
            item.nome.toLowerCase().includes(query) || 
            item.endereco.toLowerCase().includes(query)
        );

        const routeMatches = deliveries.filter(del => 
            del.nome.toLowerCase().includes(query) || 
            del.endereco.toLowerCase().includes(query)
        );

        const combined = [];

        routeMatches.forEach(del => {
            combined.push({
                type: 'route',
                item: del,
                nome: del.nome,
                endereco: del.endereco,
                telefones: del.telefones || [],
                pacotes: del.pacotes || 1,
                notes: del.notes || '',
                favorito: del.favorito || false,
                sequentialId: del.sequentialId,
                id: del.id
            });
        });

        agendaMatches.forEach(item => {
            const onRoute = deps.findActiveRouteByAddress(item.endereco);
            combined.push({
                type: 'agenda',
                item: item,
                nome: item.nome,
                endereco: item.endereco,
                telefones: item.telefones || [],
                pacotes: item.pacotes || 1,
                notes: item.notes || '',
                favorito: item.favorito || false,
                agendaId: item.agendaId,
                isInRoute: !!onRoute,
                sequentialId: onRoute ? onRoute.sequentialId : null
            });
        });

        const unique = [];
        const seen = new Set();
        combined.forEach(item => {
            const key = item.endereco.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(item);
            } else {
                const existingIndex = unique.findIndex(u => u.endereco.toLowerCase() === key);
                if (existingIndex !== -1 && item.type === 'route') {
                    unique[existingIndex] = item;
                }
            }
        });

        const isNumericQuery = /^\d+$/.test(query);
        unique.sort((a, b) => {
            const ra = suggestionItemRank(a, query);
            const rb = suggestionItemRank(b, query);
            if (ra !== rb) return ra - rb;
            if (a.favorito && !b.favorito) return -1;
            if (!a.favorito && b.favorito) return 1;
            if (a.type === 'route' && b.type !== 'route') return -1;
            if (a.type !== 'route' && b.type === 'route') return 1;
            if (isNumericQuery) {
                const lenDiff = String(a.nome || '').length - String(b.nome || '').length;
                if (lenDiff !== 0) return lenDiff;
            }
            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt', { sensitivity: 'base' });
        });

        const limited = unique.slice(0, 50);
        if (limited.length === 0) { suggestionsDiv.style.display = 'none'; return; }

        let html = '';
        limited.forEach(item => {
            const isRoute = item.type === 'route';
            const isAgendaInRoute = item.type === 'agenda' && item.isInRoute;
            const matchedBy = (item.nome.toLowerCase().includes(query) ? 'nome' : 'endereço');
            const icon = matchedBy === 'nome' ? 'fa-user' : 'fa-location-dot';
            const phones = (item.telefones || []).map(p => {
                const label = p.label ? p.label + ': ' : '';
                return label + formatPhoneShort(p.numero);
            }).join(', ');
            const favoritoIcon = item.favorito ? '⭐ ' : '';

            let badgeHtml = '';
            if (isRoute) {
                badgeHtml = `<span class="suggestion-badge route">🚀 ID ${item.sequentialId}</span>`;
            } else if (isAgendaInRoute) {
                const routeItem = deliveries.find(d => d.endereco.toLowerCase() === item.endereco.toLowerCase());
                badgeHtml = routeItem ? `<span class="suggestion-badge route">🚀 Na rota (ID ${routeItem.sequentialId})</span>` : `<span class="suggestion-badge route">🚀 Na rota</span>`;
            } else {
                // SEM BADGE para itens da agenda não rota
                badgeHtml = '';
            }

            const routeClass = isRoute ? 'suggestion-route' : 'suggestion-agenda';
            const pacotesVal = item.pacotes || 1;
            const dataIdAttr = isRoute ? `data-id="${item.id}"` : '';

            let actionBtnHtml;
            if (isRoute) {
                actionBtnHtml = `<button class="suggestion-btn-save" data-action="save" data-id="${item.id}" data-pacotes="${pacotesVal}"><i class="fas fa-save"></i> Salvar</button>`;
            } else if (isAgendaInRoute) {
                actionBtnHtml = `<button class="suggestion-btn-add disabled" disabled>🔒 Na rota</button>`;
            } else {
                // Item da agenda que NÃO está na rota => botão "+ Rota" habilitado
                actionBtnHtml = `<button class="suggestion-btn-add" data-name="${escapeHtml(item.nome)}" data-address="${escapeHtml(item.endereco)}" data-phones='${JSON.stringify(item.telefones || [])}' data-pacotes="${pacotesVal}" data-notes="${escapeHtml(item.notes || '')}"><i class="fas fa-plus"></i> Rota</button>`;
            }

            html += `<div class="suggestion-item ${routeClass}" ${dataIdAttr} data-name="${escapeHtml(item.nome)}" data-address="${escapeHtml(item.endereco)}" data-phones='${JSON.stringify(item.telefones || [])}' data-pacotes="${pacotesVal}" data-notes="${escapeHtml(item.notes || '')}" data-isroute="${isRoute}">
                        <div class="suggestion-info">
                            <div><i class="fas ${icon}" style="color:#3b82f6; margin-right:8px;"></i><strong>${favoritoIcon}${escapeHtml(item.nome)}</strong> ${badgeHtml}</div>
                            <div style="font-size:0.7rem; color:#475569;">${escapeHtml(item.endereco)} ${phones ? `<span style="margin-left:6px;">📞 ${escapeHtml(phones)}</span>` : ''}</div>
                            <div style="font-size:0.65rem; color:#3b82f6;">${matchedBy}</div>
                        </div>
                        <div class="suggestion-actions">
                            <div class="suggestion-pacotes-control" data-pacotes="${pacotesVal}">
                                <button class="suggestion-pacotes-minus">−</button>
                                <span class="suggestion-pacotes-value">${pacotesVal}</span>
                                <button class="suggestion-pacotes-plus">+</button>
                            </div>
                            ${actionBtnHtml}
                        </div>
                    </div>`;
        });
        suggestionsDiv.innerHTML = html;
        suggestionsDiv.style.display = 'block';

        document.querySelectorAll('.suggestion-pacotes-control').forEach(control => {
            const minus = control.querySelector('.suggestion-pacotes-minus');
            const plus = control.querySelector('.suggestion-pacotes-plus');
            const valueSpan = control.querySelector('.suggestion-pacotes-value');
            const itemDiv = control.closest('.suggestion-item');
            const actionBtn = itemDiv.querySelector('.suggestion-btn-save, .suggestion-btn-add');

            let currentVal = parseInt(control.dataset.pacotes) || 1;

            function updateValue(newVal) {
                if (newVal < 1) newVal = 1;
                currentVal = newVal;
                valueSpan.textContent = currentVal;
                control.dataset.pacotes = currentVal;
                itemDiv.dataset.pacotes = currentVal;
                if (actionBtn) actionBtn.dataset.pacotes = currentVal;
            }

            minus.addEventListener('click', (e) => {
                e.stopPropagation();
                updateValue(currentVal - 1);
            });
            plus.addEventListener('click', (e) => {
                e.stopPropagation();
                updateValue(currentVal + 1);
            });
        });

        document.querySelectorAll('#nameSuggestions .suggestion-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.suggestion-btn-save') || e.target.closest('.suggestion-btn-add') || e.target.closest('.suggestion-pacotes-control')) return;
                const name = el.dataset.name;
                const address = el.dataset.address;
                const phones = JSON.parse(el.dataset.phones || '[]');
                const pacotes = parseInt(el.dataset.pacotes) || 1;

                document.getElementById('customerName').value = name;
                document.getElementById('address').value = address;
                deps.setTempPhones(phones);
                deps.renderTempPhones();
                document.getElementById('pacotes').value = pacotes;
                suggestionsDiv.style.display = 'none';
                deps.checkAddressDuplicate();
            });
        });

        document.querySelectorAll('.suggestion-btn-save').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const pacotes = parseInt(btn.dataset.pacotes) || 1;
                const delivery = deliveries.find(d => d.id === id);
                if (delivery) {
                    delivery.pacotes = pacotes;
                    deps.saveStorage();
                    deps.renderDeliveriesList();
                    const marker = deps.getMarker(delivery.sequentialId);
                    if (marker) deps.updateMarkerIcon(marker, delivery);
                    deps.updateDeliveryStats();
                    deps.showToast(`Entrega ${delivery.sequentialId}: pacotes atualizados para ${pacotes}`);
                    suggestionsDiv.style.display = 'none';
                } else {
                    deps.showToast("Entrega não encontrada", true);
                }
            });
        });

        document.querySelectorAll('.suggestion-btn-add:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                const address = btn.dataset.address;
                const phones = JSON.parse(btn.dataset.phones || '[]');
                const pacotes = parseInt(btn.dataset.pacotes) || 1;
                const notes = btn.dataset.notes || '';
                // Verifica se já está na rota (pendente / em rota)
                const already = deps.findActiveRouteByAddress(address);
                if (already) {
                    deps.showToast(`Este endereço já está na rota (ID ${already.sequentialId})`, true);
                    suggestionsDiv.style.display = 'none';
                    return;
                }
                // Permite adicionar mesmo que esteja na agenda
                deps.setTempPhones(phones);
                deps.renderTempPhones();
                deps.addDeliveryDirect(name, address, phones, pacotes, notes);
                suggestionsDiv.style.display = 'none';
            });
        });
    }, 180));
    document.addEventListener('click', (e) => {
        if (e.target !== input && !suggestionsDiv.contains(e.target)) suggestionsDiv.style.display = 'none';
    });
}
