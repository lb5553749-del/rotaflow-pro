'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

execSync('node scripts/patch-google-maps-android.js', { cwd: root, stdio: 'inherit' });

// src/ → build/ (app.css, app.js com native/bridge.js embutido, fonts/)
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

// version.json é a fonte da verdade: carimba a versão na cópia de firebase-config em www/.
const cfgPath = path.join(www, 'firebase-config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8')
  .replace(/^window\.ROTAFLOW_APP_VERSION\s*=.*$/m, '')
  .replace(/^window\.ROTAFLOW_VERSION_CODE\s*=.*$/m, '')
  .replace(/\s+$/, '');
cfg += `\nwindow.ROTAFLOW_APP_VERSION = ${JSON.stringify(version.versionName)};\n`;
cfg += `window.ROTAFLOW_VERSION_CODE = ${Number(version.versionCode)};\n`;
fs.writeFileSync(cfgPath, cfg);

// Cache do service worker (PWA) acompanha version.json.
const swPath = path.join(www, 'sw.js');
fs.writeFileSync(
  swPath,
  fs.readFileSync(swPath, 'utf8').replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = ${JSON.stringify(version.swCache)};`)
);

console.log(`www/ ready for Capacitor sync (v${version.versionName} / ${version.versionCode})`);
