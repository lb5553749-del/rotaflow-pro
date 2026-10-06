'use strict';

/**
 * Build do app web: src/ → build/app.css + build/app.js (+ build/fonts/).
 *   node scripts/build-web.js            minificado (APK / hosting)
 *   node scripts/build-web.js --dev      com sourcemap, sem minificar (debug)
 * index.html (raiz) aponta para ./build/*, então preview local e Firebase Hosting usam o mesmo build.
 *
 * O build também carimba a versão nos dois arquivos da raiz que o Hosting publica
 * (`sw.js` e `firebase-config.js`) e confere que tudo que o `index.html` referencia
 * existe de fato — já houve deploy sem `build/app.js`.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');
const {
  assertVersionShape,
  stampServiceWorkerCache,
  stampAppVersion
} = require('../lib/version-stamp');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build');
const dev = process.argv.includes('--dev');

/** O código já usa `?.`/`??`; es2020 só impede o minificador de gerar sintaxe mais nova (ex.: `||=`). */
const TARGET = 'es2020';

/** Arquivos que o index.html carrega e sem os quais o deploy sobe um app quebrado. */
const REQUIRED_FOR_DEPLOY = ['build/app.js', 'build/app.css', 'firebase-config.js', 'sw.js', 'index.html'];

function sizeLine(file) {
  const buf = fs.readFileSync(file);
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  return `${path.relative(root, file).padEnd(40)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  (gzip ${(gz / 1024).toFixed(1)} KB)`;
}

/**
 * O `CACHE_NAME` do service worker é `swCache` + hash do bundle. Com só `swCache`,
 * publicar sem bumpar `version.json` deixa o PWA instalado servindo o app.js antigo
 * do cache para sempre; com o hash, qualquer mudança no bundle invalida o shell
 * sozinha. O build é determinístico, então o hash só muda quando o código muda.
 */
function shellCacheName(swCache, assetFiles) {
  const hash = crypto.createHash('sha256');
  for (const file of assetFiles.slice().sort()) {
    hash.update(path.relative(root, file));
    hash.update(fs.readFileSync(file));
  }
  return `${swCache}.${hash.digest('hex').slice(0, 10)}`;
}

/** Reescreve o arquivo só quando o conteúdo muda, para o build não sujar o git à toa. */
function writeIfChanged(file, next) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

function assertDeployables() {
  const missing = REQUIRED_FOR_DEPLOY.filter((rel) => !fs.existsSync(path.join(root, rel)));
  if (missing.length) {
    throw new Error(`build incompleto, faltam: ${missing.join(', ')}`);
  }
}

async function main() {
  const version = assertVersionShape(JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')));

  execFileSync(process.execPath, [path.join(__dirname, 'build-icons.js')], { cwd: root, stdio: 'inherit' });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const common = {
    bundle: true,
    minify: !dev,
    sourcemap: dev ? 'linked' : false,
    target: TARGET,
    logLevel: 'warning',
    legalComments: 'none'
  };

  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'src/styles/main.css')],
    outfile: path.join(outDir, 'app.css'),
    loader: { '.woff2': 'file' },
    assetNames: 'fonts/[name]'
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'src/js/main.js')],
    outfile: path.join(outDir, 'app.js'),
    format: 'iife',
    platform: 'browser'
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'src/js/track-shared.js')],
    outfile: path.join(outDir, 'track-shared.js'),
    format: 'iife',
    platform: 'browser'
  });

  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (!p.endsWith('.map')) files.push(p);
    }
  };
  walk(outDir);

  const swPath = path.join(root, 'sw.js');
  const cacheName = shellCacheName(version.swCache, files);
  const swChanged = writeIfChanged(swPath, stampServiceWorkerCache(fs.readFileSync(swPath, 'utf8'), cacheName));

  const cfgPath = path.join(root, 'firebase-config.js');
  writeIfChanged(cfgPath, stampAppVersion(fs.readFileSync(cfgPath, 'utf8'), version));

  assertDeployables();

  files.push(path.join(root, 'index.html'));
  console.log(files.map(sizeLine).join('\n'));
  console.log(`v${version.versionName} (${version.versionCode})  shell cache: ${cacheName}${swChanged ? '  [atualizado]' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
