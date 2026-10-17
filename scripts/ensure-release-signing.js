#!/usr/bin/env node
/**
 * Garante keystore local + signingConfig no Gradle para assembleRelease.
 * Credenciais vêm de ROTAFLOW_STORE_PASSWORD / ROTAFLOW_KEY_PASSWORD (env, CI)
 * ou de signing/key.properties (local, gitignored). Nunca hardcoded.
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const signingDir = path.join(root, 'signing');
const keystorePath = path.join(signingDir, 'rotaflow-release.jks');
const propsPath = path.join(signingDir, 'key.properties');
const androidAppGradle = path.join(root, 'android', 'app', 'build.gradle');

const KEY_ALIAS = 'rotaflow';
const MARKER = 'ROTAFLOW_RELEASE_SIGNING';

function loadCredentials() {
  const envStore = process.env.ROTAFLOW_STORE_PASSWORD;
  if (envStore) {
    return { storePassword: envStore, keyPassword: process.env.ROTAFLOW_KEY_PASSWORD || envStore };
  }
  if (fs.existsSync(propsPath)) {
    const props = {};
    for (const line of fs.readFileSync(propsPath, 'utf8').split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    if (props.storePassword) {
      return {
        storePassword: props.storePassword,
        keyPassword: props.keyPassword || props.storePassword
      };
    }
  }
  return null;
}

function saveKeyProperties(creds) {
  const props = [
    `storePassword=${creds.storePassword}`,
    `keyPassword=${creds.keyPassword}`,
    `keyAlias=${KEY_ALIAS}`,
    `storeFile=${keystorePath.replace(/\\/g, '/')}`
  ].join('\n') + '\n';
  fs.writeFileSync(propsPath, props, 'utf8');
  try { fs.chmodSync(propsPath, 0o600); } catch { /* windows */ }
}

function generatePassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function ensureSigningFiles() {
  fs.mkdirSync(signingDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

  const creds = loadCredentials();

  if (!fs.existsSync(keystorePath)) {
    const storePassword = creds?.storePassword || generatePassword();
    const keyPassword = creds?.keyPassword || storePassword;
    const keytool = process.env.JAVA_HOME
      ? path.join(process.env.JAVA_HOME, 'bin', 'keytool')
      : 'keytool';
    console.log('Gerando keystore de release em signing/rotaflow-release.jks …');
    execFileSync(keytool, [
      '-genkeypair', '-v',
      '-keystore', keystorePath,
      '-alias', KEY_ALIAS,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-storepass', storePassword,
      '-keypass', keyPassword,
      '-dname', 'CN=RotaFlow Pro, OU=Mobile, O=RotaFlow, L=Porto Velho, ST=RO, C=BR'
    ], { stdio: 'inherit' });
    saveKeyProperties({ storePassword, keyPassword });
    console.log('Credenciais em signing/key.properties (chmod 600).');
    console.log('No CI, prefira ROTAFLOW_STORE_PASSWORD / ROTAFLOW_KEY_PASSWORD.');
    return propsPath;
  }

  if (!creds) {
    throw new Error(
      'Keystore existe, mas nenhuma credencial encontrada.\n' +
      'Defina ROTAFLOW_STORE_PASSWORD (e ROTAFLOW_KEY_PASSWORD) ou restaure signing/key.properties.'
    );
  }

  saveKeyProperties(creds);
  return propsPath;
}

function patchAppBuildGradle(propsFile) {
  if (!fs.existsSync(androidAppGradle)) {
    throw new Error('android/app/build.gradle não encontrado. Rode npm run cap:sync antes.');
  }

  let gradle = fs.readFileSync(androidAppGradle, 'utf8');
  if (gradle.includes(MARKER)) {
    console.log('signingConfig de release já aplicado no Gradle');
    return;
  }

  const propsEscaped = propsFile.replace(/\\/g, '/');
  const header = `// ${MARKER}
def rotaflowKeystorePropertiesFile = file("${propsEscaped}")
def rotaflowKeystoreProperties = new Properties()
if (rotaflowKeystorePropertiesFile.exists()) {
    rotaflowKeystoreProperties.load(new FileInputStream(rotaflowKeystorePropertiesFile))
}

`;

  gradle = header + gradle;

  if (!/signingConfigs\s*\{/.test(gradle)) {
    gradle = gradle.replace(
      /defaultConfig\s*\{/,
      `signingConfigs {
        release {
            if (rotaflowKeystorePropertiesFile.exists()) {
                keyAlias rotaflowKeystoreProperties['keyAlias']
                keyPassword rotaflowKeystoreProperties['keyPassword']
                storeFile file(rotaflowKeystoreProperties['storeFile'])
                storePassword rotaflowKeystoreProperties['storePassword']
            }
        }
    }
    defaultConfig {`
    );
  }

  if (!gradle.includes('signingConfig signingConfigs.release')) {
    gradle = gradle.replace(
      /buildTypes\s*\{\s*\n\s*release\s*\{/,
      `buildTypes {
        release {
            signingConfig signingConfigs.release
`
    );
  }

  if (/versionCode\s+\d+/.test(gradle) && !gradle.includes(MARKER + '_VERSION_TOUCHED')) {
    // version.json / android-release.sh são a fonte da verdade — não forçar versão aqui.
  }
  if (/versionName\s+"[^"]+"/.test(gradle) && !gradle.includes(MARKER + '_VERSION_TOUCHED')) {
    // no-op: ver android-release.sh
  }

  fs.writeFileSync(androidAppGradle, gradle, 'utf8');
  console.log('Gradle atualizado com signingConfig release');
}

function main() {
  const props = ensureSigningFiles();
  patchAppBuildGradle(props);
  console.log('Release signing pronto.');
}

main();
