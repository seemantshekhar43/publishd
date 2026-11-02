import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveClonePath, resolveProfile } from './config.js';

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
      `[default]\ncontentRepo = "git@example.test:you/content.git"\nbranch = "main"\nsiteUrl = "https://publish.example.test"\n\n[staging]\ncontentRepo = "git@example.test:you/content-staging.git"\nbranch = "staging"\nsiteUrl = "https://staging.example.test"\n`,
    );

    const config = await loadConfig(configPath);

    expect(config.profiles.default).toEqual({
      contentRepo: 'git@example.test:you/content.git',
      branch: 'main',
      siteUrl: 'https://publish.example.test',
    });
    expect(config.profiles.staging).toEqual({
      contentRepo: 'git@example.test:you/content-staging.git',
      branch: 'staging',
      siteUrl: 'https://staging.example.test',
    });
  });

  it('carries optional previewSecret and clonePath when present', async () => {
    const configPath = join(tempDir, 'config.toml');
    await writeFile(
      configPath,
      `[default]\ncontentRepo = "git@example.test:you/content.git"\nbranch = "main"\nsiteUrl = "https://publish.example.test"\npreviewSecret = "shh"\nclonePath = "/tmp/clone"\n`,
    );

    const config = await loadConfig(configPath);

    expect(config.profiles.default).toEqual({
      contentRepo: 'git@example.test:you/content.git',
      branch: 'main',
      siteUrl: 'https://publish.example.test',
      previewSecret: 'shh',
      clonePath: '/tmp/clone',
    });
  });

  it('ignores a malformed profile entry rather than throwing', async () => {
    const configPath = join(tempDir, 'config.toml');
    await writeFile(
      configPath,
      `[broken]\ncontentRepo = "git@example.test:you/content.git"\n`,
    );

    const config = await loadConfig(configPath);

    expect(config.profiles.broken).toBeUndefined();
  });
});

describe('resolveProfile', () => {
  const config = {
    profiles: {
      default: {
        contentRepo: 'git@example.test:you/default.git',
        branch: 'main',
        siteUrl: 'https://default.example.test',
      },
      staging: {
        contentRepo: 'git@example.test:you/staging.git',
        branch: 'staging',
        siteUrl: 'https://staging.example.test',
      },
    },
  };

  it('prefers PUBLISHD_CONTENT_REPO and PUBLISHD_SITE_URL when both are set', () => {
    const resolved = resolveProfile(config, undefined, {
      PUBLISHD_CONTENT_REPO: 'git@example.test:you/env.git',
      PUBLISHD_SITE_URL: 'https://env.example.test',
    });
    expect(resolved).toEqual({
      contentRepo: 'git@example.test:you/env.git',
      siteUrl: 'https://env.example.test',
      branch: 'main',
    });
  });

  it('falls back to the named profile', () => {
    const resolved = resolveProfile(config, 'staging', {});
    expect(resolved).toEqual(config.profiles.staging);
  });

  it('falls back to the "default" profile when none is named', () => {
    const resolved = resolveProfile(config, undefined, {});
    expect(resolved).toEqual(config.profiles.default);
  });

  it('fills in the missing half from the profile when only one env var is set', () => {
    const resolved = resolveProfile(config, 'staging', {
      PUBLISHD_SITE_URL: 'https://override.example.test',
    });
    expect(resolved).toEqual({
      contentRepo: 'git@example.test:you/staging.git',
      branch: 'staging',
      siteUrl: 'https://override.example.test',
    });
  });

  it('overrides branch/previewSecret/clonePath individually, with or without a full env override', () => {
    const resolved = resolveProfile(config, 'staging', {
      PUBLISHD_BRANCH: 'preview',
      PUBLISHD_PREVIEW_SECRET: 'env-secret',
      PUBLISHD_CLONE_PATH: '/tmp/env-clone',
    });
    expect(resolved).toEqual({
      contentRepo: 'git@example.test:you/staging.git',
      branch: 'preview',
      siteUrl: 'https://staging.example.test',
      previewSecret: 'env-secret',
      clonePath: '/tmp/env-clone',
    });
  });

  it('throws a readable error when no profile and no full env override exist', () => {
    expect(() => resolveProfile(config, 'missing-profile', {})).toThrow(
      /missing-profile/,
    );
  });
});

describe('resolveClonePath', () => {
  it('uses the profile clonePath when set', () => {
    const profile = {
      contentRepo: 'git@example.test:you/content.git',
      branch: 'main',
      siteUrl: 'https://publish.example.test',
      clonePath: '/custom/clone',
    };
    expect(resolveClonePath(profile, 'default')).toBe('/custom/clone');
  });

  it('defaults to ~/.cache/publishd/<profile>/content-repo when unset', () => {
    const profile = {
      contentRepo: 'git@example.test:you/content.git',
      branch: 'main',
      siteUrl: 'https://publish.example.test',
    };
    expect(resolveClonePath(profile, 'staging')).toContain(
      join('.cache', 'publishd', 'staging', 'content-repo'),
    );
  });
});
