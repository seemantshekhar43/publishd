import { describe, expect, it, vi } from 'vitest';
import type { Logger } from './publish.js';
import { runInit } from './init.js';

function buildLogger(): Logger & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    info: (message) => lines.push(message),
    warn: () => {},
    error: (message) => errors.push(message),
  };
}

function buildPrompt(answers: Record<string, string>) {
  return async (question: string) => {
    for (const [match, answer] of Object.entries(answers)) {
      if (question.startsWith(match)) return answer;
    }
    return '';
  };
}

describe('runInit', () => {
  it('writes a valid TOML profile from a clean machine', async () => {
    const log = buildLogger();
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    const exitCode = await runInit({
      existingConfig: { profiles: {} },
      configPath: '/home/user/.config/publishd/config.toml',
      prompt: buildPrompt({
        'Profile name': 'default',
        'Content repo': 'git@example.test:you/content.git',
        Branch: 'main',
        'Site URL': 'https://publish.example.test',
      }),
      writeConfigFile,
      log,
    });

    expect(exitCode).toBe(0);
    expect(writeConfigFile).toHaveBeenCalledWith(
      '/home/user/.config/publishd/config.toml',
      expect.stringContaining('[default]'),
    );
    const written = writeConfigFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('contentRepo = "git@example.test:you/content.git"');
    expect(written).toContain('branch = "main"');
    expect(written).toContain('siteUrl = "https://publish.example.test"');
    expect(written).not.toContain('previewSecret');
    expect(written).not.toContain('clonePath');
  });

  it('defaults the profile name to "default" and the branch to "main" when left blank', async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    await runInit({
      existingConfig: { profiles: {} },
      configPath: '/config.toml',
      prompt: buildPrompt({
        'Content repo': 'git@example.test:you/content.git',
        'Site URL': 'https://x.test',
      }),
      writeConfigFile,
      log: buildLogger(),
    });

    const written = writeConfigFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('[default]');
    expect(written).toContain('branch = "main"');
  });

  it('includes an optional previewSecret and clonePath when provided', async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    await runInit({
      existingConfig: { profiles: {} },
      configPath: '/config.toml',
      prompt: buildPrompt({
        'Content repo': 'git@example.test:you/content.git',
        'Site URL': 'https://x.test',
        'Preview secret': 'shh',
        'Local clone path': '/custom/clone',
      }),
      writeConfigFile,
      log: buildLogger(),
    });

    const written = writeConfigFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('previewSecret = "shh"');
    expect(written).toContain('clonePath = "/custom/clone"');
  });

  it('merges into an existing config instead of overwriting other profiles', async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    await runInit({
      existingConfig: {
        profiles: {
          staging: {
            contentRepo: 'git@example.test:you/staging.git',
            branch: 'main',
            siteUrl: 'https://staging.test',
          },
        },
      },
      configPath: '/config.toml',
      prompt: buildPrompt({
        'Profile name': 'default',
        'Content repo': 'git@example.test:you/content.git',
        'Site URL': 'https://prod.test',
      }),
      writeConfigFile,
      log: buildLogger(),
    });

    const written = writeConfigFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('[staging]');
    expect(written).toContain('[default]');
  });

  it('refuses an empty content repo', async () => {
    const log = buildLogger();
    const writeConfigFile = vi.fn();

    const exitCode = await runInit({
      existingConfig: { profiles: {} },
      configPath: '/config.toml',
      prompt: buildPrompt({}),
      writeConfigFile,
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('content repo');
    expect(writeConfigFile).not.toHaveBeenCalled();
  });

  it('refuses an empty site URL', async () => {
    const log = buildLogger();
    const writeConfigFile = vi.fn();

    const exitCode = await runInit({
      existingConfig: { profiles: {} },
      configPath: '/config.toml',
      prompt: buildPrompt({ 'Content repo': 'git@example.test:you/content.git' }),
      writeConfigFile,
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('site URL');
    expect(writeConfigFile).not.toHaveBeenCalled();
  });
});
