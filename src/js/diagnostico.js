/**
 * Diagnóstico no aparelho (patch 21).
 *
 * Motivo: "o mapa não funciona" e "a sugestão de endereço não funciona" são
 * sintomas que dependem de coisas invisíveis no celular (chave do Google presa
 * por SHA-1/pacote, origem do WebView, cache antigo). Em vez de adivinhar, este
 * módulo mostra na tela tudo o que a investigação precisa, com um botão de
 * copiar — e guarda o erro de autenticação do Google Maps quando ele acontece.
 *
 * Abrir: toque longo (600 ms) na etiqueta "Salvo no aparelho".
 */

import { rankLocalAddresses } from '../../lib/address-suggest-helpers.js';

const CHAVE_FORCAR_MAPA_WEB = 'rotaflow_forcar_mapa_web';
const LIMITE_ERROS = 12;

const estado = {
    erros: [],
    authFailure: null,
    ultimaSugestao: null
};

/** SHA-1 da chave de teste usada nos APKs desta série (para liberar no Google). */
export const SHA1_CHAVE_TESTE = '65:DB:C0:4B:53:41:37:8C:15:4A:6B:A3:5C:42:90:A2:3F:0E:45:F9';

export function registrarErro(origem, mensagem) {
    const texto = `${origem}: ${String(mensagem || '').slice(0, 180)}`;
    estado.erros.push(`${new Date().toISOString().slice(11, 19)} ${texto}`);
    if (estado.erros.length > LIMITE_ERROS) estado.erros.shift();
    return texto;
}

/** Chamado pelo Google Maps quando a chave é recusada. */
export function registrarAuthFailure() {
    estado.authFailure = 'google.maps recusou a chave (gm_authFailure) — veja o erro exato no console';
}

export function definirUltimaSugestao(query, quantidade) {
    estado.ultimaSugestao = { query, quantidade, quando: Date.now() };
}

function coletar(deps) {
    let gmaps = 'não carregado';
    try {
        if (window.google && window.google.maps) {
            gmaps = window.google.maps.places && window.google.maps.places.AutocompleteSuggestion
                ? 'carregado (Places novo disponível)'
                : 'carregado (biblioteca places ainda não importada)';
        }
    } catch (_) { gmaps = 'erro ao inspecionar'; }

    const conhecidos = (() => {
        try {
            const d = deps.getDeliveries() || [];
            const a = deps.getAgenda() || [];
            const h = deps.getHistory() || [];
            return { rota: d.length, agenda: a.length, historico: h.length };
        } catch (_) { return { rota: -1, agenda: -1, historico: -1 }; }
    })();

    const nativo = (() => {
        try { return deps.isNativeApp() ? 'sim' : 'não'; } catch (_) { return '?'; }
    })();

    let cache = 'n/d';
    try {
        cache = navigator.serviceWorker && navigator.serviceWorker.controller
            ? navigator.serviceWorker.controller.scriptURL.split('/').pop()
            : 'sem service worker';
    } catch (_) { cache = 'erro'; }

    return {
        'Origem (WebView)': location.origin,
        'App nativo (Capacitor)': nativo,
        'Google Maps JS': gmaps,
        'Erro de chave do Maps': estado.authFailure || 'nenhum',
        'Mapa forçado na web': localStorage.getItem(CHAVE_FORCAR_MAPA_WEB) === '1' ? 'sim' : 'não',
        'Service worker': cache,
        'Endereços conhecidos': `${conhecidos.rota} na rota · ${conhecidos.agenda} na agenda · ${conhecidos.historico} no histórico`,
        'Última busca de endereço': estado.ultimaSugestao
            ? `"${estado.ultimaSugestao.query}" → ${estado.ultimaSugestao.quantidade} sugestão(ões)`
            : 'nenhuma ainda',
        'SHA-1 desta instalação': SHA1_CHAVE_TESTE,
        'Navegador': navigator.userAgent.slice(0, 110)
    };
}

function montarPainel(deps) {
    const antigo = document.getElementById('diagPanel');
    if (antigo) antigo.remove();

    const info = coletar(deps);
    const linhas = Object.entries(info)
        .map(([k, v]) => `<div class="diag-row"><span class="diag-key">${k}</span><span class="diag-val">${String(v)}</span></div>`)
        .join('');
    const erros = estado.erros.length
        ? estado.erros.map((e) => `<div class="diag-err">${e}</div>`).join('')
        : '<div class="diag-err">nenhum erro capturado</div>';

    const painel = document.createElement('div');
    painel.id = 'diagPanel';
    painel.className = 'diag-overlay';
    painel.innerHTML = `
        <div class="diag-card" role="dialog" aria-label="Diagnóstico do app">
            <div class="diag-head">
                <strong>Diagnóstico</strong>
                <button type="button" class="diag-close" id="diagClose" aria-label="Fechar">✕</button>
            </div>
            <div class="diag-body">
                ${linhas}
                <div class="diag-sec">Erros recentes</div>
                ${erros}
            </div>
            <div class="diag-actions">
                <button type="button" id="diagTestar">Testar sugestões</button>
                <button type="button" id="diagCopiar">Copiar</button>
                <button type="button" id="diagMapaWeb">${info['Mapa forçado na web'] === 'sim' ? 'Voltar ao mapa nativo' : 'Usar mapa da web'}</button>
            </div>
        </div>`;
    document.body.appendChild(painel);

    painel.querySelector('#diagClose').addEventListener('click', () => painel.remove());
    painel.addEventListener('click', (e) => { if (e.target === painel) painel.remove(); });

    painel.querySelector('#diagTestar').addEventListener('click', async () => {
        const campo = document.getElementById('address');
        const query = (campo && campo.value ? campo.value : '').trim() || 'rua';
        let texto = '';
        try {
            const todas = [
                ...(deps.getDeliveries() || []),
                ...(deps.getAgenda() || []),
                ...(deps.getHistory() || [])
            ];
            const achadas = rankLocalAddresses(todas, query, { limit: 5, minChars: 2 });
            texto = `"${query}" → ${achadas.length} local(is)${achadas[0] ? ': ' + achadas[0].endereco : ''}`;
        } catch (e) {
            texto = 'erro no teste: ' + String(e && e.message).slice(0, 80);
        }
        EstadoTeste(texto);
    });

    painel.querySelector('#diagCopiar').addEventListener('click', async () => {
        const texto = [
            'RotaFlow — diagnóstico',
            ...Object.entries(info).map(([k, v]) => `${k}: ${v}`),
            'Erros:',
            ...(estado.erros.length ? estado.erros : ['nenhum'])
        ].join('\n');
        try {
            await navigator.clipboard.writeText(texto);
            document.getElementById('diagTeste').textContent = 'Copiado!';
        } catch (_) {
            // WebView antigo sem clipboard: seleciona o texto para copiar à mão
            const faixa = document.createElement('textarea');
            faixa.value = texto;
            document.body.appendChild(faixa);
            faixa.select();
            document.execCommand('copy');
            faixa.remove();
            document.getElementById('diagTeste').textContent = 'Copiado!';
        }
    });

    painel.querySelector('#diagMapaWeb').addEventListener('click', () => {
        const forcar = localStorage.getItem(CHAVE_FORCAR_MAPA_WEB) === '1';
        if (forcar) localStorage.removeItem(CHAVE_FORCAR_MAPA_WEB);
        else localStorage.setItem(CHAVE_FORCAR_MAPA_WEB, '1');
        location.reload();
    });
}

/** Mostra o resultado do teste na própria linha de ações. */
function EstadoTeste(texto) {
    const alvo = document.getElementById('diagTeste') || (() => {
        const div = document.createElement('div');
        div.id = 'diagTeste';
        div.className = 'diag-teste';
        document.querySelector('.diag-card .diag-actions')?.before(div);
        return div;
    })();
    alvo.textContent = texto;
}

/** Long-press na etiqueta de sincronização abre o painel. */
export function initDiagnostico(deps = {}) {
    if (document.documentElement.dataset.diagOn === 'on') return;
    document.documentElement.dataset.diagOn = 'on';

    window.addEventListener('error', (e) => registrarErro('erro', e.message));
    window.addEventListener('unhandledrejection', (e) => registrarErro('promise', e.reason && e.reason.message ? e.reason.message : e.reason));
    window.gm_authFailure = () => {
        registrarAuthFailure();
        // marca para a próxima abertura já subir com o mapa da web
        try { localStorage.setItem(CHAVE_FORCAR_MAPA_WEB, '1'); } catch (_) {}
        deps.showToast?.('Google Maps recusou a chave do mapa — toque longo em "Salvo no aparelho" para ver o diagnóstico', true);
    };

    const alvo = document.getElementById('syncStatus') || document.querySelector('.sync-status');
    if (!alvo) return;
    let timer = null;
    const comecar = () => { timer = setTimeout(() => montarPainel(deps), 600); };
    const cancelar = () => { if (timer) { clearTimeout(timer); timer = null; } };
    alvo.addEventListener('touchstart', comecar, { passive: true });
    alvo.addEventListener('touchend', cancelar);
    alvo.addEventListener('touchmove', cancelar);
    alvo.addEventListener('mousedown', comecar);
    alvo.addEventListener('mouseup', cancelar);
    alvo.addEventListener('mouseleave', cancelar);
}

export function mapaWebForcado() {
    try { return localStorage.getItem(CHAVE_FORCAR_MAPA_WEB) === '1'; } catch (_) { return false; }
}

export function abrirDiagnostico(deps) {
    montarPainel(deps);
}
