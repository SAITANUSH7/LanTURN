// Flat ESLint config for the server (ESM, Node) and the shipped client (browser ES modules in public/).
// The optional React app in frontend/ has its own config; it is linted separately when it is worked on.
import js from '@eslint/js';

const common = {
  ...js.configs.recommended,
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    globals: {
      console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
      setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
      fetch: 'readonly', Response: 'readonly', Request: 'readonly', Headers: 'readonly', AbortController: 'readonly',
      TextEncoder: 'readonly', TextDecoder: 'readonly', structuredClone: 'readonly', crypto: 'readonly',
      performance: 'readonly', queueMicrotask: 'readonly', Blob: 'readonly', FormData: 'readonly', File: 'readonly',
    },
  },
  rules: {
    // Unused *arguments* are often part of a middleware signature (err, req, res, next); only flag real dead code.
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-console': 'off',
    eqeqeq: ['warn', 'smart'],
    'prefer-const': 'warn',
    'no-var': 'error',
    'object-shorthand': 'warn',
    // The client builds DOM nodes with a helper that escapes text; template strings of markup are still a smell.
    'no-template-curly-in-string': 'off',
    'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true }],
  },
};

export default [
  { ignores: ['node_modules/**', 'frontend/**', 'data/**', 'backups/**', 'native/build/**', 'public/sw.js', 'coverage/**'] },
  common,
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
        navigator: 'readonly', location: 'readonly', history: 'readonly', fetch: 'readonly', caches: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', matchMedia: 'readonly', getComputedStyle: 'readonly',
        IntersectionObserver: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly', HTMLElement: 'readonly',
        Element: 'readonly', Node: 'readonly', Event: 'readonly', CustomEvent: 'readonly', DOMParser: 'readonly',
        CustomElementRegistry: 'readonly', self: 'readonly', serviceWorker: 'readonly', alert: 'readonly', confirm: 'readonly',
      },
    },
  },
  {
    files: ['test/**/*.js', 'e2e/**/*.js', 'scripts/**/*.js', '*.config.js'],
    rules: { 'no-unused-vars': 'off' },
  },
];
