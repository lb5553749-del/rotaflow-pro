'use strict';

/**
 * Guarda-corpo do "lazy de verdade".
 *
 * Já aconteceu neste repo de a documentação dizer que backup/histórico eram
 * carregados sob demanda enquanto o `main.js` os importava estaticamente — e o
 * módulo entrava no boot do mesmo jeito. Estes testes leem o código-fonte e
 * quebram se alguém reintroduzir o import estático.
 *
 * Eles não rodam o app: são testes de arquitetura, baratos e determinísticos.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

/** Imports estáticos (`import ... from 'x'`) de um arquivo. */
function importsEstaticos(fonte) {
    const alvos = [];
    const re = /import\s+[^;]*?from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(fonte)) !== null) alvos.push(m[1]);
    return alvos;
}

/** Módulos carregados por import() dinâmico. */
function importsDinamicos(fonte) {
    const alvos = [];
    const re = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(fonte)) !== null) alvos.push(m[1]);
    return alvos;
}

describe('main.js — módulos fora do boot', () => {
    const main = ler('src/js/main.js');
    const estaticos = importsEstaticos(main);
    const dinamicos = importsDinamicos(main);

    for (const mod of ['./backup-ui.js', './profile.js', './name-suggestions.js', './filters-ui.js']) {
        it(`não importa ${mod} estaticamente`, () => {
            assert.ok(
                !estaticos.includes(mod),
                `${mod} voltou para o caminho crítico do boot — use import() sob demanda`
            );
        });

        it(`carrega ${mod} por import() dinâmico`, () => {
            assert.ok(dinamicos.includes(mod), `esperava import('${mod}') no main.js`);
        });
    }

    it('não importa o stub morto de resource-hints', () => {
        assert.ok(!estaticos.includes('./resource-hints.js'));
    });
});

describe('filters-ui.js — painel sob demanda (09)', () => {
    it('deliveries-list nao importa o painel: usa deps injetadas', () => {
        const lista = ler('src/js/deliveries-list.js');
        assert.ok(!importsEstaticos(lista).includes('./filters-ui.js'));
        assert.ok(!importsDinamicos(lista).includes('./filters-ui.js'));
        assert.ok(/updateFiltersUI:\s*\(\)\s*=>\s*\{\}/.test(lista), 'deps no-op precisa existir');
    });

    it('app-boot nao importa o painel', () => {
        assert.ok(!importsEstaticos(ler('src/js/app-boot.js')).includes('./filters-ui.js'));
    });

    it('o estado dos filtros (advanced-filters) continua no boot', () => {
        // Se isso virar lazy, a lista deixa de ser filtrada — o painel é só a UI.
        assert.ok(importsEstaticos(ler('src/js/deliveries-list.js')).includes('./advanced-filters.js'));
    });

    it('index.html tem o placeholder clicavel no lugar do painel', () => {
        const html = ler('index.html');
        assert.match(html, /id="filtersPlaceholder"/);
        assert.ok(!/id="filtersPanel"/.test(html), 'painel nao pode vir no HTML do shell');
    });
});

describe('backup-bindings.js — ligações baratas no boot', () => {
    const fonte = ler('src/js/backup-bindings.js');

    it('não importa backup-ui.js (só recebe a fachada lazy)', () => {
        assert.deepEqual(importsEstaticos(fonte), []);
        assert.deepEqual(importsDinamicos(fonte), []);
    });

    it('continua pequeno (só addEventListener)', () => {
        const kb = Buffer.byteLength(fonte) / 1024;
        assert.ok(kb < 3, `backup-bindings.js cresceu para ${kb.toFixed(1)} KB — revise se não virou UI`);
    });
});

describe('theme.js — tema escuro segue eager', () => {
    it('é importado por app-boot.js (precisa rodar antes do primeiro paint)', () => {
        const boot = ler('src/js/app-boot.js');
        assert.ok(importsEstaticos(boot).includes('./theme.js'));
        assert.ok(!importsEstaticos(boot).includes('./profile.js'), 'app-boot voltou a importar o profile.js inteiro');
    });

    it('não importa nada (não arrasta módulo para o boot)', () => {
        assert.deepEqual(importsEstaticos(ler('src/js/theme.js')), []);
    });
});
