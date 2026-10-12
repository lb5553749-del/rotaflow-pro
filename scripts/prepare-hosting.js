'use strict';

/**
 * Monta `public/` — a allowlist do Firebase Hosting.
 *
 * Antes o Hosting publicava a raiz do repositório com uma *blocklist* (`ignore`).
 * O problema: `build/` é gerado e fica no `.gitignore`, então um deploy rodado em
 * máquina sem `npm run build` — ou após `git clean` — subia o `index.html` sem o
 * `build/app.js`. Isso já aconteceu: o site ficou no ar sem JavaScript nem CSS.
 * Qualquer arquivo novo na raiz também ia para produção por padrão.
 *
 * Agora o build copia só o que o site realmente referencia. Se faltar qualquer
 * coisa, o script aborta antes do deploy. Os assets de `build/` ainda ganham um
 * hash no nome para poderem ser servidos com `Cache-Control: immutable`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { readServiceWorkerCache } = require('../lib/version-stamp');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

/** Arquivos soltos na raiz que o site carrega. */
const ROOT_FILES = [
  'index.html',
  'sw.js',
  'firebase-config.js',
  // Página pública de rastreio (/r/<token> → rewrite para track.html)
  'track.html',
  'track-sw.js',
  'track-manifest.webmanifest',
  'track-badge-96.png',
  'track-icon-192.png',
  'track-notify-banner.png',
  'track-notify.wav',
  'track-box-marker.png',
  'track-flag-marker.png'
];

/** Arquivos de texto que podem referenciar `build/**` e precisam de reescrita. */
const REFERRERS = ['index.html', 'track.html', 'sw.js', 'track-sw.js', 'build/app.css', 'build/app.js'];

function copyFile(rel) {
  const src = path.join(root, rel);
  const dst = path.join(publicDir, rel);
  if (!fs.existsSync(src)) {
    throw new Error(`staging: arquivo ausente no repositório: ${rel}`);
  }
  fs.copyFileSync(src, dst);
  return dst;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Caminhos referenciados por index.html / track.html / sw.js que têm que chegar ao ar. */
function referencedBuildAssets() {
  const refs = [];

  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  for (const m of indexHtml.matchAll(/(?:src|href)="\.?\/?(build\/[^"?"]+)"/g)) {
    refs.push(m[1]);
  }

  const trackHtml = fs.readFileSync(path.join(publicDir, 'track.html'), 'utf8');
  for (const m of trackHtml.matchAll(/(?:src|href)="\.?\/?(build\/[^"?"]+)"/g)) {
    refs.push(m[1]);
  }

  const swSource = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  for (const m of swSource.matchAll(/'\.\/(build\/[^']+)'/g)) {
    refs.push(m[1]);
  }

  // track-sw.js importa /build/track-shared.js via importScripts (caminho absoluto).
  const trackSw = fs.readFileSync(path.join(publicDir, 'track-sw.js'), 'utf8');
  for (const m of trackSw.matchAll(/['"](\/build\/[^'"]+)['"]/g)) {
    refs.push(m[1].slice(1));
  }

  return [...new Set(refs)];
}

/**
 * Renomeia cada arquivo de `build/` para `<nome>-<hash><ext>` e reescreve as
 * referências nos arquivos que o citam. Sem isso, `Cache-Control: immutable` em
 * `/build/**` faria o navegador servir `app.js` antigo depois de um deploy.
 * O hash é de conteúdo: arquivos que não mudam mantêm o nome e continuam quentes.
 */
function hashBuildAssets() {
  const pairs = [];
  const renames = [];

  // Primeiro passo: lê cada arquivo, calcula o hash e separa o conteúdo reescrito.
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (p.endsWith('.map')) continue;
      const rel = path.relative(path.join(publicDir, 'build'), p);
      const digest = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
      const ext = path.extname(rel);
      const next = `${path.join(path.dirname(rel), `${path.basename(rel, ext)}-${digest}`)}${ext}`;
      pairs.push([rel, next]);
      renames.push([p, path.join(path.dirname(p), path.basename(next))]);
    }
  };
  walk(path.join(publicDir, 'build'));

  // Caminho mais longo primeiro: nenhum par pode ser prefixo de outro na hora de substituir.
  pairs.sort((a, b) => b[0].length - a[0].length);

  // Segundo passo: reescreve as referências. Roda antes de renomear porque
  // `build/app.css` e `build/app.js` são eles próprios referrers.
  for (const rel of REFERRERS) {
    const file = path.join(publicDir, rel);
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    for (const [from, to] of pairs) {
      // Borda: separa de identificadores (ex.: `xapp.js`) e de sufixos (`.map`),
      // mas aceita `/` à esquerda (referências relativas como `./fonts/x.woff2`).
      const re = new RegExp(`(?<![-\\w.])${escapeRegExp(from)}(?![-\\w/])`, 'g');
      text = text.replace(re, to);
    }
    fs.writeFileSync(file, text);
  }

  for (const [from, to] of renames) fs.renameSync(from, to);

  return pairs;
}

function stageBuildDir() {
  const buildDir = path.join(root, 'build');
  if (!fs.existsSync(buildDir)) {
    throw new Error('staging: build/ não existe — rode `npm run build` antes');
  }

  // Copia o build inteiro (sem .map) e depois confirma que todo arquivo referenciado
  // pelos HTMLs está lá. Sobra inofensiva é melhor que referência quebrada.
  fs.cpSync(buildDir, path.join(publicDir, 'build'), {
    recursive: true,
    filter: (src) => !src.endsWith('.map')
  });

  const missing = referencedBuildAssets().filter((rel) => !fs.existsSync(path.join(publicDir, rel)));
  if (missing.length) {
    throw new Error(`staging: build incompleto, faltam: ${missing.join(', ')}`);
  }

  const pairs = hashBuildAssets();

  // Depois de reescrever, nenhuma referência pode apontar para o nome antigo.
  const broken = referencedBuildAssets().filter((rel) => !fs.existsSync(path.join(publicDir, rel)));
  if (broken.length) {
    throw new Error(`staging: referência não resolvida após o hash: ${broken.join(', ')}`);
  }

  return pairs;
}

function assertSwStamped() {
  const cacheName = readServiceWorkerCache(fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8'));
  if (!cacheName) {
    throw new Error('staging: sw.js sem CACHE_NAME carimbado — o PWA instalado serviria JS antigo');
  }
}

function main() {
  // Build antes do staging: sem isso, public/ pode conter assets de uma versão velha.
  execFileSync(process.execPath, [path.join(__dirname, 'build-web.js')], { cwd: root, stdio: 'inherit' });

  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });

  for (const rel of ROOT_FILES) copyFile(rel);
  const pairs = stageBuildDir();
  assertSwStamped();

  for (const [, to] of pairs) console.log(`  build/${to}`);
  console.log(`public/ pronto para o Hosting: ${ROOT_FILES.length} raiz + build/ (${pairs.length} assets com hash)`);
}

main();
