'use strict';

/**
 * Ficha da parada: tipo, pedido, complemento, tempo na parada, total de
 * pacotes, duplicação e movimentação para o começo/fim da rota (patch 22).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizarTipo,
    tipoLabel,
    normalizarCampoTexto,
    normalizarTempoParada,
    totalPacotes,
    pedidoLabel,
    moverParadaParaExtremo,
    duplicarParada
} = require('../lib/delivery-extra-helpers');

describe('tipo da parada', () => {
    it('aceita coleta nas variações que o motorista pode digitar', () => {
        ['coleta', 'COLETA', ' retirada ', 'pickup'].forEach((v) => {
            assert.equal(normalizarTipo(v), 'coleta');
        });
    });

    it('qualquer outra coisa é entrega (padrão do app)', () => {
        [undefined, null, '', 'entrega', 'xyz'].forEach((v) => {
            assert.equal(normalizarTipo(v), 'entrega');
        });
    });

    it('tem rótulo para a interface', () => {
        assert.equal(tipoLabel('coleta'), 'Coleta');
        assert.equal(tipoLabel(undefined), 'Entrega');
    });
});

describe('normalizarCampoTexto', () => {
    it('junta espaços e apara as pontas', () => {
        assert.equal(normalizarCampoTexto('  Casa  2  '), 'Casa 2');
    });
    it('corta no limite para não estourar a ficha', () => {
        assert.equal(normalizarCampoTexto('a'.repeat(200), 10).length, 10);
    });
    it('vazio vira string vazia', () => {
        assert.equal(normalizarCampoTexto(null), '');
    });
});

describe('normalizarTempoParada', () => {
    it('aceita inteiro de 1 a 240 minutos', () => {
        assert.equal(normalizarTempoParada('5'), 5);
        assert.equal(normalizarTempoParada('2,5'), 3);
        assert.equal(normalizarTempoParada('999'), 240);
    });
    it('vazio, zero ou lixo viram undefined', () => {
        [ '', null, undefined, '0', '-3', 'abc' ].forEach((v) => {
            assert.equal(normalizarTempoParada(v), undefined);
        });
    });
});

describe('totalPacotes', () => {
    it('soma os pacotes da rota', () => {
        assert.equal(totalPacotes([{ pacotes: 3 }, { pacotes: 2 }, { pacotes: 1 }]), 6);
    });
    it('parada sem quantidade conta 1 (padrão do app)', () => {
        assert.equal(totalPacotes([{}, { pacotes: 2 }]), 3);
    });
    it('valor inválido não vira NaN', () => {
        assert.equal(totalPacotes([{ pacotes: /** @type {any} */ ('x') }, { pacotes: -5 }, { pacotes: 4 }]), 6);
    });
    it('lista vazia ou inválida dá 0', () => {
        assert.equal(totalPacotes([]), 0);
        assert.equal(totalPacotes(null), 0);
    });
});

describe('pedidoLabel', () => {
    it('mostra o número do pedido quando existe', () => {
        assert.equal(pedidoLabel({ pedido: 'A-123' }), 'Pedido A-123');
    });
    it('sem pedido não mostra nada', () => {
        assert.equal(pedidoLabel({}), '');
    });
});

describe('moverParadaParaExtremo', () => {
    const rota = [
        { id: 1, routeOrder: 1 },
        { id: 2, routeOrder: 2 },
        { id: 3, routeOrder: 3 }
    ];

    it('leva para a primeira posição e renumera', () => {
        const r = moverParadaParaExtremo(rota, 3, 'primeira');
        assert.deepEqual(r.map((d) => d.id), [3, 1, 2]);
        assert.deepEqual(r.map((d) => d.routeOrder), [1, 2, 3]);
    });

    it('leva para a última posição e renumera', () => {
        const r = moverParadaParaExtremo(rota, 1, 'ultima');
        assert.deepEqual(r.map((d) => d.id), [2, 3, 1]);
        assert.deepEqual(r.map((d) => d.routeOrder), [1, 2, 3]);
    });

    it('não muta a lista original', () => {
        moverParadaParaExtremo(rota, 2, 'primeira');
        assert.deepEqual(rota.map((d) => d.id), [1, 2, 3]);
        assert.equal(rota[0].routeOrder, 1);
    });

    it('id inexistente devolve a lista como está', () => {
        const r = moverParadaParaExtremo(rota, 99, 'primeira');
        assert.deepEqual(r.map((d) => d.id), [1, 2, 3]);
    });
});

describe('duplicarParada', () => {
    const original = {
        id: 7,
        sequentialId: 'N7',
        nome: 'Maria',
        endereco: 'Rua México, 3273 - Embratel',
        telefones: [{ numero: '(69) 99999-0000', label: 'Casa' }],
        pacotes: 3,
        status: 'entregue',
        lat: -8.76,
        lng: -63.9,
        tipo: 'coleta',
        pedido: 'P-99',
        notes: 'Portão azul',
        photos: ['data:image/png;base64,AAA'],
        photoIds: ['p1'],
        iniciadaEm: 123,
        duracaoMs: 60000,
        routeOrder: 2
    };

    it('cria uma parada nova pendente, sem fotos nem cronômetro', () => {
        const c = duplicarParada(original, { id: 8, sequentialId: 'N8' });
        assert.equal(c.id, 8);
        assert.equal(c.sequentialId, 'N8');
        assert.equal(c.status, 'pendente');
        assert.equal(c.photos, undefined);
        assert.equal(c.photoIds, undefined);
        assert.equal(c.iniciadaEm, undefined);
        assert.equal(c.duracaoMs, undefined);
    });

    it('preserva os dados de operação', () => {
        const c = duplicarParada(original, { id: 8, sequentialId: 'N8' });
        assert.equal(c.nome, 'Maria');
        assert.equal(c.endereco, 'Rua México, 3273 - Embratel');
        assert.equal(c.pacotes, 3);
        assert.equal(c.tipo, 'coleta');
        assert.equal(c.pedido, 'P-99');
        assert.equal(c.notes, 'Portão azul');
        assert.equal(c.lat, -8.76);
        assert.equal(c.lng, -63.9);
    });

    it('clona os telefones (mexer na cópia não mexe no original)', () => {
        const c = duplicarParada(original, { id: 8, sequentialId: 'N8' });
        c.telefones[0].numero = 'outro';
        assert.equal(original.telefones[0].numero, '(69) 99999-0000');
    });

    it('sem entrega ou sem ids devolve null', () => {
        assert.equal(duplicarParada(null, { id: 1, sequentialId: 'N1' }), null);
        assert.equal(duplicarParada(original, null), null);
    });
});
