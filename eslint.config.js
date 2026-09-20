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
    files: ['apps/web/src/pages/api/ingest.ts'],
    rules: { 'no-console': ['warn', { allow: ['warn', 'error', 'log'] }] },
  },
  prettier,
);
