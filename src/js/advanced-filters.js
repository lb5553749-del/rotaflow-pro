/**
 * Sistema de filtros avançados para lista de entregas
 * Permite filtrar por status, bairro, horário, etc.
 */

import { filterDeliveriesByText } from '../../lib/search-helpers.js';

export class AdvancedFilters {
    constructor() {
        this.activeFilters = {
            status: [], // ['pendente', 'entregue', 'falhou']
            search: '', // texto livre
            district: [], // bairros
            priority: null, // 'high', 'normal'
            hasPhotos: null, // true/false/null
            failReason: [] // motivos de falha
        };
        this.savedFilters = this.loadSavedFilters();
    }

    /**
     * Aplica todos os filtros ativos em uma lista de entregas
     */
    applyFilters(deliveries) {
        let filtered = [...deliveries];

        // Filtro de busca por texto
        if (this.activeFilters.search) {
            filtered = filterDeliveriesByText(filtered, this.activeFilters.search);
        }

        // Filtro por status
        if (this.activeFilters.status.length > 0) {
            filtered = filtered.filter(d =>
                this.activeFilters.status.includes(d.status)
            );
        }

        // Filtro por bairro
        if (this.activeFilters.district.length > 0) {
            filtered = filtered.filter(d => {
                const bairro = this.extractDistrict(d.endereco);
                return this.activeFilters.district.some(f =>
                    bairro.toLowerCase().includes(f.toLowerCase())
                );
            });
        }

        // Filtro por prioridade
        if (this.activeFilters.priority) {
            filtered = filtered.filter(d => {
                if (this.activeFilters.priority === 'high') {
                    return d.priority === true;
                }
                return !d.priority;
            });
        }

        // Filtro por fotos
        if (this.activeFilters.hasPhotos !== null) {
            filtered = filtered.filter(d => {
                const hasPhotos = (d.photos?.length || 0) > 0;
                return hasPhotos === this.activeFilters.hasPhotos;
            });
        }

        // Filtro por motivo de falha
        if (this.activeFilters.failReason.length > 0) {
            filtered = filtered.filter(d =>
                d.status === 'falhou' &&
                this.activeFilters.failReason.includes(d.failReason)
            );
        }

        return filtered;
    }

    /**
     * Extrai o bairro de um endereço
     */
    extractDistrict(address) {
        if (!address) return '';
        const parts = address.split(',');
        // Geralmente o bairro é a penúltima parte
        if (parts.length >= 2) {
            return parts[parts.length - 2].trim();
        }
        return '';
    }

    /**
     * Retorna lista única de bairros nas entregas
     */
    getAvailableDistricts(deliveries) {
        const districts = new Set();
        deliveries.forEach(d => {
            const district = this.extractDistrict(d.endereco);
            if (district) districts.add(district);
        });
        return Array.from(districts).sort();
    }

    /**
     * Define um filtro
     */
    setFilter(key, value) {
        if (key in this.activeFilters) {
            this.activeFilters[key] = value;
        }
    }

    /**
     * Toggle de um valor em filtro array
     */
    toggleArrayFilter(key, value) {
        if (!Array.isArray(this.activeFilters[key])) return;

        const idx = this.activeFilters[key].indexOf(value);
        if (idx >= 0) {
            this.activeFilters[key].splice(idx, 1);
        } else {
            this.activeFilters[key].push(value);
        }
    }

    /**
     * Limpa todos os filtros
     */
    clearAll() {
        this.activeFilters = {
            status: [],
            search: '',
            district: [],
            priority: null,
            hasPhotos: null,
            failReason: []
        };
    }

    /**
     * Retorna se há algum filtro ativo
     */
    hasActiveFilters() {
        return (
            this.activeFilters.search !== '' ||
            this.activeFilters.status.length > 0 ||
            this.activeFilters.district.length > 0 ||
            this.activeFilters.priority !== null ||
            this.activeFilters.hasPhotos !== null ||
            this.activeFilters.failReason.length > 0
        );
    }

    /**
     * Conta quantos filtros estão ativos
     */
    countActiveFilters() {
        let count = 0;
        if (this.activeFilters.search) count++;
        if (this.activeFilters.status.length > 0) count++;
        if (this.activeFilters.district.length > 0) count++;
        if (this.activeFilters.priority !== null) count++;
        if (this.activeFilters.hasPhotos !== null) count++;
        if (this.activeFilters.failReason.length > 0) count++;
        return count;
    }

    /**
     * Salva filtro atual como favorito
     */
    saveCurrentAsPreset(name) {
        if (!name) return false;
        this.savedFilters[name] = JSON.parse(JSON.stringify(this.activeFilters));
        this.persistSavedFilters();
        return true;
    }

    /**
     * Carrega um filtro salvo
     */
    loadPreset(name) {
        if (name in this.savedFilters) {
            this.activeFilters = JSON.parse(JSON.stringify(this.savedFilters[name]));
            return true;
        }
        return false;
    }

    /**
     * Remove um filtro salvo
     */
    deletePreset(name) {
        if (name in this.savedFilters) {
            delete this.savedFilters[name];
            this.persistSavedFilters();
            return true;
        }
        return false;
    }

    /**
     * Lista filtros salvos
     */
    getPresets() {
        return Object.keys(this.savedFilters);
    }

    /**
     * Carrega filtros salvos do localStorage
     */
    loadSavedFilters() {
        try {
            const saved = localStorage.getItem('rotaflow_saved_filters');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Erro ao carregar filtros salvos:', e);
            return {};
        }
    }

    /**
     * Persiste filtros salvos no localStorage
     */
    persistSavedFilters() {
        try {
            localStorage.setItem('rotaflow_saved_filters', JSON.stringify(this.savedFilters));
        } catch (e) {
            console.error('Erro ao salvar filtros:', e);
        }
    }

    /**
     * Exporta estado atual dos filtros
     */
    exportState() {
        return JSON.parse(JSON.stringify(this.activeFilters));
    }

    /**
     * Importa estado dos filtros
     */
    importState(state) {
        this.activeFilters = JSON.parse(JSON.stringify(state));
    }
}

// Singleton instance
export const advancedFilters = new AdvancedFilters();
