/**
 * M1 exit criterion: `publishd note.md` returns a working public URL. See
 * docs/roadmap.md's M1 section and issue #10.
 *
 * Runs against staging, never production - see docs/PRD.md section 11's
 * Environments table. Requires PUBLISHD_ENDPOINT (the staging deployment
 * URL), PUBLISHD_TOKEN (a valid client token), and GITHUB_TOKEN (to verify
 * the resulting commit and clean up the fixture afterward) to be set. Not
 * part of `pnpm test` - run explicitly with `pnpm test:e2e`.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Octokit } from '@octokit/rest';
import { describe, expect, it } from 'vitest';
import { getSiteConfig } from '../dist/site.config.js';

const execFileAsync = promisify(execFile);
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(CURRENT_DIR, '..', 'apps', 'cli', 'dist', 'index.js');
const CONTENT_BRANCH = 'staging';
const PUBLISH_BUDGET_MS = 60_000;

const REQUIRED_ENV = ['PUBLISHD_ENDPOINT', 'PUBLISHD_TOKEN', 'GITHUB_TOKEN'] as const;

function requireEnv(): Record<(typeof REQUIRED_ENV)[number], string> {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `M1 smoke test requires ${missing.join(', ')} - see docs/development.md section 7`,
    );
  }
  return Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, process.env[name] as string]),
  ) as Record<(typeof REQUIRED_ENV)[number], string>;
}

describe('M1 exit: end-to-end smoke test', () => {
  it('publishd <file> returns a working public URL within the time budget', async () => {
    requireEnv();

    const siteConfig = getSiteConfig();
    const owner = siteConfig.content.repo.split('/')[0] ?? '';
    const repo = siteConfig.content.repo.split('/')[1] ?? '';
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const runId = Date.now();
    const slug = `m1-smoke-${runId}`;
    const title = `M1 smoke test ${runId}`;
    const year = new Date().getUTCFullYear();
    const contentPath = `posts/${year}/${slug}.md`;

    const tempDir = await mkdtemp(join(tmpdir(), 'publishd-e2e-'));
    const fixturePath = join(tempDir, `${slug}.md`);
    await writeFile(
      fixturePath,
      [
        '---',
        `title: "${title}"`,
        `slug: ${slug}`,
        'status: published',
        '---',
        '',
        'Fixture published by the M1 exit end-to-end smoke test.',
        '',
      ].join('\n'),
      'utf-8',
    );

    let stdout: string;
    const startedAt = performance.now();
    try {
      ({ stdout } = await execFileAsync('node', [CLI_PATH, fixturePath], {
        env: process.env,
        timeout: PUBLISH_BUDGET_MS + 30_000,
      }));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    const elapsedMs = performance.now() - startedAt;

    console.log(`[m1-smoke] publish + poll took ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`[m1-smoke] CLI output:\n${stdout}`);

    const urlMatch = stdout.match(/https?:\/\/\S+/);
    expect(urlMatch, `no URL found in CLI output:\n${stdout}`).toBeTruthy();
    const url = urlMatch![0];

    expect(stdout, 'CLI never reported the build as live').toContain('live');
    expect(
      elapsedMs,
      `publish took longer than the ${PUBLISH_BUDGET_MS}ms budget`,
    ).toBeLessThan(PUBLISH_BUDGET_MS);

    let commitData:
      Awaited<ReturnType<typeof octokit.repos.getContent>>['data'] | undefined;
    try {
      commitData = (
        await octokit.repos.getContent({
          owner,
          repo,
          ref: CONTENT_BRANCH,
          path: contentPath,
        })
      ).data;

      const response = await fetch(url);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain(title);

      expect(Array.isArray(commitData), `no commit found at ${contentPath}`).toBe(false);
    } finally {
      // Always attempt cleanup, even when an assertion above threw, so a
      // failing run doesn't leave the fixture behind for the next one.
      if (commitData && !Array.isArray(commitData) && commitData.type === 'file') {
        await octokit.repos
          .deleteFile({
            owner,
            repo,
            branch: CONTENT_BRANCH,
            path: contentPath,
            message: `chore: remove m1 smoke test fixture ${slug}`,
            sha: commitData.sha,
          })
          .catch(() => {
            console.error(
              `[m1-smoke] fixture ${contentPath} on branch ${CONTENT_BRANCH} needs manual cleanup`,
            );
          });
      }
    }
  });
});
