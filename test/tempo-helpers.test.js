'use strict';

/**
 * Cronômetro de entrega — testes do núcleo puro.
 * Tempo é a única coisa aqui que o motorista não pode corrigir depois: se a
 * conta erra, o resumo do dia mente. Por isso os casos de borda estão cobertos.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('../lib/tempo-helpers.js');
const { applyDeliveryStatusTransition } = require('../lib/delivery-status-helpers.js');

describe('iniciarCronometro', () => {
  it('grava o início uma única vez', () => {
    const d = { id: 1 };
    assert.equal(iniciarCronometro(d, 1000), true);
    assert.equal(d.iniciadaEm, 1000);
    assert.equal(iniciarCronometro(d, 5000), false, 'não reinicia ao reabrir');
    assert.equal(d.iniciadaEm, 1000);
  });

  it('ignora entrega nula', () => {
    assert.equal(iniciarCronometro(null, 1000), false);
  });
});

describe('pararCronometro', () => {
  it('grava fim e duração', () => {
    const d = { id: 1 };
    iniciarCronometro(d, 1000);
    assert.equal(pararCronometro(d, 1000 + 7 * MINUTO), true);
    assert.equal(d.duracaoMs, 7 * MINUTO);
    assert.equal(pararCronometro(d, 99999), false, 'não reescreve uma conclusão');
  });

  it('entrega marcada direto como entregue: duração 0, não undefined', () => {
    const d = { id: 2 };
    pararCronometro(d, 5000);
    assert.equal(d.duracaoMs, 0);
    assert.equal(d.iniciadaEm, 5000);
  });

  it('nunca gera duração negativa (relógio do aparelho voltou)', () => {
    const d = { id: 3, iniciadaEm: 10_000 };
    pararCronometro(d, 5_000);
    assert.equal(d.duracaoMs, 0);
  });
});

describe('reabrirCronometro', () => {
  it('apaga a conclusão e mantém o início', () => {
    const d = { id: 1, iniciadaEm: 1000 };
    pararCronometro(d, 1000 + MINUTO);
    assert.equal(reabrirCronometro(d), true);
    assert.equal(d.concluidaEm, undefined);
    assert.equal(d.duracaoMs, undefined);
    assert.equal(d.iniciadaEm, 1000, 'continua contando de onde parou');
  });

  it('sem conclusão não faz nada', () => {
    assert.equal(reabrirCronometro({ id: 1, iniciadaEm: 5 }), false);
  });
});

describe('integração com applyDeliveryStatusTransition', () => {
  it('em-rota abre, entregue fecha, pendente reabre', () => {
    const d = { id: 9, status: 'pendente' };
    applyDeliveryStatusTransition(d, 'em-rota', { agora: 10_000 });
    assert.equal(d.iniciadaEm, 10_000);
    assert.equal(d.duracaoMs, undefined);

    applyDeliveryStatusTransition(d, 'entregue', { agora: 10_000 + 12 * MINUTO });
    assert.equal(d.duracaoMs, 12 * MINUTO);
    assert.equal(d.concluidaEm, 10_000 + 12 * MINUTO);

    applyDeliveryStatusTransition(d, 'pendente');
    assert.equal(d.duracaoMs, undefined, 'undo não deixa tempo fantasma');
    assert.equal(d.iniciadaEm, 10_000, 'e o relógio volta a correr');
  });

  it('falhou também fecha o cronômetro', () => {
    const d = { id: 10, status: 'em-rota', iniciadaEm: 0 };
    applyDeliveryStatusTransition(d, 'falhou', { agora: 3 * MINUTO, failReason: 'ausente' });
    assert.equal(d.duracaoMs, 3 * MINUTO);
  });

  it('não interfere nos campos de notificação existentes', () => {
    // Regra do projeto: deliveredNotified SOBREVIVE enquanto o status é 'entregue'
    // (é o registro de "já avisei o cliente"); absentNotified só vive em 'falhou'.
    const d = { id: 11, status: 'em-rota', deliveredNotified: true, absentNotified: true };
    applyDeliveryStatusTransition(d, 'entregue', { agora: 1000 });
    assert.equal(d.deliveredNotified, true, 'preserva o aviso já enviado');
    assert.equal(d.absentNotified, undefined, 'aviso de ausência não sobrevive a entregue');
    assert.equal(d.duracaoMs, 0, 'e o cronômetro fecha mesmo assim');
  });
});

describe('duracaoDe', () => {
  it('usa a duração fechada quando existe', () => {
    assert.equal(duracaoDe({ duracaoMs: 500 }, 99999), 500);
  });

  it('conta até agora quando está correndo', () => {
    assert.equal(duracaoDe({ iniciadaEm: 1000 }, 61000), 60000);
  });

  it('devolve null sem início', () => {
    assert.equal(duracaoDe({}, 1000), null);
  });
});

describe('formatarDuracao', () => {
  it('segundos, minutos e horas', () => {
    assert.equal(formatarDuracao(45_000), '45 s');
    assert.equal(formatarDuracao(7 * MINUTO), '7 min');
    assert.equal(formatarDuracao(HORA + 4 * MINUTO), '1 h 04');
    assert.equal(formatarDuracao(2 * HORA), '2 h');
  });

  it('normaliza arredondamento em vez de mostrar 60 min', () => {
    assert.equal(formatarDuracao(HORA - 1), '1 h');
    assert.equal(formatarDuracao(2 * HORA + 59.7 * MINUTO), '3 h');
  });

  it('sem valor vira travessão', () => {
    assert.equal(formatarDuracao(null), '—');
    assert.equal(formatarDuracao(undefined), '—');
    assert.equal(formatarDuracao(-5), '—');
  });
});

describe('formatarCronometro', () => {
  it('mm:ss e h:mm:ss', () => {
    assert.equal(formatarCronometro(0), '00:00');
    assert.equal(formatarCronometro(7 * MINUTO + 32_000), '07:32');
    assert.equal(formatarCronometro(HORA + 4 * MINUTO + 12_000), '1:04:12');
  });

  it('arredonda para baixo (não adianta o relógio)', () => {
    assert.equal(formatarCronometro(59_999), '00:59');
  });

  it('valor inválido não quebra a tela', () => {
    assert.equal(formatarCronometro(null), '00:00');
    assert.equal(formatarCronometro(-1), '00:00');
  });
});

describe('resumoDoDia', () => {
  const base = () => ([
    { id: 1, sequentialId: 1, nome: 'Ana', status: 'entregue', iniciadaEm: 0, concluidaEm: 10 * MINUTO, duracaoMs: 10 * MINUTO },
    { id: 2, sequentialId: 2, nome: 'Bruno', status: 'entregue', iniciadaEm: 10 * MINUTO, concluidaEm: 30 * MINUTO, duracaoMs: 20 * MINUTO },
    { id: 3, sequentialId: 3, nome: 'Carla', status: 'em-rota', iniciadaEm: 30 * MINUTO },
    { id: 4, sequentialId: 4, nome: 'Dora', status: 'pendente' }
  ]);

  it('soma e calcula a média só das concluídas', () => {
    const r = resumoDoDia(base(), 40 * MINUTO);
    assert.equal(r.concluidas, 2);
    assert.equal(r.totalMs, 30 * MINUTO);
    assert.equal(r.mediaMs, 15 * MINUTO);
  });

  it('separa o que está em andamento (não contamina a média)', () => {
    const r = resumoDoDia(base(), 40 * MINUTO);
    assert.equal(r.emAndamento.length, 1);
    assert.equal(r.emAndamento[0].duracaoMs, 10 * MINUTO);
    assert.equal(r.mediaMs, 15 * MINUTO, 'a Carla não entra na média');
  });

  it('aponta mais rápida e mais lenta', () => {
    const r = resumoDoDia(base(), 40 * MINUTO);
    assert.equal(r.maisRapida.nome, 'Ana');
    assert.equal(r.maisLenta.nome, 'Bruno');
  });

  it('tempo de rua vai do primeiro início ao último fim/agora', () => {
    assert.equal(resumoDoDia(base(), 40 * MINUTO).tempoDeRua, 40 * MINUTO);
    const soConcluidas = base().filter((d) => d.id !== 3);
    assert.equal(resumoDoDia(soConcluidas, 99 * MINUTO).tempoDeRua, 30 * MINUTO);
  });

  it('resiste a lista vazia, null e entrega sem cronômetro', () => {
    for (const entrada of [[], null, undefined, [{ id: 1, status: 'pendente' }]]) {
      const r = resumoDoDia(entrada, 1000);
      assert.equal(r.concluidas, 0);
      assert.equal(r.totalMs, 0);
      assert.equal(r.mediaMs, null);
      assert.equal(r.tempoDeRua, null);
      assert.deepEqual(r.itens, []);
    }
  });

  it('ignora itens nulos no meio da lista (import antigo)', () => {
    const r = resumoDoDia([null, base()[0]], 0);
    assert.equal(r.concluidas, 1);
  });

  it('ordem do resumo preserva a ordem da rota', () => {
    const r = resumoDoDia(base(), 40 * MINUTO);
    assert.deepEqual(r.itens.map((i) => i.nome), ['Ana', 'Bruno']);
  });
});

describe('formatarHora', () => {
  it('hora local com dois dígitos', () => {
    const d = new Date(2026, 9, 20, 14, 7);
    assert.equal(formatarHora(d.getTime()), '14:07');
    assert.equal(formatarHora(null), '—');
  });
});
