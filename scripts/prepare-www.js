'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { assertVersionShape, readServiceWorkerCache } = require('../lib/version-stamp');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
const version = assertVersionShape(JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')));

execSync('node scripts/patch-google-maps-android.js', { cwd: root, stdio: 'inherit' });

// src/ → build/ (app.css, app.js com native/bridge.js embutido, fonts/).
// O build também carimba a versão em sw.js e firebase-config.js na raiz, então a
// cópia abaixo já sai carimbada — não há um segundo lugar para esquecer de atualizar.
execSync('node scripts/build-web.js', { cwd: root, stdio: 'inherit' });

// www/ é 100% gerado: limpa para não levar arquivos antigos para o APK.
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

for (const file of ['index.html', 'sw.js', 'firebase-config.js']) {
  fs.copyFileSync(path.join(root, file), path.join(www, file));
}
fs.cpSync(path.join(root, 'build'), path.join(www, 'build'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map')
});

const cacheName = readServiceWorkerCache(fs.readFileSync(path.join(www, 'sw.js'), 'utf8'));
if (!cacheName || !cacheName.startsWith(version.swCache)) {
  throw new Error(`www/sw.js não foi carimbado a partir de version.json (CACHE_NAME = ${cacheName})`);
}

console.log(`www/ ready for Capacitor sync (v${version.versionName} / ${version.versionCode} / ${cacheName})`);
