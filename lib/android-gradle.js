'use strict';

/**
 * Patches idempotentes no `android/app/build.gradle` gerado pelo Capacitor.
 * Puro (recebe e devolve string) para poder ser testado sem SDK Android.
 */

/** ABIs que existem em celular. x86/x86_64 só servem em emulador. */
const DEVICE_ABIS = ['arm64-v8a', 'armeabi-v7a'];
const EMULATOR_ABIS = ['x86', 'x86_64'];

/**
 * Injeta `ndk { abiFilters ... }` dentro de `defaultConfig` quando ainda não existe.
 * Sem isso o APK empacota as .so de x86/x86_64 que nenhum celular usa
 * (~1,5 MB no RotaFlow 1.5.31). Mantém arm64 + armeabi-v7a (cobre todo Android 7+).
 *
 * @param {string} gradle conteúdo do build.gradle
 * @param {{ allowX86?: boolean }} [opts] allowX86: mantém x86/x86_64 para testar em emulador
 * @returns {{ gradle: string, changed: boolean }}
 */
function injectAbiFilters(gradle, opts = {}) {
  const src = String(gradle || '');
  if (/\babiFilters\b/.test(src)) return { gradle: src, changed: false };
  if (!/defaultConfig\s*\{/.test(src)) return { gradle: src, changed: false };

  const abis = DEVICE_ABIS.concat(opts.allowX86 ? EMULATOR_ABIS : []);
  const quoted = abis.map((a) => `'${a}'`).join(', ');
  const block = `defaultConfig {\n        ndk {\n            abiFilters ${quoted}\n        }`;

  return { gradle: src.replace(/defaultConfig\s*\{/, block), changed: true };
}

module.exports = { DEVICE_ABIS, EMULATOR_ABIS, injectAbiFilters };

/** Idiomas que o app realmente tem. `resConfigs` corta os ~80 que vêm dos AARs. */
const DEFAULT_RES_CONFIGS = ['pt', 'pt-rBR'];

/** Regras ProGuard gerenciadas — sem elas, R8 remove classe que só é usada por reflexão. */
const PROGUARD_BEGIN = '# >>> rotaflow-managed';
const PROGUARD_END = '# <<< rotaflow-managed';
const PROGUARD_RULES = `${PROGUARD_BEGIN}
# Gerado por scripts/patch-screen-events-android.js — não editar à mão.
# O Capacitor resolve plugins e o bridge do WebView por reflexão; o R8 não
# enxerga essas referências e remove as classes se não estiverem listadas.
-keep class com.getcapacitor.** { *; }
-keep class com.rotaflow.pro.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*, JavascriptInterface, Signature, InnerClasses, EnclosingMethod
-dontwarn org.apache.cordova.**
${PROGUARD_END}
`;

/**
 * Localiza um bloco `nome { ... }` e devolve os índices das chaves.
 * Conta chaves para não se perder com blocos aninhados.
 * @returns {{ open: number, close: number } | null}
 */
function findBlock(src, name) {
  // aceita o bloco em qualquer posição (linha própria ou no meio de outra),
  // mas exige fronteira de palavra: `debugRelease {` não é `release {`
  const m = new RegExp(`(^|[^\\w.$])${name}\\s*\\{`).exec(src);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return { open, close: i };
    }
  }
  return null;
}

/**
 * Deixa o buildType `release` pronto para publicar: R8 + shrinkResources +
 * regras ProGuard próprias. Idempotente.
 *
 * @param {string} gradle conteúdo do build.gradle
 * @param {{ minify?: boolean }} [opts] minify=false desliga (escape hatch)
 * @returns {{ gradle: string, changed: boolean, changes: string[] }}
 */
function hardenRelease(gradle, opts = {}) {
  const src = String(gradle || '');
  const release = findBlock(src, 'release');
  if (!release) return { gradle: src, changed: false, changes: [] };

  let block = src.slice(release.open, release.close + 1);
  const changes = [];
  const minify = opts.minify !== false;
  const temMinify = /minifyEnabled\s+\w+/.test(block);
  const ligado = /minifyEnabled\s+true/.test(block);

  if (minify && !ligado) {
    if (temMinify) block = block.replace(/minifyEnabled\s+false/, 'minifyEnabled true');
    else block = block.replace(/\{/, '{\n            minifyEnabled true');
    changes.push('minifyEnabled true');
  } else if (!minify && ligado) {
    block = block.replace(/minifyEnabled\s+true/, 'minifyEnabled false');
    changes.push('minifyEnabled false');
  }

  const querShrink = minify;
  const temShrink = /shrinkResources\s+\w+/.test(block);
  if (querShrink && !/shrinkResources\s+true/.test(block)) {
    if (temShrink) block = block.replace(/shrinkResources\s+false/, 'shrinkResources true');
    else block = block.replace(/minifyEnabled\s+true/, 'minifyEnabled true\n            shrinkResources true');
    changes.push('shrinkResources true');
  } else if (!querShrink && /shrinkResources\s+true/.test(block)) {
    block = block.replace(/shrinkResources\s+true/, 'shrinkResources false');
    changes.push('shrinkResources false');
  }

  if (minify) {
    if (!/proguardFiles/.test(block)) {
      block = block.replace(
        /minifyEnabled\s+true/,
        "minifyEnabled true\n            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'"
      );
      changes.push('proguardFiles');
    } else if (/proguard-android\.txt/.test(block)) {
      // o arquivo básico desliga otimizações; com R8 o correto é o -optimize
      block = block.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');
      changes.push('proguardFiles otimizado');
    }
  }

  if (!changes.length) return { gradle: src, changed: false, changes: [] };
  return {
    gradle: src.slice(0, release.open) + block + src.slice(release.close + 1),
    changed: true,
    changes,
  };
}

/**
 * Injeta `resConfigs` em `defaultConfig`: corta os idiomas dos AARs de biblioteca
 * (o `resources.arsc` do RotaFlow tem 877 KB e o app só fala português).
 */
function injectResConfigs(gradle, locales = DEFAULT_RES_CONFIGS) {
  const src = String(gradle || '');
  if (/\bresConfigs\b/.test(src)) return { gradle: src, changed: false };
  if (!/defaultConfig\s*\{/.test(src)) return { gradle: src, changed: false };
  const quoted = locales.map((l) => `"${l}"`).join(', ');
  return {
    gradle: src.replace(/defaultConfig\s*\{/, `defaultConfig {\n        resConfigs ${quoted}\n`),
    changed: true,
  };
}

/**
 * Acrescenta (uma vez só) o bloco gerenciado de regras ProGuard.
 * Preserva o que já existe no arquivo, inclusive regras escritas à mão.
 */
function mergeProguardRules(text) {
  const src = String(text || '');
  if (src.includes(PROGUARD_BEGIN)) return { text: src, changed: false };
  const sep = src && !src.endsWith('\n') ? '\n\n' : src ? '\n' : '';
  return { text: src + sep + PROGUARD_RULES, changed: true };
}

module.exports = {
  DEVICE_ABIS,
  EMULATOR_ABIS,
  DEFAULT_RES_CONFIGS,
  PROGUARD_RULES,
  injectAbiFilters,
  hardenRelease,
  injectResConfigs,
  mergeProguardRules,
  findBlock,
};
