'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  injectAbiFilters,
  hardenRelease,
  injectResConfigs,
  mergeProguardRules,
  findBlock,
  DEVICE_ABIS,
  EMULATOR_ABIS,
} = require('../lib/android-gradle.js');

const SAMPLE = `apply plugin: 'com.android.application'

android {
    namespace "com.rotaflow.pro"
    compileSdkVersion rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.rotaflow.pro"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
    }
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
        }
    }
}`;

describe('injectAbiFilters', () => {
  it('injeta só as ABIs de celular dentro de defaultConfig', () => {
    const { gradle, changed } = injectAbiFilters(SAMPLE);
    assert.equal(changed, true);
    assert.match(gradle, /abiFilters 'arm64-v8a', 'armeabi-v7a'/);
    assert.doesNotMatch(gradle, /'x86'/);
    // precisa ficar dentro do defaultConfig
    const dc = gradle.slice(gradle.indexOf('defaultConfig'), gradle.indexOf('buildTypes'));
    assert.match(dc, /abiFilters/);
  });

  it('é idempotente (não duplica o bloco)', () => {
    const first = injectAbiFilters(SAMPLE).gradle;
    const second = injectAbiFilters(first);
    assert.equal(second.changed, false);
    assert.equal(second.gradle, first);
    assert.equal((first.match(/abiFilters/g) || []).length, 1);
  });

  it('allowX86 mantém as ABIs de emulador', () => {
    const { gradle } = injectAbiFilters(SAMPLE, { allowX86: true });
    for (const abi of [...DEVICE_ABIS, ...EMULATOR_ABIS]) {
      assert.match(gradle, new RegExp(`'${abi}'`));
    }
  });

  it('não mexe em gradle sem defaultConfig', () => {
    const src = 'android { buildTypes { release { } } }';
    assert.deepEqual(injectAbiFilters(src), { gradle: src, changed: false });
  });

  it('respeita abiFilters já existente (não sobrescreve)', () => {
    const custom = SAMPLE.replace('defaultConfig {', "defaultConfig {\n        ndk { abiFilters 'arm64-v8a' }");
    const r = injectAbiFilters(custom);
    assert.equal(r.changed, false);
    assert.equal(r.gradle, custom);
  });
});

describe('hardenRelease', () => {
  const CAP = `android {
    defaultConfig { applicationId "com.rotaflow.pro" }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
        debug { minifyEnabled false }
    }
}`;

  it('liga R8, shrinkResources e troca para o proguard otimizado', () => {
    const { gradle, changed, changes } = hardenRelease(CAP);
    assert.equal(changed, true);
    const rel = gradle.slice(gradle.indexOf('release {'), gradle.indexOf('debug {'));
    assert.match(rel, /minifyEnabled true/);
    assert.match(rel, /shrinkResources true/);
    assert.match(rel, /proguard-android-optimize\.txt/);
    assert.deepEqual(changes, ['minifyEnabled true', 'shrinkResources true', 'proguardFiles otimizado']);
  });

  it('não toca no bloco debug', () => {
    const { gradle } = hardenRelease(CAP);
    const dbg = gradle.slice(gradle.indexOf('debug {'));
    assert.match(dbg, /minifyEnabled false/);
  });

  it('é idempotente', () => {
    const uma = hardenRelease(CAP).gradle;
    const duas = hardenRelease(uma);
    assert.equal(duas.changed, false);
    assert.equal(duas.gradle, uma);
  });

  it('cria minifyEnabled do zero quando o bloco release está vazio', () => {
    const vazio = 'android { buildTypes { release { } } }';
    const { gradle } = hardenRelease(vazio);
    assert.match(gradle, /minifyEnabled true/);
    assert.match(gradle, /shrinkResources true/);
    assert.match(gradle, /proguardFiles/);
  });

  it('escape hatch: minify=false desliga R8 e shrinkResources', () => {
    const { gradle, changes } = hardenRelease(hardenRelease(CAP).gradle, { minify: false });
    assert.match(gradle, /minifyEnabled false/);
    assert.match(gradle, /shrinkResources false/);
    assert.ok(changes.includes('minifyEnabled false'));
  });

  it('sem bloco release não inventa nada', () => {
    const sem = 'android { buildTypes { debug { } } }';
    assert.deepEqual(hardenRelease(sem), { gradle: sem, changed: false, changes: [] });
  });
});

describe('injectResConfigs', () => {
  const G = `android {
    defaultConfig {
        applicationId "com.rotaflow.pro"
    }
}`;

  it('injeta pt e pt-rBR dentro do defaultConfig', () => {
    const { gradle, changed } = injectResConfigs(G);
    assert.equal(changed, true);
    const dc = gradle.slice(gradle.indexOf('defaultConfig'), gradle.indexOf('applicationId'));
    assert.match(dc, /resConfigs "pt", "pt-rBR"/);
  });

  it('é idempotente e respeita lista customizada', () => {
    const uma = injectResConfigs(G).gradle;
    assert.equal(injectResConfigs(uma).changed, false);
    assert.match(injectResConfigs(G, ['pt']).gradle, /resConfigs "pt"/);
  });
});

describe('mergeProguardRules', () => {
  it('cria o bloco gerenciado preservando regras escritas à mão', () => {
    const manual = '-keep class com.exemplo.Manual { *; }\n';
    const { text, changed } = mergeProguardRules(manual);
    assert.equal(changed, true);
    assert.ok(text.startsWith(manual.trim()), 'mantém o conteúdo original na frente');
    assert.match(text, /-keep class com\.getcapacitor\.\*\* \{ \*; \}/);
    assert.match(text, /JavascriptInterface <methods>/);
    assert.match(text, /rotaflow-managed/);
  });

  it('é idempotente', () => {
    const uma = mergeProguardRules('').text;
    const duas = mergeProguardRules(uma);
    assert.equal(duas.changed, false);
    assert.equal(duas.text, uma);
    assert.equal(uma.match(/rotaflow-managed/g).length, 2, 'um bloco só (início + fim)');
  });
});

describe('findBlock', () => {
  it('acha o bloco aninhado e devolve os limites certos', () => {
    const g = 'a { b { c } release { x { y } } }';
    const r = findBlock(g, 'release');
    assert.ok(r);
    // open/close são as chaves; o nome do bloco fica de fora de propósito
    assert.equal(g.slice(r.open, r.close + 1), '{ x { y } }');
  });

  it('não confunde nome que termina igual', () => {
    assert.equal(findBlock('android { debugRelease { } }', 'release'), null);
  });
});
