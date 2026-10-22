/**
 * UI de filtros avançados
 */

import { advancedFilters } from './advanced-filters.js';

let onFilterChangeCallback = null;

export function initFiltersUI(container, onFilterChange) {
    onFilterChangeCallback = onFilterChange;
    renderFiltersPanel(container);
    attachFilterEvents(container);
}

function renderFiltersPanel(container) {
    const filtersHTML = `
        <div class="filters-panel" id="filtersPanel">
            <div class="filters-header">
                <div class="filters-title">
                    <i class="fas fa-filter"></i>
                    <span>Filtros</span>
                    <span class="filter-count" id="filterCount" style="display:none"></span>
                </div>
                <div class="filters-actions">
                    <button type="button" id="clearFiltersBtn" class="filters-clear" style="display:none">
                        <i class="fas fa-times"></i> Limpar
                    </button>
                    <button type="button" id="toggleFiltersBtn" class="filters-toggle" aria-label="Expandir filtros">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            </div>

            <div class="filters-body" id="filtersBody" style="display:none">
                <!-- Status -->
                <div class="filter-group">
                    <label class="filter-label">Status</label>
                    <div class="filter-chips">
                        <button type="button" class="filter-chip" data-filter="status" data-value="pendente">
                            <span class="chip-dot status-pendente"></span>
                            Pendente
                        </button>
                        <button type="button" class="filter-chip" data-filter="status" data-value="em-rota">
                            <span class="chip-dot status-em-rota"></span>
                            Em rota
                        </button>
                        <button type="button" class="filter-chip" data-filter="status" data-value="entregue">
                            <span class="chip-dot status-entregue"></span>
                            Entregue
                        </button>
                        <button type="button" class="filter-chip" data-filter="status" data-value="falhou">
                            <span class="chip-dot status-falhou"></span>
                            Falhou
                        </button>
                    </div>
                </div>

                <!-- Tipo de operação (patch 22) -->
                <div class="filter-group">
                    <label class="filter-label">Operação</label>
                    <div class="filter-chips">
                        <button type="button" class="filter-chip" data-filter="tipo" data-value="entrega">
                            <i class="fas fa-box-open" aria-hidden="true"></i> Entrega
                        </button>
                        <button type="button" class="filter-chip" data-filter="tipo" data-value="coleta">
                            <i class="fas fa-box" aria-hidden="true"></i> Coleta
                        </button>
                    </div>
                </div>

                <!-- Bairros -->
                <div class="filter-group">
                    <label class="filter-label">Bairro/Região</label>
                    <div class="filter-select-wrapper">
                        <select id="districtFilter" class="filter-select" multiple size="3">
                            <option value="" disabled>Carregando bairros...</option>
                        </select>
                    </div>
                </div>

                <!-- Motivo de falha -->
                <div class="filter-group">
                    <label class="filter-label">Motivo de falha</label>
                    <div class="filter-chips">
                        <button type="button" class="filter-chip" data-filter="failReason" data-value="ausente">
                            <i class="fas fa-house-user"></i>
                            Ausente
                        </button>
                        <button type="button" class="filter-chip" data-filter="failReason" data-value="endereco-errado">
                            <i class="fas fa-map-location-dot"></i>
                            Endereço errado
                        </button>
                        <button type="button" class="filter-chip" data-filter="failReason" data-value="recusou">
                            <i class="fas fa-hand"></i>
                            Recusou
                        </button>
                        <button type="button" class="filter-chip" data-filter="failReason" data-value="voltar-depois">
                            <i class="fas fa-clock"></i>
                            Voltar depois
                        </button>
                    </div>
                </div>

                <!-- Outros filtros -->
                <div class="filter-group">
                    <label class="filter-label">Outros</label>
                    <div class="filter-chips">
                        <button type="button" class="filter-chip" data-filter="hasPhotos" data-value="true">
                            <i class="fas fa-camera"></i>
                            Com fotos
                        </button>
                        <button type="button" class="filter-chip" data-filter="hasPhotos" data-value="false">
                            <i class="fas fa-camera" style="opacity:0.3"></i>
                            Sem fotos
                        </button>
                        <button type="button" class="filter-chip" data-filter="priority" data-value="high">
                            <i class="fas fa-star"></i>
                            Prioridade
                        </button>
                    </div>
                </div>

                <!-- Filtros salvos -->
                <div class="filter-group">
                    <label class="filter-label">Filtros salvos</label>
                    <div class="saved-filters-row">
                        <select id="presetsSelect" class="filter-select">
                            <option value="">Selecione...</option>
                        </select>
                        <button type="button" id="loadPresetBtn" class="btn-secondary-sm" title="Carregar filtro salvo">
                            <i class="fas fa-check"></i>
                        </button>
                        <button type="button" id="savePresetBtn" class="btn-secondary-sm" title="Salvar filtros atuais">
                            <i class="fas fa-save"></i>
                        </button>
                        <button type="button" id="deletePresetBtn" class="btn-secondary-sm" title="Excluir filtro salvo">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Insere depois da search-box
    const searchBox = container.querySelector('.search-box');
    if (searchBox) {
        searchBox.insertAdjacentHTML('afterend', filtersHTML);
    }
}

function attachFilterEvents(container) {
    const filtersPanel = container.querySelector('#filtersPanel');
    if (!filtersPanel) return;

    // Toggle painel de filtros
    const toggleBtn = filtersPanel.querySelector('#toggleFiltersBtn');
    const filtersBody = filtersPanel.querySelector('#filtersBody');
    toggleBtn?.addEventListener('click', () => {
        const isOpen = filtersBody.style.display !== 'none';
        filtersBody.style.display = isOpen ? 'none' : 'block';
        toggleBtn.querySelector('i').className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        toggleBtn.setAttribute('aria-label', isOpen ? 'Expandir filtros' : 'Recolher filtros');
    });

    // Limpar filtros
    const clearBtn = filtersPanel.querySelector('#clearFiltersBtn');
    clearBtn?.addEventListener('click', () => {
        advancedFilters.clearAll();
        updateFiltersUI(container);
        triggerFilterChange();
    });

    // Filter chips (status, failReason, etc)
    filtersPanel.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filterType = chip.dataset.filter;
            const value = chip.dataset.value;

            if (filterType === 'hasPhotos' || filterType === 'priority') {
                // Boolean/single value filters
                const currentValue = advancedFilters.activeFilters[filterType];
                if (filterType === 'hasPhotos') {
                    const newValue = value === 'true' ? true : false;
                    advancedFilters.setFilter(filterType, currentValue === newValue ? null : newValue);
                } else if (filterType === 'priority') {
                    advancedFilters.setFilter(filterType, currentValue === value ? null : value);
                }
            } else {
                // Array filters
                advancedFilters.toggleArrayFilter(filterType, value);
            }

            updateFiltersUI(container);
            triggerFilterChange();
        });
    });

    // Select de bairros
    const districtSelect = filtersPanel.querySelector('#districtFilter');
    districtSelect?.addEventListener('change', () => {
        const selected = Array.from(districtSelect.selectedOptions).map(opt => opt.value);
        advancedFilters.setFilter('district', selected);
        updateFiltersUI(container);
        triggerFilterChange();
    });

    // Presets
    const loadPresetBtn = filtersPanel.querySelector('#loadPresetBtn');
    const savePresetBtn = filtersPanel.querySelector('#savePresetBtn');
    const deletePresetBtn = filtersPanel.querySelector('#deletePresetBtn');
    const presetsSelect = filtersPanel.querySelector('#presetsSelect');

    loadPresetBtn?.addEventListener('click', () => {
        const presetName = presetsSelect?.value;
        if (presetName && advancedFilters.loadPreset(presetName)) {
            updateFiltersUI(container);
            triggerFilterChange();
        }
    });

    savePresetBtn?.addEventListener('click', () => {
        const name = prompt('Nome do filtro:');
        if (name && advancedFilters.saveCurrentAsPreset(name)) {
            updatePresetsDropdown(container);
            alert('Filtro salvo com sucesso!');
        }
    });

    deletePresetBtn?.addEventListener('click', () => {
        const presetName = presetsSelect?.value;
        if (presetName && confirm(`Excluir filtro "${presetName}"?`)) {
            advancedFilters.deletePreset(presetName);
            updatePresetsDropdown(container);
        }
    });

    // Inicializa lista de presets
    updatePresetsDropdown(container);
}

export function updateFiltersUI(container) {
    const filtersPanel = container.querySelector('#filtersPanel');
    if (!filtersPanel) return;

    const filters = advancedFilters.activeFilters;
    const count = advancedFilters.countActiveFilters();

    // Atualiza contador
    const filterCount = filtersPanel.querySelector('#filterCount');
    const clearBtn = filtersPanel.querySelector('#clearFiltersBtn');
    if (count > 0) {
        filterCount.textContent = count;
        filterCount.style.display = 'inline-block';
        clearBtn.style.display = 'inline-block';
    } else {
        filterCount.style.display = 'none';
        clearBtn.style.display = 'none';
    }

    // Atualiza chips de status
    filtersPanel.querySelectorAll('.filter-chip[data-filter="status"]').forEach(chip => {
        const value = chip.dataset.value;
        chip.classList.toggle('active', filters.status.includes(value));
    });

    // Atualiza chips de tipo de operação (patch 22)
    filtersPanel.querySelectorAll('.filter-chip[data-filter="tipo"]').forEach(chip => {
        const value = chip.dataset.value;
        chip.classList.toggle('active', (filters.tipo || []).includes(value));
    });

    // Atualiza chips de failReason
    filtersPanel.querySelectorAll('.filter-chip[data-filter="failReason"]').forEach(chip => {
        const value = chip.dataset.value;
        chip.classList.toggle('active', filters.failReason.includes(value));
    });

    // Atualiza chip de fotos
    filtersPanel.querySelectorAll('.filter-chip[data-filter="hasPhotos"]').forEach(chip => {
        const value = chip.dataset.value === 'true';
        chip.classList.toggle('active', filters.hasPhotos === value);
    });

    // Atualiza chip de prioridade
    filtersPanel.querySelectorAll('.filter-chip[data-filter="priority"]').forEach(chip => {
        const value = chip.dataset.value;
        chip.classList.toggle('active', filters.priority === value);
    });
}

export function updateDistrictsOptions(container, deliveries) {
    const districtSelect = container.querySelector('#districtFilter');
    if (!districtSelect) return;

    const districts = advancedFilters.getAvailableDistricts(deliveries);
    const currentSelection = advancedFilters.activeFilters.district;

    districtSelect.innerHTML = districts.map(d =>
        `<option value="${d}" ${currentSelection.includes(d) ? 'selected' : ''}>${d}</option>`
    ).join('');

    if (districts.length === 0) {
        districtSelect.innerHTML = '<option value="" disabled>Nenhum bairro encontrado</option>';
    }
}

function updatePresetsDropdown(container) {
    const presetsSelect = container.querySelector('#presetsSelect');
    if (!presetsSelect) return;

    const presets = advancedFilters.getPresets();
    presetsSelect.innerHTML = '<option value="">Selecione...</option>' +
        presets.map(p => `<option value="${p}">${p}</option>`).join('');
}

function triggerFilterChange() {
    if (onFilterChangeCallback) {
        onFilterChangeCallback();
    }
}

export function applyFiltersToDeliveries(deliveries) {
    return advancedFilters.applyFilters(deliveries);
}
