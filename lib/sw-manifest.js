'use strict';

/**
 * Manifesto de chunks para o service worker.
 *
 * Por que isto existe: os módulos de UI que viraram `import()` sob demanda (histórico,
 * perfil, backup, sugestões, edit-modals, agenda-route) **não** estavam no precache do
 * SW — só entravam no `RUNTIME_CACHE` depois do primeiro uso. No celular do motorista,
 * "primeiro uso" costuma ser na rua, sem sinal: abrir o Histórico ou exportar backup
 * offline dava erro de import.
 *
 * A correção é precachear esses chunks no install, mas **só os que o motorista usa
 * offline** — não os 42 chunks do build (263 KB raw), que incluem as implementações web
 * dos plugins nativos (@capacitor/google-maps, filesystem, camera…), inúteis dentro do
 * APK. O fechamento transitivo é calculado a partir do metafile do esbuild, então um
 * chunk compartilhado entra junto automaticamente.
 */

/**
 * Nível 1 — precache no install do service worker (funciona offline desde o 1º dia).
 * São as telas cujo uso sem rede é o caso normal: exportar backup, arquivar/ver o dia
 * e editar uma entrega. ~36 KB gzip, uma vez só.
 */
const OFFLINE_ENTRIES = [
    'src/js/backup-ui.js',   // exportar/importar backup é 100% local
    'src/js/edit-modals.js', // editar entrega/parada na rua
    'src/js/history.js'      // dias arquivados
];

/**
 * Nível 2 — mesmo tratamento, prioridade menor (perfil, sugestões, agenda).
 * Ficam no precache também: depender de "aquecer no idle" só funcionava se o service
 * worker já estivesse controlando a página — na 1ª visita ele assume depois, e o
 * aquecimento caía no vazio (medido: chunks não ficavam no cache).
 */
const WARM_ENTRIES = [
    'src/js/profile.js',
    'src/js/name-suggestions.js',
    'src/js/agenda-route.js'
];

/** Marcador que `stampPrecacheJs` substitui (mantido igual em sw.js). */
const MARCADOR = /^const PRECACHE_JS = \[[^\]]*\];.*$/m;

/** Entrada do app: tudo que o boot precisa. */
const APP_ENTRY = 'src/js/main.js';

/**
 * Fecha o grafo de `import-statement` a partir das entradas desejadas.
 *
 * @param {{ outputs?: Record<string, any> }} metafile metafile do esbuild (`build` com `metafile: true`)
 * @param {string[]} [entradas] caminhos (relativos à raiz do repo) das entradas
 * @returns {string[]} caminhos dos arquivos de saída, ordenados
 */
function offlineChunkFiles(metafile, entradas = OFFLINE_ENTRIES) {
    const out = (metafile && metafile.outputs) || {};
    const raiz = entradas.map((e) => {
        const achado = Object.keys(out).find((k) => (out[k].entryPoint || '').replace(/\\/g, '/') === e);
        return achado;
    }).filter(Boolean);

    const vistos = new Set();
    const visitar = (chave) => {
        if (!chave || vistos.has(chave) || !out[chave]) return;
        vistos.add(chave);
        for (const dep of out[chave].imports || []) {
            if (dep.kind === 'import-statement') visitar(dep.path);
        }
    };
    for (const k of raiz) visitar(k);

    // Só arquivos que o SW consegue pedir por URL relativa.
    return [...vistos]
        .filter((k) => k.endsWith('.js'))
        .map((k) => './' + k.replace(/\\/g, '/'))
        .sort();
}

/**
 * Lista final de JS precacheado no install: **boot completo + telas offline do nível 1**.
 *
 * O boot entra porque, na primeira visita, as requisições acontecem antes de o service
 * worker assumir — então `app.js` e seus chunks não passam pelo cache dele. Sem isso,
 * "instalar o app e abrir offline" quebrava no próprio boot.
 *
 * @param {{ outputs?: Record<string, any> }} metafile
 * @returns {string[]}
 */
function precacheJsFiles(metafile) {
    return [...new Set([
        ...offlineChunkFiles(metafile, [APP_ENTRY]),
        ...offlineChunkFiles(metafile, OFFLINE_ENTRIES),
        ...offlineChunkFiles(metafile, WARM_ENTRIES)
    ])].sort();
}

/**
 * Reescreve a linha `const PRECACHE_JS = [...]` do service worker.
 * Idempotente: rodar de novo com a mesma lista deixa o arquivo igual.
 *
 * @param {string} fonte conteúdo do sw.js
 * @param {string[]} arquivos caminhos relativos (ex.: './build/chunks/x.js')
 * @returns {string}
 */
function stampPrecacheJs(fonte, arquivos) {
    if (typeof fonte !== 'string' || !fonte.includes('const PRECACHE_JS')) {
        throw new Error('sw.js sem a linha `const PRECACHE_JS` — o build não consegue injetar o precache');
    }
    const lista = (arquivos || []).slice().sort();
    const linhas = lista.map((f) => `  '${f}'`).join(',\n');
    const corpo = lista.length ? `const PRECACHE_JS = [\n${linhas}\n];` : 'const PRECACHE_JS = [];';
    return fonte.replace(MARCADOR, () => corpo);
}

/** Lê a lista já injetada (usado pelo teste de idempotência). */
function readPrecacheJs(fonte) {
    const m = String(fonte).match(/^const PRECACHE_JS = \[([\s\S]*?)\];/m);
    if (!m) return null;
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

module.exports = {
    APP_ENTRY,
    OFFLINE_ENTRIES,
    WARM_ENTRIES,
    offlineChunkFiles,
    precacheJsFiles,
    stampPrecacheJs,
    readPrecacheJs
};
