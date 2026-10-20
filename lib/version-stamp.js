'use strict';

/**
 * `version.json` é a fonte da verdade da versão, mas ela aparece em três arquivos
 * gerados: o `CACHE_NAME` do service worker, e `ROTAFLOW_APP_VERSION` /
 * `ROTAFLOW_VERSION_CODE` no firebase-config. Antes, só a cópia em `www/` (a que vai
 * para o APK) era carimbada, e o `sw.js` da raiz — que é o publicado no Hosting —
 * dependia de alguém lembrar de editá-lo à mão. Esquecer esse passo entrega HTML novo
 * com JavaScript velho para quem já tem o PWA instalado, porque o shell só é
 * reinvalidado quando o `CACHE_NAME` muda.
 *
 * Estas funções são puras (string → string) para poderem ser testadas sem tocar disco;
 * quem lê e escreve arquivo é `scripts/build-web.js` e `scripts/prepare-www.js`.
 */

const CACHE_NAME_RE = /^(\s*const CACHE_NAME = )'[^']*';/m;

class VersionStampError extends Error {}

/**
 * Os arquivos carimbados usam aspas simples, como o resto do repositório.
 * Em troca, o valor não pode conter aspa, barra invertida ou quebra de linha —
 * o que vale para nome de versão e de cache, mas precisa ser verificado.
 */
function singleQuoted(value, field) {
  if (/['\\\r\n]/.test(value)) {
    throw new VersionStampError(`${field}: valor não pode conter aspa, barra invertida ou quebra de linha`);
  }
  return `'${value}'`;
}

/**
 * @param {any} version conteúdo de version.json
 * @returns {{ versionName: string, versionCode: number, swCache: string }}
 */
function assertVersionShape(version) {
  const v = version && typeof version === 'object' ? version : {};
  if (typeof v.versionName !== 'string' || !v.versionName.trim()) {
    throw new VersionStampError('version.json: versionName precisa ser uma string não vazia');
  }
  if (!Number.isInteger(v.versionCode) || v.versionCode <= 0) {
    throw new VersionStampError('version.json: versionCode precisa ser um inteiro positivo');
  }
  if (typeof v.swCache !== 'string' || !v.swCache.trim()) {
    throw new VersionStampError('version.json: swCache precisa ser uma string não vazia');
  }
  return { versionName: v.versionName, versionCode: v.versionCode, swCache: v.swCache };
}

/**
 * Substitui o `const CACHE_NAME = '...'` do service worker.
 * Falha em vez de devolver o arquivo intacto: um carimbo que não pega é pior do que
 * um build que quebra, porque só aparece como bug em produção dias depois.
 *
 * @param {string} source conteúdo do sw.js
 * @param {string} cacheName valor de version.json#swCache
 * @returns {string}
 */
function stampServiceWorkerCache(source, cacheName) {
  if (typeof source !== 'string') throw new VersionStampError('sw.js: conteúdo inválido');
  if (typeof cacheName !== 'string' || !cacheName.trim()) {
    throw new VersionStampError('sw.js: swCache vazio');
  }
  if (!CACHE_NAME_RE.test(source)) {
    throw new VersionStampError("sw.js: âncora `const CACHE_NAME = '...'` não encontrada");
  }
  return source.replace(CACHE_NAME_RE, (_m, prefix) => `${prefix}${singleQuoted(cacheName, 'swCache')};`);
}

/** Lê o `CACHE_NAME` declarado em um sw.js (usado pela verificação do build). */
function readServiceWorkerCache(source) {
  const match = typeof source === 'string' ? source.match(CACHE_NAME_RE) : null;
  if (!match) return null;
  const quoted = source.slice(match.index, match.index + match[0].length);
  const value = quoted.match(/'([^']*)'/);
  return value ? value[1] : null;
}

/**
 * Reescreve as duas linhas de versão do firebase-config.js, removendo as anteriores
 * para que carimbar duas vezes não duplique declaração.
 *
 * @param {string} source conteúdo do firebase-config.js
 * @param {{ versionName: string, versionCode: number }} version
 * @returns {string}
 */
function stampAppVersion(source, version) {
  if (typeof source !== 'string') throw new VersionStampError('firebase-config.js: conteúdo inválido');
  const { versionName, versionCode } = assertVersionShape({ swCache: 'x', ...version });
  const base = source
    .replace(/^window\.ROTAFLOW_APP_VERSION\s*=.*$/m, '')
    .replace(/^window\.ROTAFLOW_VERSION_CODE\s*=.*$/m, '')
    .replace(/\s+$/, '');
  return `${base}\nwindow.ROTAFLOW_APP_VERSION = ${singleQuoted(versionName, 'versionName')};\n`
    + `window.ROTAFLOW_VERSION_CODE = ${Number(versionCode)};\n`;
}

module.exports = {
  VersionStampError,
  assertVersionShape,
  stampServiceWorkerCache,
  readServiceWorkerCache,
  stampAppVersion
};
