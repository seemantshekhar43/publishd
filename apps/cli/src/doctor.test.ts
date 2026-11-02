import { describe, expect, it, vi } from 'vitest';
import type { Profile } from './config.js';
import type { Logger } from './publish.js';
import { runDoctor } from './doctor.js';

function buildLogger(): Logger & {
  lines: string[];
  errors: string[];
  warnings: string[];
} {
  const lines: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  return {
    lines,
    errors,
    warnings,
    info: (message) => lines.push(message),
    warn: (message) => warnings.push(message),
    error: (message) => errors.push(message),
  };
}

type ProfileOverrides = Partial<Omit<Profile, 'previewSecret'>> & {
  previewSecret?: string | undefined;
};

function buildProfile(overrides: ProfileOverrides = {}): Profile {
  const previewSecret = 'previewSecret' in overrides ? overrides.previewSecret : 'shh';
  const { previewSecret: _omit, ...rest } = overrides;
  return {
    contentRepo: 'git@example.test:you/content.git',
    branch: 'main',
    siteUrl: 'https://example.test',
    ...(previewSecret !== undefined ? { previewSecret } : {}),
    ...rest,
  };
}

function buildGit(
  overrides: Partial<{
    remoteIsReachable: () => Promise<boolean>;
    workingTreeStatus: () => Promise<string>;
  }> = {},
) {
  return {
    remoteIsReachable: vi.fn().mockResolvedValue(true),
    workingTreeStatus: vi.fn().mockResolvedValue(''),
    ...overrides,
  };
}

describe('runDoctor', () => {
  it('reports a missing config with an actionable message', async () => {
    const log = buildLogger();

    const exitCode = await runDoctor({
      profile: { error: 'no profile "default" in ~/.config/publishd/config.toml' },
      profileName: 'default',
      fetchImpl: vi.fn(),
      git: buildGit(),
      cloneExists: vi.fn().mockResolvedValue(false),
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('no profile "default"');
    expect(log.lines.some((line) => line.includes('publishd init'))).toBe(true);
  });

  it('reports an unreachable content repo with an actionable message', async () => {
    const log = buildLogger();

    const exitCode = await runDoctor({
      profile: buildProfile(),
      profileName: 'default',
      fetchImpl: vi.fn(),
      git: buildGit({ remoteIsReachable: vi.fn().mockResolvedValue(false) }),
      cloneExists: vi.fn().mockResolvedValue(false),
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('unreachable');
  });

  it('warns when the local clone has uncommitted changes', async () => {
    const log = buildLogger();

    const exitCode = await runDoctor({
      profile: buildProfile(),
      profileName: 'default',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      git: buildGit({
        workingTreeStatus: vi.fn().mockResolvedValue(' M posts/2026/hello.md'),
      }),
      cloneExists: vi.fn().mockResolvedValue(true),
      log,
    });

    expect(exitCode).toBe(0);
    expect(log.warnings.some((line) => line.includes('uncommitted'))).toBe(true);
  });

  it('reports an unreachable site with an actionable message', async () => {
    const log = buildLogger();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const exitCode = await runDoctor({
      profile: buildProfile(),
      profileName: 'default',
      fetchImpl,
      git: buildGit(),
      cloneExists: vi.fn().mockResolvedValue(false),
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('unreachable');
    expect(log.errors[0]).toContain('ECONNREFUSED');
  });

  it('warns when no previewSecret is configured', async () => {
    const log = buildLogger();

    const exitCode = await runDoctor({
      profile: buildProfile({ previewSecret: undefined }),
      profileName: 'default',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      git: buildGit(),
      cloneExists: vi.fn().mockResolvedValue(false),
      log,
    });

    expect(exitCode).toBe(0);
    expect(log.warnings.some((line) => line.includes('previewSecret'))).toBe(true);
  });

  it('reports success when config, content repo, and site all check out', async () => {
    const log = buildLogger();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const exitCode = await runDoctor({
      profile: buildProfile(),
      profileName: 'default',
      fetchImpl,
      git: buildGit(),
      cloneExists: vi.fn().mockResolvedValue(false),
      log,
    });

    expect(exitCode).toBe(0);
    expect(log.errors).toEqual([]);
  });
});
