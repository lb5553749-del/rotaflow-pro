'use strict';
// @ts-check

/**
 * Cronômetro de entrega e resumo do dia.
 *
 * Regras (o motorista não aperta "iniciar": o relógio segue o status):
 *  - `em-rota`     → grava `iniciadaEm` (uma vez só, não reinicia ao reabrir);
 *  - `entregue`/`falhou` → grava `concluidaEm` e `duracaoMs`;
 *  - voltar para `pendente` → apaga a conclusão e MANTÉM o início, para o
 *    tempo continuar correndo se o motorista desfizer por engano.
 *
 * Tudo puro: recebe `agora` por parâmetro (testável, sem Date.now escondido).
 */

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;

/** @returns {number} agora em ms (Date.now, isolado para testes) */
function agoraMs() {
  return Date.now();
}

/**
 * Marca o início do atendimento, se ainda não houver.
 * @param {Delivery} delivery
 * @param {number} [agora]
 * @returns {boolean} true se gravou algo novo
 */
function iniciarCronometro(delivery, agora = agoraMs()) {
  if (!delivery) return false;
  if (Number.isFinite(delivery.iniciadaEm)) return false;
  delivery.iniciadaEm = agora;
  return true;
}

/**
 * Fecha o atendimento: grava `concluidaEm` e `duracaoMs`.
 * Sem `iniciadaEm` (entrega marcada direto como entregue), assume início = agora,
 * então a duração é 0 em vez de undefined — melhor zero honesto do que null.
 * @param {Delivery} delivery
 * @param {number} [agora]
 * @returns {boolean} true se gravou algo novo
 */
function pararCronometro(delivery, agora = agoraMs()) {
  if (!delivery) return false;
  if (Number.isFinite(delivery.concluidaEm)) return false;
  if (!Number.isFinite(delivery.iniciadaEm)) delivery.iniciadaEm = agora;
  delivery.concluidaEm = agora;
  delivery.duracaoMs = Math.max(0, agora - delivery.iniciadaEm);
  return true;
}

/**
 * Reabre o atendimento (undo de entregue/falhou): apaga a conclusão e mantém o
 * início, para o cronômetro voltar a correr de onde parou.
 * @param {Delivery} delivery
 * @returns {boolean} true se havia conclusão para apagar
 */
function reabrirCronometro(delivery) {
  if (!delivery) return false;
  const tinha = Number.isFinite(delivery.concluidaEm) || Number.isFinite(delivery.duracaoMs);
  delete delivery.concluidaEm;
  delete delivery.duracaoMs;
  return tinha;
}

/**
 * Duração de uma entrega. Para a que está em andamento, conta até `agora`.
 * @param {Delivery} delivery
 * @param {number} [agora]
 * @returns {number|null} ms, ou null se nunca foi iniciada
 */
function duracaoDe(delivery, agora = agoraMs()) {
  if (!delivery) return null;
  if (Number.isFinite(delivery.duracaoMs)) return delivery.duracaoMs;
  if (Number.isFinite(delivery.iniciadaEm)) return Math.max(0, agora - delivery.iniciadaEm);
  return null;
}

/**
 * Formata duração curta, para caber em uma linha de lista: "45 s", "7 min", "1 h 04".
 * @param {number|null|undefined} ms
 * @returns {string} "—" quando não há tempo
 */
function formatarDuracao(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < MINUTO) return `${Math.max(0, Math.round(ms / SEGUNDO))} s`;
  if (ms < HORA) {
    const min = Math.round(ms / MINUTO);
    // 59 min 40 s arredonda para 60: virar hora evita o "60 min" na tela
    if (min < 60) return `${min} min`;
  }
  const h = Math.floor(ms / HORA);
  const m = Math.round((ms % HORA) / MINUTO);
  // 2h59m59s arredonda para 3h00 — normaliza em vez de mostrar "2 h 60"
  if (m === 60) return `${h + 1} h`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/**
 * Formato cronômetro para o tempo que está correndo: "07:32" ou "1:04:12".
 * @param {number|null|undefined} ms
 * @returns {string}
 */
function formatarCronometro(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeg = Math.floor(ms / SEGUNDO);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Hora curta local: "14:07".
 * @param {number|null|undefined} ts
 * @returns {string}
 */
function formatarHora(ts) {
  if (!Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Resumo do dia: por entrega, total, média, mais rápida e mais lenta.
 *
 * Considera concluídas (entregue/falhou com cronômetro fechado) para as médias,
 * e reporta separadamente o que ainda está correndo — misturar os dois num
 * "total do dia" daria número que muda sozinho a cada segundo.
 *
 * @param {Array<Delivery>} deliveries
 * @param {number} [agora]
 */
function resumoDoDia(deliveries, agora = agoraMs()) {
  const lista = Array.isArray(deliveries) ? deliveries.filter(Boolean) : /** @type {Delivery[]} */ ([]);
  const itens = [];
  const emAndamento = [];
  let totalMs = 0;
  let maisRapida = null;
  let maisLenta = null;

  for (const d of lista) {
    const dur = duracaoDe(d, agora);
    if (dur === null) continue;
    const concluida = Number.isFinite(d.duracaoMs);
    const item = {
      id: d.id,
      sequentialId: d.sequentialId,
      nome: d.nome || '',
      status: d.status,
      iniciadaEm: Number.isFinite(d.iniciadaEm) ? d.iniciadaEm : null,
      concluidaEm: Number.isFinite(d.concluidaEm) ? d.concluidaEm : null,
      duracaoMs: dur,
      concluida
    };
    if (concluida) {
      itens.push(item);
      totalMs += dur;
      if (!maisRapida || dur < maisRapida.duracaoMs) maisRapida = item;
      if (!maisLenta || dur > maisLenta.duracaoMs) maisLenta = item;
    } else {
      emAndamento.push(item);
    }
  }

  const concluidas = itens.length;
  const inicios = lista.map((d) => d.iniciadaEm).filter(Number.isFinite);
  const fins = lista.map((d) => d.concluidaEm).filter(Number.isFinite);

  return {
    concluidas,
    emAndamento,
    totalMs,
    mediaMs: concluidas ? Math.round(totalMs / concluidas) : null,
    maisRapida,
    maisLenta,
    itens,
    /** janela do dia: do primeiro início ao último fim (null se não houve nada) */
    janela: inicios.length
      ? { inicio: Math.min(...inicios), fim: fins.length ? Math.max(...fins) : null }
      : null,
    /**
     * Tempo de relógio: do primeiro início até AGORA enquanto houver entrega em
     * andamento (o dia não acabou), ou até o último fim quando tudo fechou.
     */
    tempoDeRua:
      inicios.length
        ? Math.max(
            0,
            (emAndamento.length ? agora : Math.max(...fins)) - Math.min(...inicios)
          )
        : null
  };
}

module.exports = {
  SEGUNDO,
  MINUTO,
  HORA,
  iniciarCronometro,
  pararCronometro,
  reabrirCronometro,
  duracaoDe,
  formatarDuracao,
  formatarCronometro,
  formatarHora,
  resumoDoDia
};
