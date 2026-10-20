'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { injectAbiFilters, DEVICE_ABIS, EMULATOR_ABIS } = require('../lib/android-gradle.js');

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
