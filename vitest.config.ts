import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    passWithNoTests: true,
    // *.build.test.ts files run a real `astro build` / sync script against
    // the shared apps/web/src/content/ directory - two of them running in
    // different worker processes at once can race on that directory, so
    // test files run one at a time rather than in parallel workers.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['{apps,packages}/*/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
