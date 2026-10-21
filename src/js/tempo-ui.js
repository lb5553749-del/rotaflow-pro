/**
 * Cronômetro de entrega na interface: ticker do tempo em andamento e o
 * "Resumo do dia" (quanto tempo cada entrega levou e o total da rota).
 *
 * O dado bruto vem de lib/tempo-helpers.js; aqui é só DOM.
 */
import {
    formatarCronometro,
    formatarDuracao,
    formatarHora,
    resumoDoDia
} from '../../lib/tempo-helpers.js';

let deps = {
    getDeliveries: () => []
};

export function configureTempoUi(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let tickerId = null;

/**
 * Atualiza, a cada segundo (só com a aba visível), os cronômetros em andamento
 * marcados com `[data-tempo-inicio]`. Não re-renderiza lista: mexe só no texto
 * de quem já está na tela — barato mesmo com lista longa.
 */
export function iniciarTickerDeTempo() {
    if (tickerId) return;
    const passo = () => {
        if (document.hidden) return;
        const agora = Date.now();
        document.querySelectorAll('[data-tempo-inicio]').forEach((el) => {
            const inicio = Number(el.getAttribute('data-tempo-inicio'));
            if (!Number.isFinite(inicio)) return;
            const alvo = el.querySelector('b') || el;
            const texto = formatarCronometro(agora - inicio);
            if (alvo.textContent !== texto) alvo.textContent = texto;
        });
    };
    tickerId = setInterval(passo, 1000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) passo();
    });
    passo();
}

export function pararTickerDeTempo() {
    if (tickerId) clearInterval(tickerId);
    tickerId = null;
}

function linhaHtml(item) {
    const cls = item.concluida ? `st-${item.status === 'falhou' ? 'falhou' : 'ok'}` : 'st-andamento';
    const horario = item.iniciadaEm
        ? `${formatarHora(item.iniciadaEm)}${item.concluidaEm ? ' → ' + formatarHora(item.concluidaEm) : ' → agora'}`
        : '—';
    return `<li class="tempo-linha ${cls}">
        <span class="tempo-num">${item.sequentialId}</span>
        <span class="tempo-quem">
            <b>${escapeHtml(item.nome || 'Sem nome')}</b>
            <span>${horario}</span>
        </span>
        <span class="tempo-val">${item.concluida ? formatarDuracao(item.duracaoMs) : formatarCronometro(item.duracaoMs)}</span>
    </li>`;
}

function escapeHtml(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Abre o painel "Resumo do dia": total, média, mais rápida, mais lenta e a
 * lista de todas as entregas com hora de início, fim e duração.
 */
export function abrirResumoDoDia(deliveries = deps.getDeliveries()) {
    document.getElementById('resumoDiaOverlay')?.remove();
    const r = resumoDoDia(deliveries, Date.now());

    const semDados = !r.concluidas && !r.emAndamento.length;
    const corpo = semDados
        ? `<p class="tempo-vazio">Nenhuma entrega marcada como <b>Em rota</b> ainda.
             O cronômetro começa quando a entrega entra em rota e para quando ela é
             marcada como entregue ou falhou.</p>`
        : `
        <div class="tempo-cards">
            <div class="tempo-card destaque">
                <span>Total em entregas</span>
                <b>${formatarDuracao(r.totalMs)}</b>
            </div>
            <div class="tempo-card">
                <span>Média por entrega</span>
                <b>${r.mediaMs === null ? '—' : formatarDuracao(r.mediaMs)}</b>
            </div>
            <div class="tempo-card">
                <span>Tempo de rua</span>
                <b>${r.tempoDeRua === null ? '—' : formatarDuracao(r.tempoDeRua)}</b>
            </div>
            <div class="tempo-card">
                <span>Concluídas</span>
                <b>${r.concluidas}${r.emAndamento.length ? ` +${r.emAndamento.length}` : ''}</b>
            </div>
        </div>
        ${r.maisRapida && r.maisLenta ? `<p class="tempo-extremos">
            Mais rápida: <b>${escapeHtml(r.maisRapida.nome)}</b> (${formatarDuracao(r.maisRapida.duracaoMs)}) ·
            Mais demorada: <b>${escapeHtml(r.maisLenta.nome)}</b> (${formatarDuracao(r.maisLenta.duracaoMs)})
        </p>` : ''}
        <ul class="tempo-lista">
            ${r.emAndamento.map(linhaHtml).join('')}
            ${r.itens.map(linhaHtml).join('')}
        </ul>`;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'resumoDiaOverlay';
    overlay.innerHTML = `
        <div class="modal-container tempo-modal" role="dialog" aria-modal="true" aria-labelledby="tempoTitulo">
            <h3 id="tempoTitulo"><i class="fas fa-stopwatch"></i> Resumo do dia</h3>
            ${corpo}
            <div class="tempo-acoes">
                <button type="button" class="btn-secondary" id="tempoFechar">Fechar</button>
            </div>
        </div>`;

    const fechar = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    document.body.appendChild(overlay);
    overlay.querySelector('#tempoFechar')?.addEventListener('click', fechar);
    overlay.querySelector('#tempoFechar')?.focus();
    return overlay;
}
