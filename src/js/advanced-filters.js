/**
 * Adapter stateful dos filtros avançados da lista de entregas.
 * A regra de negócio (matching, contagem, presets) vive em
 * lib/advanced-filters-helpers.js, pura e testada; aqui só fica o estado
 * ativo + a persistência dos presets no localStorage.
 */

import {
    defaultActiveFilters,
    applyAdvancedFilters,
    availableDistricts,
    extractDistrict,
    hasActiveFilters,
    countActiveFilters,
    setFilterValue,
    toggleArrayFilter,
    cloneFilters,
    loadSavedFilters,
    persistSavedFilters
} from '../../lib/advanced-filters-helpers.js';

const storage = () => {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
};

export class AdvancedFilters {
    constructor() {
        this.activeFilters = defaultActiveFilters();
        this.savedFilters = loadSavedFilters(storage());
    }

    /** Aplica todos os filtros ativos em uma lista de entregas. */
    applyFilters(deliveries) {
        return applyAdvancedFilters(deliveries, this.activeFilters);
    }

    /** Extrai o bairro de um endereço. */
    extractDistrict(address) {
        return extractDistrict(address);
    }

    /** Retorna lista única de bairros nas entregas. */
    getAvailableDistricts(deliveries) {
        return availableDistricts(deliveries);
    }

    /** Define um filtro. */
    setFilter(key, value) {
        setFilterValue(this.activeFilters, key, value);
    }

    /** Toggle de um valor em filtro array. */
    toggleArrayFilter(key, value) {
        toggleArrayFilter(this.activeFilters, key, value);
    }

    /** Limpa todos os filtros. */
    clearAll() {
        this.activeFilters = defaultActiveFilters();
    }

    /** Retorna se há algum filtro ativo. */
    hasActiveFilters() {
        return hasActiveFilters(this.activeFilters);
    }

    /** Conta quantos filtros estão ativos. */
    countActiveFilters() {
        return countActiveFilters(this.activeFilters);
    }

    /** Salva filtro atual como favorito. */
    saveCurrentAsPreset(name) {
        if (!name) return false;
        this.savedFilters[name] = cloneFilters(this.activeFilters);
        this.persistSavedFilters();
        return true;
    }

    /** Carrega um filtro salvo. */
    loadPreset(name) {
        if (name in this.savedFilters) {
            this.activeFilters = cloneFilters(this.savedFilters[name]);
            return true;
        }
        return false;
    }

    /** Remove um filtro salvo. */
    deletePreset(name) {
        if (name in this.savedFilters) {
            delete this.savedFilters[name];
            this.persistSavedFilters();
            return true;
        }
        return false;
    }

    /** Lista filtros salvos. */
    getPresets() {
        return Object.keys(this.savedFilters);
    }

    /** Carrega filtros salvos do localStorage. */
    loadSavedFilters() {
        return loadSavedFilters(storage());
    }

    /** Persiste filtros salvos no localStorage. */
    persistSavedFilters() {
        persistSavedFilters(storage(), this.savedFilters);
    }

    /** Exporta estado atual dos filtros. */
    exportState() {
        return cloneFilters(this.activeFilters);
    }

    /** Importa estado dos filtros. */
    importState(state) {
        this.activeFilters = cloneFilters(state);
    }
}

// Singleton instance
export const advancedFilters = new AdvancedFilters();
