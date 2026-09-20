import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveProfile } from './config.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'publishd-config-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns empty profiles when the config file does not exist', async () => {
    const config = await loadConfig(join(tempDir, 'missing.toml'));
    expect(config.profiles).toEqual({});
  });

  it('parses named profiles from TOML', async () => {
    const configPath = join(tempDir, 'config.toml');
    await writeFile(
      configPath,
      `[default]\nendpoint = "https://publish.example.test"\ntoken = "default-token"\n\n[staging]\nendpoint = "https://staging.example.test"\ntoken = "staging-token"\n`,
    );

    const config = await loadConfig(configPath);

    expect(config.profiles.default).toEqual({
      endpoint: 'https://publish.example.test',
      token: 'default-token',
    });
    expect(config.profiles.staging).toEqual({
      endpoint: 'https://staging.example.test',
      token: 'staging-token',
    });
  });

  it('ignores a malformed profile entry rather than throwing', async () => {
    const configPath = join(tempDir, 'config.toml');
    await writeFile(configPath, `[broken]\nendpoint = "https://publish.example.test"\n`);

    const config = await loadConfig(configPath);

    expect(config.profiles.broken).toBeUndefined();
  });
});

describe('resolveProfile', () => {
  const config = {
    profiles: {
      default: { endpoint: 'https://default.example.test', token: 'default-token' },
      staging: { endpoint: 'https://staging.example.test', token: 'staging-token' },
    },
  };

  it('prefers PUBLISHD_ENDPOINT and PUBLISHD_TOKEN when both are set', () => {
    const resolved = resolveProfile(config, undefined, {
      PUBLISHD_ENDPOINT: 'https://env.example.test',
      PUBLISHD_TOKEN: 'env-token',
    });
    expect(resolved).toEqual({
      endpoint: 'https://env.example.test',
      token: 'env-token',
    });
  });

  it('falls back to the named profile', () => {
    const resolved = resolveProfile(config, 'staging', {});
    expect(resolved).toEqual({
      endpoint: 'https://staging.example.test',
      token: 'staging-token',
    });
  });

  it('falls back to the "default" profile when none is named', () => {
    const resolved = resolveProfile(config, undefined, {});
    expect(resolved).toEqual({
      endpoint: 'https://default.example.test',
      token: 'default-token',
    });
  });

  it('fills in the missing half from the profile when only one env var is set', () => {
    const resolved = resolveProfile(config, 'staging', {
      PUBLISHD_TOKEN: 'override-token',
    });
    expect(resolved).toEqual({
      endpoint: 'https://staging.example.test',
      token: 'override-token',
    });
  });

  it('throws a readable error when no profile and no full env override exist', () => {
    expect(() => resolveProfile(config, 'missing-profile', {})).toThrow(
      /missing-profile/,
    );
  });
});
