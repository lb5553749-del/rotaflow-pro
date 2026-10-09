'use strict';

/**
 * Gera o subset do Font Awesome 6.5.1 usado pelo app (offline no APK, sem CDN).
 *   - varre index.html + src/js + src/styles atrás de `fa-*`
 *   - escreve src/styles/icons.css (só as classes usadas) e src/fonts/fa-*.subset.woff2
 * Roda sozinho no `npm run build`; ícone novo no código entra no próximo build.
 */

const fs = require('fs');
const path = require('path');
const subsetFont = require('subset-font');

const root = path.join(__dirname, '..');
const faDir = path.join(root, 'node_modules/@fortawesome/fontawesome-free');
const outCss = path.join(root, 'src/styles/icons.css');
const fontsDir = path.join(root, 'src/fonts');

/** Classes utilitárias do FA (não são glifos). */
const UTILITY = new Set(['fa-spin']);

function listSources() {
  const files = [path.join(root, 'index.html')];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|css|html)$/.test(ent.name) && p !== outCss) files.push(p);
    }
  };
  walk(path.join(root, 'src'));
  return files;
}

function usedIconNames() {
  const names = new Set();
  for (const file of listSources()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bfa-[a-z0-9]+(?:-[a-z0-9]+)*/g)) names.add(m[0]);
  }
  return names;
}

/** `.fa-x::before { content: "\f123"; }` → Map(name → codepoint hex) */
function parseGlyphs(cssFile) {
  const css = fs.readFileSync(path.join(faDir, 'css', cssFile), 'utf8');
  const map = new Map();
  for (const m of css.matchAll(/([^{}]+)\{\s*content:\s*"\\([0-9a-f]+)";\s*\}/gi)) {
    for (const sel of m[1].split(',')) {
      const name = /\.(fa-[a-z0-9-]+)::?before/.exec(sel.trim());
      if (name) map.set(name[1], m[2].toLowerCase());
    }
  }
  return map;
}

const BASE_CSS = `.fa,.fas,.fa-solid,.fab,.fa-brands{-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;display:var(--fa-display,inline-block);font-style:normal;font-variant:normal;line-height:1;text-rendering:auto}
.fa{font-family:var(--fa-style-family,"Font Awesome 6 Free");font-weight:var(--fa-style,900)}
.fas,.fa-solid{font-family:"Font Awesome 6 Free";font-weight:900}
.fab,.fa-brands{font-family:"Font Awesome 6 Brands";font-weight:400}`;

const SPIN_CSS = `.fa-spin{animation-name:fa-spin;animation-delay:var(--fa-animation-delay,0s);animation-direction:var(--fa-animation-direction,normal);animation-duration:var(--fa-animation-duration,2s);animation-iteration-count:var(--fa-animation-iteration-count,infinite);animation-timing-function:var(--fa-animation-timing,linear)}
@media (prefers-reduced-motion:reduce){.fa-spin{animation-delay:-1ms;animation-duration:1ms;animation-iteration-count:1;transition-delay:0s;transition-duration:0s}}
@keyframes fa-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`;

async function writeSubset(srcFont, outName, codepoints) {
  const text = [...codepoints].map((hex) => String.fromCodePoint(parseInt(hex, 16))).join('');
  const buf = await subsetFont(fs.readFileSync(path.join(faDir, 'webfonts', srcFont)), text, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(fontsDir, outName), buf);
  return buf.length;
}

async function main() {
  const used = usedIconNames();
  const solid = parseGlyphs('fontawesome.css');
  const brands = parseGlyphs('brands.css');

  const solidRules = [];
  const brandRules = [];
  const solidCps = new Set();
  const brandCps = new Set();
  const missing = [];
  for (const name of [...used].sort()) {
    if (UTILITY.has(name)) continue;
    if (brands.has(name)) {
      brandRules.push(`.${name}:before{content:"\\${brands.get(name)}"}`);
      brandCps.add(brands.get(name));
    } else if (solid.has(name)) {
      solidRules.push(`.${name}::before{content:"\\${solid.get(name)}"}`);
      solidCps.add(solid.get(name));
    } else {
      missing.push(name);
    }
  }

  fs.mkdirSync(fontsDir, { recursive: true });
  const solidBytes = await writeSubset('fa-solid-900.woff2', 'fa-solid-900.subset.woff2', solidCps);
  const brandBytes = brandCps.size ? await writeSubset('fa-brands-400.woff2', 'fa-brands-400.subset.woff2', brandCps) : 0;

  const css = [
    '/*! Font Awesome Free 6.5.1 (subset) by @fontawesome - https://fontawesome.com',
    ' * License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)',
    ' * GERADO por scripts/build-icons.js — não editar à mão. */',
    // font-display:swap — fontes FA são subset local (APK), sempre disponíveis offline. swap evita FOIT.
    `@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:swap;src:url("../fonts/fa-solid-900.subset.woff2") format("woff2")}`,
    brandCps.size
      ? `@font-face{font-family:"Font Awesome 6 Brands";font-style:normal;font-weight:400;font-display:swap;src:url("../fonts/fa-brands-400.subset.woff2") format("woff2")}`
      : '',
    BASE_CSS,
    used.has('fa-spin') ? SPIN_CSS : '',
    ...solidRules,
    ...brandRules,
    ''
  ].filter((l) => l !== '').join('\n') + '\n';
  fs.writeFileSync(outCss, css);

  console.log(`icons: ${solidCps.size} solid (${solidBytes} B) + ${brandCps.size} brands (${brandBytes} B) -> src/styles/icons.css`);
  if (missing.length) {
    // Não existem no FA Free 6.5.1 (também não apareciam com o CDN).
    console.warn(`icons: sem glifo no FA Free 6.5.1 (ficam em branco, como antes): ${missing.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
