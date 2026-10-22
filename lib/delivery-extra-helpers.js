'use strict';

/**
 * Helpers puros da ficha da parada (patch 22).
 *
 * A ficha ganhou campos de operação real: tipo (entrega/coleta), número do
 * pedido, complemento, ponto de referência e tempo estimado na parada.
 * Aqui ficam as regras que não dependem de DOM: normalização, totais,
 * duplicação e movimentação para o começo/fim da rota.
 */

const TIPOS = ['entrega', 'coleta'];
const EXTREMOS = ['primeira', 'ultima'];
const LIMITE_TEXTO = 120;

/** 'coleta' (ou variantes) → 'coleta'; qualquer outra coisa → 'entrega'. */
function normalizarTipo(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (v === 'coleta' || v === 'pickup' || v === 'retirada') return 'coleta';
  return 'entrega';
}

function tipoLabel(valor) {
  return normalizarTipo(valor) === 'coleta' ? 'Coleta' : 'Entrega';
}

/** Texto livre curto (complemento, referência, pedido): trim + limite. */
function normalizarCampoTexto(valor, limite = LIMITE_TEXTO) {
  const v = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  return v.length > limite ? v.slice(0, limite) : v;
}

/** Tempo estimado na parada, em minutos (0–240). undefined quando vazio. */
function normalizarTempoParada(valor) {
  if (valor === '' || valor == null) return undefined;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(240, Math.round(n));
}

/**
 * Total de pacotes da rota. Parada sem quantidade conta 1 (padrão do app),
 * valor inválido não vira NaN.
 * @param {Array<{pacotes?: number}>} deliveries
 */
function totalPacotes(deliveries) {
  return (Array.isArray(deliveries) ? deliveries : []).reduce((soma, d) => {
    const n = Number(d && d.pacotes);
    return soma + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
  }, 0);
}

/** Rótulos curtos para a lista e para o painel. */
function pedidoLabel(delivery) {
  const pedido = normalizarCampoTexto(delivery && delivery.pedido, 40);
  return pedido ? `Pedido ${pedido}` : '';
}

/**
 * Move uma parada para o começo ou para o fim da rota.
 * Devolve uma lista nova (não muta a original) com `routeOrder` renumerado 1..n.
 * @param {Array<any>} deliveries
 * @param {number|string} id
 * @param {'primeira'|'ultima'} extremo
 */
function moverParadaParaExtremo(deliveries, id, extremo) {
  const lista = Array.isArray(deliveries) ? deliveries.slice() : [];
  const alvo = String(extremo) === 'ultima' ? 'ultima' : 'primeira';
  const idx = lista.findIndex((d) => String(d && d.id) === String(id));
  if (idx === -1) return lista;
  const [parada] = lista.splice(idx, 1);
  if (alvo === 'primeira') lista.unshift(parada);
  else lista.push(parada);
  return lista.map((d, i) => {
    if (!d) return d;
    return { ...d, routeOrder: i + 1 };
  });
}

/**
 * Duplica uma parada como nova entrega pendente.
 * Fotos, cronômetro e status NÃO são copiados (cópia é uma parada nova).
 * @param {any} delivery
 * @param {{ id: number, sequentialId: string }} ids
 */
function duplicarParada(delivery, ids) {
  if (!delivery || !ids) return null;
  const copia = {
    id: ids.id,
    sequentialId: ids.sequentialId,
    nome: normalizarCampoTexto(delivery.nome) || 'Sem nome',
    endereco: normalizarCampoTexto(delivery.endereco, 200),
    telefones: Array.isArray(delivery.telefones) ? delivery.telefones.map((t) => ({ ...t })) : [],
    pacotes: Number.isFinite(Number(delivery.pacotes)) && Number(delivery.pacotes) > 0
      ? Math.floor(Number(delivery.pacotes))
      : 1,
    status: 'pendente',
    lat: delivery.lat,
    lng: delivery.lng,
    tipo: normalizarTipo(delivery.tipo)
  };
  if (delivery.notes) copia.notes = normalizarCampoTexto(delivery.notes, 300);
  if (delivery.complemento) copia.complemento = normalizarCampoTexto(delivery.complemento);
  if (delivery.referencia) copia.referencia = normalizarCampoTexto(delivery.referencia);
  if (delivery.pedido) copia.pedido = normalizarCampoTexto(delivery.pedido, 40);
  if (delivery.janelaInicio) copia.janelaInicio = delivery.janelaInicio;
  if (delivery.janelaFim) copia.janelaFim = delivery.janelaFim;
  if (Number.isFinite(Number(delivery.tempoParadaMin))) copia.tempoParadaMin = Number(delivery.tempoParadaMin);
  if (delivery.favorito) copia.favorito = true;
  return copia;
}

module.exports = {
  TIPOS,
  EXTREMOS,
  LIMITE_TEXTO,
  normalizarTipo,
  tipoLabel,
  normalizarCampoTexto,
  normalizarTempoParada,
  totalPacotes,
  pedidoLabel,
  moverParadaParaExtremo,
  duplicarParada
};
