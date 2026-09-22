#!/usr/bin/env node
/**
 * Playwright's `webServer` (see `playwright.config.ts`) only serves an
 * already-built `dist/` - it can't build one itself, and the tests need
 * real content to screenshot an article and a tag page. Copies the same
 * fixtures the build tests use into the (normally CI-populated) posts
 * directory, builds once, runs Playwright, then removes the fixtures
 * again either way - see issue #29.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WEB_ROOT = join(ROOT, 'apps', 'web');
const POSTS_DIR = join(WEB_ROOT, 'src', 'content', 'posts');
const FIXTURES_DIR = join(WEB_ROOT, 'tests', 'fixtures');

const FIXTURES = ['published-post.md', 'tagged-post.md'];

function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

mkdirSync(POSTS_DIR, { recursive: true });
for (const fixture of FIXTURES) {
  copyFileSync(join(FIXTURES_DIR, fixture), join(POSTS_DIR, fixture));
}

try {
  run('pnpm', ['--filter', '@publishd/web', 'build'], {
    PUBLISHD_PREVIEW_SECRET: 'visual-test-preview-secret',
  });
  run('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)]);
} finally {
  for (const fixture of FIXTURES) {
    rmSync(join(POSTS_DIR, fixture), { force: true });
  }
}
