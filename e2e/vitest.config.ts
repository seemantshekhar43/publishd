import { defineConfig } from 'vitest/config';

// Deliberately excluded from vitest.config.ts's default include glob and
// from `pnpm test`: this suite hits real network endpoints and needs
// staging credentials, unlike the unit suite. Run via `pnpm test:e2e`. See
// docs/development.md and issue #10.
export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
