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
