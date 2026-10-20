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

    for (const mod of ['./backup-ui.js', './profile.js', './name-suggestions.js']) {
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
