'use strict';

/**
 * Guarda-corpo da folha inferior (patch 12).
 *
 * No celular o painel virou bottom sheet: o mapa fica atrás e a lista vem numa
 * folha com dois encaixes. Estes testes leem o fonte e quebram se alguém:
 *   - tirar a alça do index.html (sem ela o painel só abre/fecha por inteiro);
 *   - esquecer de ligar o clique da alça no boot;
 *   - reintroduzir, no mobile, a sidebar de largura fixa que cobria o mapa.
 *
 * São testes de arquitetura: baratos e determinísticos, sem rodar o app.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

/** Trecho de um @media (max-width: 780px) — o bloco que vale no celular. */
function blocoMobile(css) {
    const partes = [];
    const re = /@media\s*\(max-width:\s*780px\)\s*\{/g;
    let m;
    while ((m = re.exec(css)) !== null) {
        let i = m.index + m[0].length;
        let profundidade = 1;
        const inicio = i;
        while (i < css.length && profundidade > 0) {
            if (css[i] === '{') profundidade++;
            else if (css[i] === '}') profundidade--;
            i++;
        }
        partes.push(css.slice(inicio, i - 1));
    }
    return partes.join('\n');
}

describe('index.html — alça da folha inferior', () => {
    const html = ler('index.html');

    it('existe dentro da sidebar', () => {
        assert.match(html, /id="sheetHandle"/);
        const inicioSidebar = html.indexOf('id="sidebar"');
        const inicioAlca = html.indexOf('id="sheetHandle"');
        assert.ok(inicioSidebar > 0 && inicioAlca > inicioSidebar, 'a alça precisa ficar dentro da <aside id="sidebar">');
    });

    it('é um botão acessível (aria-label + aria-expanded)', () => {
        const trecho = html.slice(html.indexOf('id="sheetHandle"') - 400, html.indexOf('id="sheetHandle"') + 300);
        assert.match(trecho, /aria-label="[^"]+"/);
        assert.match(trecho, /aria-expanded="/);
    });
});

describe('app-boot.js — comportamento da folha', () => {
    const fonte = ler('src/js/app-boot.js');

    it('liga o clique da alça no boot', () => {
        assert.match(fonte, /setupSheetHandle\(\)/);
        assert.match(fonte, /sheetHandle/);
    });

    it('o botão de menu zera o encaixe expandido ao fechar', () => {
        assert.match(fonte, /classList\.remove\('sheet-expanded'\)/);
    });

    it('não arrasta módulo novo para o boot (só DOM)', () => {
        const antes = fonte.length;
        assert.ok(antes < 16000, `app-boot.js cresceu para ${antes} B — a folha não devia custar isso`);
    });
});

describe('app.css — folha inferior no celular', () => {
    const css = ler('src/styles/app.css');
    const mobile = blocoMobile(css);

    it('a sidebar vira folha encaixada embaixo', () => {
        assert.match(mobile, /\.sidebar\s*\{[^}]*position:\s*fixed/);
        assert.match(mobile, /\.sidebar\s*\{[^}]*bottom:\s*0/);
        assert.match(mobile, /\.sidebar\s*\{[^}]*border-radius:[^;]*var\(--radius-xl\)/);
    });

    it('tem dois encaixes: padrão e expandido', () => {
        assert.match(mobile, /\.app-container\.sheet-expanded \.sidebar\s*\{[^}]*height:\s*90dvh/);
    });

    it('o mapa não fica atrás da folha (Maps exige logo/atribuição visíveis)', () => {
        // Folha padrão em 64% (redesign 2.0) deixa 36dvh de mapa visível.
        assert.match(mobile, /\.map-area\s*\{[^}]*height:\s*36dvh/);
        assert.match(mobile, /\.app-container\.sheet-expanded \.map-area\s*\{[^}]*height:\s*10dvh/);
    });

    it('a largura fixa antiga (sidebar cobrindo o mapa) não voltou', () => {
        assert.doesNotMatch(mobile, /\.sidebar\s*\{[^}]*width:\s*min\(92vw/, 'a sidebar voltou a ocupar 92vw no celular');
    });

    it('respeita prefers-reduced-motion', () => {
        assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[^}]*\.sidebar\s*\{[^}]*transition:\s*none/);
    });
});

describe('app.css — FABs do mapa', () => {
    const mobile = blocoMobile(ler('src/styles/app.css'));

    it('ficam ancorados pelo topo, não pelo rodapé', () => {
        // regressão: no canto inferior direito o rail caía em cima dos controles
        // do Google Maps (zoom/street view) e dos botões no topo da folha
        assert.match(mobile, /\.map-fab-rail\s*\{[^}]*top:\s*calc\(/s);
        assert.doesNotMatch(mobile, /\.map-fab-rail\s*\{[^}]*bottom:\s*calc\(64dvh/s);
    });

    it('somem quando a folha está expandida', () => {
        assert.match(mobile, /\.sheet-expanded\s+\.map-fab-rail\s*\{\s*display:\s*none/);
    });
});

describe('tempo (patch 14) — fiação na interface', () => {
    const boot = ler('src/js/app-boot.js');
    const listHelpers = ler('lib/list-helpers.js');
    const html = ler('index.html');

    it('a barra da rota tem o botão de resumo do dia', () => {
        assert.match(html, /id="resumoTempoBtn"/);
        assert.match(html, /fa-stopwatch/);
    });

    it('o boot liga o ticker e o resumo', () => {
        assert.match(boot, /iniciarTickerDeTempo\(\)/);
        assert.match(boot, /abrirResumoDoDia\(/);
    });

    it('a lista mostra a duração fechada e o tempo correndo', () => {
        assert.match(listHelpers, /duracaoMs/);
        assert.match(listHelpers, /data-tempo-inicio/);
        assert.match(listHelpers, /fa-stopwatch/);
    });

    it('o ticker só mexe no texto, não re-renderiza a lista', () => {
        const tempoUi = ler('src/js/tempo-ui.js');
        assert.match(tempoUi, /\[data-tempo-inicio\]/);
        assert.doesNotMatch(tempoUi, /renderDeliveriesList/);
        assert.match(tempoUi, /document\.hidden/, 'não gasta bateria com a aba em segundo plano');
    });
});

describe('redesign 2.0 (patch 15) — ícones travados e tema', () => {
    const painel = ler('src/js/delivery-panel.js');
    const perfil = ler('src/js/profile.js');
    const css = ler('src/styles/app.css');

    it('mantém os ícones originais das ações do painel', () => {
        // decisão do dono: layout novo, desenho de ícone o mesmo de antes
        assert.match(painel, /fa-location-arrow/, 'Navegar');
        assert.match(painel, /fab fa-whatsapp/, 'WhatsApp');
        assert.match(painel, /fa-box-open/, 'Entregar');
        assert.match(painel, /fa-box\b/, 'Falhou');
        assert.match(painel, /fa-rotate-left/, 'Desfazer');
    });

    it('o tema é escolhido em três estados, não em liga/desliga', () => {
        assert.match(perfil, /data-tema="claro"/);
        assert.match(perfil, /data-tema="escuro"/);
        assert.match(perfil, /data-tema="sistema"/);
        assert.match(perfil, /applyTema\(/);
        assert.doesNotMatch(perfil, /profileDarkMode/, 'checkbox antigo saiu');
    });

    it('"sistema" volta a seguir o aparelho em vez de fixar claro', () => {
        assert.match(perfil, /removeItem\('rotaflow_dark_theme'\)/);
        assert.match(perfil, /prefers-color-scheme: dark/);
    });

    it('o seletor tem estilo e contrasta no tema escuro', () => {
        assert.match(css, /\.tema-seletor button\[aria-checked="true"\]/);
        assert.match(css, /html\.dark-theme \.tema-seletor/);
    });
});

describe('redesign 2.0, parte 2 (patch 16) — moldura antes da lista', () => {
    const html = ler('index.html');
    const boot = ler('src/js/app-boot.js');
    const mobile = blocoMobile(ler('src/styles/app.css'));

    it('as ações destrutivas vão para o menu ⋯ em vez de ficarem soltas', () => {
        assert.match(html, /id="clearRouteMenuBtn"/);
        assert.match(html, /overflow-danger/);
        // os botões grandes saíram da barra; os ids antigos continuam no menu
        assert.doesNotMatch(html, /id="clearRouteBtn"/);
        assert.doesNotMatch(html, /id="newRouteBtn"/);
    });

    it('o boot continua ligando Limpar rota pelo botão do menu', () => {
        assert.match(boot, /clearRouteMenuBtn/);
    });

    it('a marca sai do topo da folha no celular (o mapa já diz onde você está)', () => {
        assert.match(mobile, /\.sidebar-header \.brand\s*\{\s*display:\s*none/);
    });

    it('a barra de ferramentas é uma linha só, não o grid 2x2', () => {
        assert.match(mobile, /\.route-tools-end\s*\{[^}]*display:\s*flex !important/s);
    });

    it('o banner de backup vira uma linha (texto com ellipsis)', () => {
        assert.match(mobile, /\.backup-reminder \.backup-reminder-text\s*\{[^}]*-webkit-line-clamp:\s*1/s);
    });
});
