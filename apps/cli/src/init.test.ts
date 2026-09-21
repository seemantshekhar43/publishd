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
        Endpoint: 'https://publish.example.test',
        Token: 'super-secret-token',
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
    expect(written).toContain('endpoint = "https://publish.example.test"');
    expect(written).toContain('token = "super-secret-token"');
  });

  it('defaults the profile name to "default" when left blank', async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    await runInit({
      existingConfig: { profiles: {} },
      configPath: '/config.toml',
      prompt: buildPrompt({ Endpoint: 'https://x.test', Token: 'tok' }),
      writeConfigFile,
      log: buildLogger(),
    });

    expect(writeConfigFile.mock.calls[0]?.[1]).toContain('[default]');
  });

  it('merges into an existing config instead of overwriting other profiles', async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    await runInit({
      existingConfig: {
        profiles: { staging: { endpoint: 'https://staging.test', token: 'a' } },
      },
      configPath: '/config.toml',
      prompt: buildPrompt({
        'Profile name': 'default',
        Endpoint: 'https://prod.test',
        Token: 'b',
      }),
      writeConfigFile,
      log: buildLogger(),
    });

    const written = writeConfigFile.mock.calls[0]?.[1] as string;
    expect(written).toContain('[staging]');
    expect(written).toContain('[default]');
  });

  it('refuses an empty endpoint', async () => {
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
    expect(log.errors[0]).toContain('endpoint');
    expect(writeConfigFile).not.toHaveBeenCalled();
  });

  it('refuses an empty token', async () => {
    const log = buildLogger();
    const writeConfigFile = vi.fn();

    const exitCode = await runInit({
      existingConfig: { profiles: {} },
      configPath: '/config.toml',
      prompt: buildPrompt({ Endpoint: 'https://x.test' }),
      writeConfigFile,
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('token');
    expect(writeConfigFile).not.toHaveBeenCalled();
  });
});
