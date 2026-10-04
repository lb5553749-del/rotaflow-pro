'use strict';

/**
 * Lint do RotaFlow Pro.
 *
 * O projeto mistura quatro ambientes que não compartilham globais:
 *   lib/, scripts/, test/, functions/  → CommonJS em Node
 *   src/js/, native/                   → ESM no navegador, empacotado pelo esbuild
 *   sw.js, track-sw.js                 → service worker
 *   firebase-config.js                 → script clássico no navegador
 *
 * As regras foram escolhidas para pegar erro de verdade (variável inexistente, `await`
 * esquecido, atribuição em condicional) sem brigar com o estilo já consolidado do
 * `main.js`. `catch (_) {}` é intencional no código e continua permitido.
 */

const js = require('@eslint/js');
const globals = require('globals');

/** Globais que o app injeta em `window` ou que vêm de script externo. */
const appGlobals = {
  google: 'readonly',
  firebase: 'readonly',
  Capacitor: 'readonly',
  RotaFlowCap: 'readonly',
  RotaFlowPush: 'readonly'
};

const sharedRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': ['error', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_'
  }],
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  eqeqeq: ['error', 'smart'],
  'no-implicit-coercion': 'off',
  'require-atomic-updates': 'off',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-async-promise-executor': 'error',
  'no-await-in-loop': 'off',
  'no-return-await': 'error',
  'no-throw-literal': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-unreachable-loop': 'error',
  'no-self-compare': 'error',
  'no-template-curly-in-string': 'error'
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'www/**',
      'dist/**',
      'android/**',
      '.firebase/**',
      'functions/node_modules/**',
      'estudo-transpetro/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: sharedRules
  },
  {
    files: ['src/js/**/*.js', 'native/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...appGlobals }
    }
  },
  {
    files: ['sw.js', 'track-sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser }
    }
  },
  {
    files: ['firebase-config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser }
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  }
];
