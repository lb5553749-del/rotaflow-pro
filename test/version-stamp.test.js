'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  VersionStampError,
  assertVersionShape,
  stampServiceWorkerCache,
  readServiceWorkerCache,
  stampAppVersion
} = require('../lib/version-stamp.js');

const root = path.join(__dirname, '..');
const readRoot = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('assertVersionShape', () => {
  it('aceita o version.json do repositório', () => {
    const version = assertVersionShape(JSON.parse(readRoot('version.json')));
    assert.equal(typeof version.versionName, 'string');
    assert.ok(Number.isInteger(version.versionCode));
    assert.ok(version.swCache.length > 0);
  });

  it('recusa versionCode que não é inteiro positivo', () => {
    const base = { versionName: '1.0.0', swCache: 'c' };
    assert.throws(() => assertVersionShape({ ...base, versionCode: 0 }), VersionStampError);
    assert.throws(() => assertVersionShape({ ...base, versionCode: '54' }), VersionStampError);
    assert.throws(() => assertVersionShape({ ...base, versionCode: 1.5 }), VersionStampError);
  });

  it('recusa campos de texto vazios', () => {
    assert.throws(() => assertVersionShape({ versionName: '', versionCode: 1, swCache: 'c' }), VersionStampError);
    assert.throws(() => assertVersionShape({ versionName: '1', versionCode: 1, swCache: '  ' }), VersionStampError);
    assert.throws(() => assertVersionShape(null), VersionStampError);
  });
});

describe('stampServiceWorkerCache', () => {
  it('troca o CACHE_NAME preservando o resto do arquivo', () => {
    const source = "const CACHE_NAME = 'rotaflow-shell-v1';\nconst PRECACHE = ['./'];\n";
    const out = stampServiceWorkerCache(source, 'rotaflow-shell-v2.abcdef');
    assert.equal(out, "const CACHE_NAME = 'rotaflow-shell-v2.abcdef';\nconst PRECACHE = ['./'];\n");
  });

  it('é idempotente: carimbar duas vezes com o mesmo valor não muda nada', () => {
    const once = stampServiceWorkerCache(readRoot('sw.js'), 'rotaflow-shell-v9.deadbeef');
    assert.equal(stampServiceWorkerCache(once, 'rotaflow-shell-v9.deadbeef'), once);
  });

  it('falha quando a âncora some, em vez de devolver o arquivo intacto', () => {
    assert.throws(() => stampServiceWorkerCache('const CACHE = "x";', 'v1'), VersionStampError);
    assert.throws(() => stampServiceWorkerCache(readRoot('sw.js'), ''), VersionStampError);
  });

  it('recusa valor que quebraria a string do arquivo', () => {
    const source = "const CACHE_NAME = 'v1';\n";
    assert.throws(() => stampServiceWorkerCache(source, "v1'; evil()//"), VersionStampError);
  });

  it('casa com o sw.js real do repositório', () => {
    const out = stampServiceWorkerCache(readRoot('sw.js'), 'carimbo-de-teste');
    assert.equal(readServiceWorkerCache(out), 'carimbo-de-teste');
  });
});

describe('readServiceWorkerCache', () => {
  it('lê o valor declarado', () => {
    assert.equal(readServiceWorkerCache("const CACHE_NAME = 'abc';"), 'abc');
  });

  it('devolve null quando não há declaração', () => {
    assert.equal(readServiceWorkerCache('sem cache'), null);
    assert.equal(readServiceWorkerCache(null), null);
  });
});

describe('stampAppVersion', () => {
  const version = { versionName: '9.9.9', versionCode: 99 };

  it('substitui as linhas existentes sem duplicar', () => {
    const out = stampAppVersion(readRoot('firebase-config.js'), version);
    assert.equal(out.match(/window\.ROTAFLOW_APP_VERSION/g).length, 1);
    assert.equal(out.match(/window\.ROTAFLOW_VERSION_CODE/g).length, 1);
    assert.match(out, /window\.ROTAFLOW_APP_VERSION = '9\.9\.9';/);
    assert.match(out, /window\.ROTAFLOW_VERSION_CODE = 99;/);
  });

  it('acrescenta as linhas quando o arquivo ainda não as tem', () => {
    const out = stampAppVersion('window.X = 1;\n', version);
    assert.equal(out, "window.X = 1;\nwindow.ROTAFLOW_APP_VERSION = '9.9.9';\nwindow.ROTAFLOW_VERSION_CODE = 99;\n");
  });

  it('é idempotente', () => {
    const once = stampAppVersion(readRoot('firebase-config.js'), version);
    assert.equal(stampAppVersion(once, version), once);
  });

  it('preserva as outras chaves de configuração', () => {
    const out = stampAppVersion(readRoot('firebase-config.js'), version);
    assert.match(out, /window\.ROTAFLOW_MAPS_KEY/);
    assert.match(out, /window\.ROTAFLOW_CLOUD_BACKUP_ENABLED/);
  });
});

describe('estado carimbado no repositório', () => {
  it('firebase-config.js da raiz bate com version.json', () => {
    const version = assertVersionShape(JSON.parse(readRoot('version.json')));
    const cfg = readRoot('firebase-config.js');
    assert.match(cfg, new RegExp(`window\\.ROTAFLOW_APP_VERSION = '?"?${version.versionName.replace(/\./g, '\\.')}'?"?;`));
    assert.match(cfg, new RegExp(`window\\.ROTAFLOW_VERSION_CODE = ${version.versionCode};`));
  });

  it('sw.js da raiz usa o swCache declarado em version.json', () => {
    const version = assertVersionShape(JSON.parse(readRoot('version.json')));
    const cacheName = readServiceWorkerCache(readRoot('sw.js'));
    assert.ok(cacheName, 'sw.js precisa declarar CACHE_NAME');
    assert.ok(
      cacheName.startsWith(version.swCache),
      `CACHE_NAME (${cacheName}) precisa começar com swCache (${version.swCache})`
    );
  });
});
