'use strict';

/**
 * Ranking das sugestões de endereço (patch 20).
 * A lista aparece em duas camadas: primeiro o que o motorista já usou, depois o Google.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeAddressText,
    addressKey,
    addressMatchRank,
    rankLocalAddresses,
    mergeAddressSuggestions
} = require('../lib/address-suggest-helpers');

describe('normalizeAddressText', () => {
    it('tira acento, caixa e espaço duplicado', () => {
        assert.equal(normalizeAddressText('  Rua Getúlio   VARGAS '), 'rua getulio vargas');
    });
    it('aguenta nulo', () => {
        assert.equal(normalizeAddressText(null), '');
    });
});

describe('addressKey', () => {
    it('junta o mesmo endereço escrito de dois jeitos', () => {
        assert.equal(
            addressKey('Rua Getúlio Vargas, 1120 - Centro'),
            addressKey('Rua Getulio Vargas 1120')
        );
    });
    it('separa números diferentes', () => {
        assert.notEqual(addressKey('Rua A, 100'), addressKey('Rua A, 1000'));
    });
});

describe('addressMatchRank', () => {
    it('prefere o que começa com o texto digitado', () => {
        const comeco = addressMatchRank('Rua Getúlio Vargas, 1120', 'rua getulio');
        const meio = addressMatchRank('Av. Jorge Teixeira - Rua Getúlio Vargas', 'rua getulio');
        assert.ok(comeco < meio);
    });
    it('acha pelo número da casa', () => {
        assert.ok(addressMatchRank('Rua Getúlio Vargas, 1120 - Centro', '1120') < 100);
    });
    it('não casa o que não tem o texto', () => {
        assert.equal(addressMatchRank('Rua A, 1', 'xyz'), 10000);
    });
});

describe('rankLocalAddresses', () => {
    const itens = [
        { endereco: 'Rua Getúlio Vargas, 1120 - Centro', nome: 'Maria', origem: 'rota' },
        { endereco: 'Rua Getulio Vargas 1120', nome: 'Maria de novo', origem: 'agenda' },
        { endereco: 'Av. Sete de Setembro, 245', nome: 'João', origem: 'rota' },
        { endereco: 'Rua Getúlio Vargas, 88 - Centro', nome: 'Ana', origem: 'historico' }
    ];

    it('devolve só o que casa e sem repetir endereço', () => {
        const r = rankLocalAddresses(itens, 'getulio');
        assert.equal(r.length, 2, 'as duas grafias do 1120 contam como uma');
        assert.equal(r[0].nome, 'Maria');
    });

    it('exige 2 letras antes de sugerir', () => {
        assert.deepEqual(rankLocalAddresses(itens, 'g'), []);
    });

    it('respeita o limite', () => {
        assert.ok(rankLocalAddresses(itens, 'rua', { limit: 1 }).length <= 1);
    });

    it('ignora item sem endereço', () => {
        assert.deepEqual(rankLocalAddresses([{ nome: 'x' }], 'rua'), []);
    });

    it('não quebra com entrada inválida', () => {
        assert.deepEqual(rankLocalAddresses(null, 'rua'), []);
        assert.deepEqual(rankLocalAddresses(undefined, ''), []);
    });
});

describe('mergeAddressSuggestions', () => {
    it('locais primeiro, sem repetir o que o Google devolveria igual', () => {
        const locais = [{ endereco: 'Rua Getúlio Vargas, 1120 - Centro', nome: 'Maria', origem: 'rota' }];
        const remotas = [
            { endereco: 'Rua Getulio Vargas 1120' },
            { endereco: 'Rua Getúlio Vargas, 90 - Centro' }
        ];
        const r = mergeAddressSuggestions(locais, remotas, 5);
        assert.equal(r.length, 2);
        assert.equal(r[0].origem, 'rota');
        assert.equal(r[1].origem, 'google');
    });

    it('respeita o limite e descarta vazios', () => {
        const r = mergeAddressSuggestions([{ endereco: 'A, 1' }, { endereco: '  ' }], [{ endereco: '' }], 1);
        assert.equal(r.length, 1);
    });
});
