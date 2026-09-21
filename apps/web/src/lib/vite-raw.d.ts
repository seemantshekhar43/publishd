/**
 * Astro's own tsconfig (`astro/tsconfigs/strict`) pulls in `astro/client`,
 * which already declares Vite's `?raw` import suffix - this file exists
 * only so `tsconfig.tests.json` (root `tsc -b`, no Astro types) can
 * type-check `icons.ts` too. See `src/lib/icons.ts`.
 */
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
