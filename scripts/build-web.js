'use strict';

/**
 * Build do app web: src/ → build/app.css + build/app.js (+ build/fonts/).
 *   node scripts/build-web.js            minificado (APK / hosting)
 *   node scripts/build-web.js --dev      com sourcemap, sem minificar (debug)
 * index.html (raiz) aponta para ./build/*, então preview local e Firebase Hosting usam o mesmo build.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build');
const dev = process.argv.includes('--dev');

/** O código já usa `?.`/`??`; es2020 só impede o minificador de gerar sintaxe mais nova (ex.: `||=`). */
const TARGET = 'es2020';

function sizeLine(file) {
  const buf = fs.readFileSync(file);
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  return `${path.relative(root, file).padEnd(40)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  (gzip ${(gz / 1024).toFixed(1)} KB)`;
}

async function main() {
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

  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (!p.endsWith('.map')) files.push(p);
    }
  };
  walk(outDir);
  files.push(path.join(root, 'index.html'));
  console.log(files.map(sizeLine).join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
