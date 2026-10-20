'use strict';

/**
 * Testes do manifesto de precache do service worker (lib/sw-manifest.js).
 *
 * O bug que estes testes protegem: os chunks dos módulos lazy (backup, histórico,
 * edição) não estavam no precache, então o primeiro uso **offline** quebrava no
 * `import()`. O fechamento transitivo tem que trazer os chunks compartilhados junto —
 * precachear só o arquivo de entrada não basta.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    OFFLINE_ENTRIES,
    WARM_ENTRIES,
    offlineChunkFiles,
    precacheJsFiles,
    stampPrecacheJs,
    readPrecacheJs
} = require('../lib/sw-manifest.js');

/** Metafile mínimo com a mesma forma do esbuild. */
const META = {
    outputs: {
        'build/chunks/app.js': {
            entryPoint: 'src/js/main.js',
            imports: [
                { kind: 'import-statement', path: 'build/chunks/chunk-shared.js' },
                { kind: 'dynamic-import', path: 'build/chunks/backup-ui-AAA.js' },
                { kind: 'dynamic-import', path: 'build/chunks/profile-BBB.js' }
            ]
        },
        'build/chunks/chunk-shared.js': { imports: [] },
        'build/chunks/backup-ui-AAA.js': {
            entryPoint: 'src/js/backup-ui.js',
            imports: [
                { kind: 'import-statement', path: 'build/chunks/chunk-shared.js' },
                { kind: 'import-statement', path: 'build/chunks/chunk-backup.js' }
            ]
        },
        'build/chunks/chunk-backup.js': { imports: [] },
        'build/chunks/profile-BBB.js': { entryPoint: 'src/js/profile.js', imports: [] },
        'build/chunks/camera-CCC.js': { entryPoint: 'src/js/camera.js', imports: [] },
        'build/app.css': { imports: [] }
    }
};

describe('offlineChunkFiles', () => {
    it('fecha o grafo a partir da entrada e traz os chunks compartilhados', () => {
        const r = offlineChunkFiles(META, ['src/js/backup-ui.js']);
        assert.deepEqual(r, [
            './build/chunks/backup-ui-AAA.js',
            './build/chunks/chunk-backup.js',
            './build/chunks/chunk-shared.js'
        ]);
    });

    it('não inclui o que não é alcançável (plugin nativo, css)', () => {
        const r = offlineChunkFiles(META, ['src/js/backup-ui.js']);
        assert.ok(!r.some((f) => f.includes('camera')));
        assert.ok(!r.some((f) => f.endsWith('.css')));
    });

    it('une várias entradas sem duplicar', () => {
        const r = offlineChunkFiles(META, ['src/js/backup-ui.js', 'src/js/profile.js']);
        assert.equal(r.filter((f) => f.endsWith('chunk-shared.js')).length, 1);
        assert.equal(r.length, 4);
    });

    it('entrada inexistente não estoura, só não contribui', () => {
        assert.deepEqual(offlineChunkFiles(META, ['src/js/nao-existe.js']), []);
    });

    it('saída ordenada (build determinístico)', () => {
        const a = offlineChunkFiles(META, OFFLINE_ENTRIES);
        const b = offlineChunkFiles(META, OFFLINE_ENTRIES);
        assert.deepEqual(a, b);
        assert.deepEqual(a, [...a].sort());
    });

    it('níveis 1 e 2 são disjuntos', () => {
        for (const e of WARM_ENTRIES) assert.ok(!OFFLINE_ENTRIES.includes(e), `${e} está nos dois níveis`);
    });
});

describe('precacheJsFiles', () => {
    it('inclui o grafo de boot (app.js) — sem ele "instalar e abrir offline" quebra', () => {
        const r = precacheJsFiles(META);
        assert.ok(r.includes('./build/chunks/app.js'));
        assert.ok(r.includes('./build/chunks/chunk-shared.js'), 'chunk compartilhado do boot tem que entrar');
    });

    it('inclui as telas offline e continua fora do que não é do app', () => {
        const r = precacheJsFiles(META);
        assert.ok(r.includes('./build/chunks/backup-ui-AAA.js'));
        assert.ok(!r.some((f) => f.includes('camera')));
    });

    it('sem duplicatas e ordenado', () => {
        const r = precacheJsFiles(META);
        assert.deepEqual(r, [...new Set(r)].sort());
    });
});

describe('stampPrecacheJs', () => {
    const SW = `const CACHE_NAME = 'x';\nconst PRECACHE_JS = [];\n\nself.addEventListener('install', () => {});\n`;

    it('injeta a lista', () => {
        const out = stampPrecacheJs(SW, ['./build/chunks/b.js', './build/chunks/a.js']);
        assert.deepEqual(readPrecacheJs(out), ['./build/chunks/a.js', './build/chunks/b.js']);
        assert.ok(out.includes("const CACHE_NAME = 'x';"));
        assert.ok(out.includes('self.addEventListener'));
    });

    it('é idempotente (rodar 2× não duplica nem muda o arquivo)', () => {
        const um = stampPrecacheJs(SW, ['./build/chunks/a.js']);
        const dois = stampPrecacheJs(um, ['./build/chunks/a.js']);
        assert.equal(um, dois);
    });

    it('lista vazia volta para []', () => {
        const cheio = stampPrecacheJs(SW, ['./build/chunks/a.js']);
        assert.deepEqual(readPrecacheJs(stampPrecacheJs(cheio, [])), []);
    });

    it('falha alto se o sw.js perdeu o marcador', () => {
        assert.throws(() => stampPrecacheJs('const OUTRA = 1;\n', ['./a.js']), /PRECACHE_JS/);
    });
});

describe('sw.js do repo', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

    it('declara PRECACHE_JS e usa no install', () => {
        assert.match(sw, /^const PRECACHE_JS = \[/m);
        assert.match(sw, /precacheJs\(cache\)/);
    });

    it('precache tolerante: falha de um chunk não derruba o install', () => {
        assert.ok(sw.includes('allSettled'), 'o install precisa sobreviver a um chunk indisponível');
    });
});
