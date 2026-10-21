/**
 * Sugestões do campo "Endereço completo" (patch 20).
 *
 * Motivo: o widget antigo `google.maps.places.Autocomplete` foi descontinuado
 * para contas novas (março/2025) — na prática o campo ficou sem sugestão.
 * Aqui montamos a lista em duas camadas:
 *   1. endereços que o motorista já usou (rota, agenda e histórico) — aparecem
 *      na hora e funcionam sem internet;
 *   2. Google: Places API nova (`AutocompleteSuggestion`) quando existir e,
 *      se ela não estiver disponível, o Geocoder (já usado pelo formulário).
 * O ranking fica em lib/address-suggest-helpers.js (testado sem DOM).
 */
import { rankLocalAddresses, mergeAddressSuggestions, normalizeAddressText } from '../../lib/address-suggest-helpers.js';
import { escapeHtml } from '../../lib/html.js';

let deps = {
    getDeliveries: () => [],
    getAgenda: () => [],
    getHistory: () => [],
    getGeocoder: () => null,
    showToast: () => {}
};

export function configureAddressSuggestions(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let iniciado = false;
let timer = null;
let sequencia = 0;
let sessaoPlaces = null;
// Enquanto o app preenche o campo (escolher sugestão), não reabrir a busca.
let suprimindo = false;

function elementos() {
    return {
        input: document.getElementById('address'),
        lista: document.getElementById('addressSuggestions')
    };
}

/** Coleta os endereços conhecidos de rota, agenda e histórico. */
function enderecosConhecidos() {
    const out = [];
    const empurrar = (list, origem) => {
        for (const item of Array.isArray(list) ? list : []) {
            if (item && typeof item.endereco === 'string' && item.endereco.trim()) {
                out.push({ endereco: item.endereco, nome: item.nome || '', origem });
            }
        }
    };
    empurrar(deps.getDeliveries(), 'rota');
    empurrar(deps.getAgenda(), 'agenda');
    empurrar(deps.getHistory(), 'historico');
    return out;
}

/** Places API nova (recomendada desde 2025). Retorna [] quando indisponível. */
async function sugerirViaPlaces(query) {
    const places = window.google && window.google.maps && window.google.maps.places;
    if (!places || !places.AutocompleteSuggestion || typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions !== 'function') {
        return [];
    }
    if (places.AutocompleteSessionToken && !sessaoPlaces) {
        try { sessaoPlaces = new places.AutocompleteSessionToken(); } catch (_) { sessaoPlaces = null; }
    }
    const req = {
        input: query,
        includedRegionCodes: ['br'],
        language: 'pt-BR',
        locationBias: { center: { lat: -8.7619, lng: -63.9039 }, radius: 25000 }
    };
    if (sessaoPlaces) req.sessionToken = sessaoPlaces;
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
    return (suggestions || [])
        .map((s) => s.placePrediction && s.placePrediction.text && s.placePrediction.text.text)
        .filter(Boolean)
        .map((endereco) => ({ endereco }));
}

/** Reserva: Geocoder (endpoint que o app já usa para salvar a entrega). */
function sugerirViaGeocoder(query, aoChegar) {
    const geocoder = deps.getGeocoder();
    if (!geocoder || typeof geocoder.geocode !== 'function') return;
    try {
        geocoder.geocode({ address: `${query}, Porto Velho - RO`, componentRestrictions: { country: 'br' } }, (res, status) => {
            if (status !== 'OK' || !Array.isArray(res)) return;
            // Descarta o que não tem nada a ver com o que foi digitado (o Geocoder
            // devolve "Porto Velho - RO" para qualquer coisa quando não acha a rua).
            const pista = normalizeAddressText(query).split(' ')[0] || '';
            const bons = res
                .map((r) => (r && r.formatted_address) || '')
                .filter((end) => end && normalizeAddressText(end).includes(pista))
                .slice(0, 5);
            if (bons.length) aoChegar(bons.map((endereco) => ({ endereco })));
        });
    } catch (_) { /* sem rede/API: segue só com as locais */ }
}

function esconder() {
    const { lista } = elementos();
    if (!lista) return;
    lista.innerHTML = '';
    lista.hidden = true;
    lista.style.display = 'none';
}

function renderizar(sugestoes, query) {
    const { lista, input } = elementos();
    if (!lista || !input) return;
    if (!sugestoes.length) { esconder(); return; }

    const rotulo = { rota: 'Na rota', agenda: 'Agenda', historico: 'Histórico', google: 'Google' };
    lista.innerHTML = sugestoes.map((s, i) => `
        <button type="button" class="address-suggestion" role="option" data-index="${i}" data-endereco="${escapeHtml(s.endereco)}">
            <i class="fas fa-location-dot" aria-hidden="true"></i>
            <span class="address-suggestion-text">${escapeHtml(s.endereco)}</span>
            ${s.origem && rotulo[s.origem] ? `<span class="address-suggestion-badge">${rotulo[s.origem]}</span>` : ''}
        </button>`).join('');
    lista.hidden = false;
    lista.style.display = 'block';
    lista.dataset.count = String(sugestoes.length);
    lista.dataset.query = query;
}

/** Escolhe uma sugestão: preenche o campo e avisa o resto do formulário. */
export function escolherSugestaoDeEndereco(endereco) {
    const { input } = elementos();
    if (!input || !endereco) return;
    suprimindo = true;
    input.value = endereco;
    input.classList.remove('duplicate');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    esconder();
    input.focus({ preventScroll: true });
    setTimeout(() => { suprimindo = false; }, 500);
}

async function buscar(query) {
    const minha = ++sequencia;
    const locais = rankLocalAddresses(enderecosConhecidos(), query, { limit: 4, minChars: 2 });
    // as locais aparecem na hora; o Google completa depois
    renderizar(locais, query);

    let remotas = [];
    try {
        remotas = await sugerirViaPlaces(query);
    } catch (_) {
        remotas = [];
    }
    if (minha !== sequencia) return; // resposta velha: descarta
    if (!remotas.length) {
        sugerirViaGeocoder(query, (res) => {
            if (minha !== sequencia) return;
            renderizar(mergeAddressSuggestions(locais, res, 5), query);
        });
        return;
    }
    renderizar(mergeAddressSuggestions(locais, remotas, 5), query);
}

export function initAddressSuggestions() {
    if (iniciado) return;
    const { input, lista } = elementos();
    if (!input || !lista) return;
    iniciado = true;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'addressSuggestions');

    input.addEventListener('input', () => {
        if (suprimindo) { esconder(); return; }
        const query = input.value.trim();
        clearTimeout(timer);
        if (query.length < 2) { esconder(); return; }
        timer = setTimeout(() => { buscar(query); }, 280);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { esconder(); return; }
        if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const botoes = [...lista.querySelectorAll('.address-suggestion')];
        if (!botoes.length) return;
        const atual = botoes.findIndex((b) => b === document.activeElement);
        if (e.key === 'Enter' && atual >= 0) {
            e.preventDefault();
            escolherSugestaoDeEndereco(botoes[atual].dataset.endereco);
            return;
        }
        e.preventDefault();
        const proximo = e.key === 'ArrowDown'
            ? (atual + 1) % botoes.length
            : (atual <= 0 ? botoes.length - 1 : atual - 1);
        botoes[proximo].focus();
    });

    // toque/mouse na sugestão (mousedown evita perder o foco antes do clique)
    lista.addEventListener('mousedown', (e) => e.preventDefault());
    lista.addEventListener('click', (e) => {
        const alvo = e.target.closest('.address-suggestion');
        if (!alvo) return;
        e.preventDefault();
        escolherSugestaoDeEndereco(alvo.dataset.endereco);
    });

    input.addEventListener('blur', () => {
        // some sem atrapalhar o toque na própria lista
        setTimeout(esconder, 180);
    });
    input.addEventListener('focus', () => {
        input.setAttribute('aria-expanded', 'true');
    });

    // trocar de aba ou limpar o formulário esconde a lista
    document.querySelectorAll('.sidebar-tabs button').forEach((btn) => {
        btn.addEventListener('click', esconder);
    });
}

/** Exposto para o resto do app/testes: fecha a lista. */
export function fecharSugestoesDeEndereco() {
    esconder();
}
