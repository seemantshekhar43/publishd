// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.astro/**',
      '**/.vercel/**',
      '**/coverage/**',
      '.inkloop/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // An unused name prefixed with _ is a deliberate signal, not an oversight.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The ingest endpoint logs deliberately; everything else should not.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-implicit-coercion': 'error',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/web/src/pages/api/ingest.ts', 'apps/web/src/pages/api/unpublish.ts'],
    rules: { 'no-console': ['warn', { allow: ['warn', 'error', 'log'] }] },
  },
  {
    // .cjs deliberately opts out of the repo's "type": "module" default -
    // lighthouserc.cjs (issue #29) needs real CommonJS `module.exports`,
    // since lhci's own config loader expects it.
    files: ['**/*.cjs'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    // Node scripts, not run through tsc, so `no-undef` doesn't get the
    // TS-aware pass that covers the rest of the codebase's .ts files.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: { 'no-console': ['warn', { allow: ['warn', 'error', 'log'] }] },
  },
  prettier,
);
