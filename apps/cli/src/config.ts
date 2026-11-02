/**
 * Named profiles in `~/.config/publishd/config.toml`, so the same CLI
 * targets a different content repo/site without a code change. See
 * docs/architecture.md section 8.
 *
 * `PUBLISHD_CONTENT_REPO` / `PUBLISHD_SITE_URL` env vars override the
 * resolved profile entirely - useful for CI or a one-off override.
 * `PUBLISHD_BRANCH` / `PUBLISHD_PREVIEW_SECRET` / `PUBLISHD_CLONE_PATH`
 * override just that one field, whether or not a profile is used.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';

export interface Profile {
  /** A git remote URL - ssh or https - for the content repo. */
  contentRepo: string;
  branch: string;
  /** The deployed site's base URL, used to build the printed article/preview links. */
  siteUrl: string;
  /** HMAC secret for deriving a draft's `/preview/<uuid>` link - see publishd-schema's derivePreviewId. */
  previewSecret?: string;
  /** Where the content repo is cloned locally. Defaults to `resolveClonePath`'s path when unset. */
  clonePath?: string;
}

export interface CliConfig {
  profiles: Record<string, Profile>;
}

export function defaultConfigPath(): string {
  return join(homedir(), '.config', 'publishd', 'config.toml');
}

export async function loadConfig(configPath = defaultConfigPath()): Promise<CliConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    return { profiles: {} };
  }

  const parsed = parseToml(raw) as Record<string, unknown>;
  const profiles: Record<string, Profile> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.contentRepo === 'string' &&
      typeof candidate.branch === 'string' &&
      typeof candidate.siteUrl === 'string'
    ) {
      profiles[name] = {
        contentRepo: candidate.contentRepo,
        branch: candidate.branch,
        siteUrl: candidate.siteUrl,
        ...(typeof candidate.previewSecret === 'string'
          ? { previewSecret: candidate.previewSecret }
          : {}),
        ...(typeof candidate.clonePath === 'string'
          ? { clonePath: candidate.clonePath }
          : {}),
      };
    }
  }
  return { profiles };
}

export type ResolvedProfile = Profile;

/** Never logs or echoes `previewSecret`. */
export function resolveProfile(
  config: CliConfig,
  profileName: string | undefined,
  env: Record<string, string | undefined>,
): ResolvedProfile {
  const envContentRepo = env.PUBLISHD_CONTENT_REPO;
  const envSiteUrl = env.PUBLISHD_SITE_URL;

  // Past this point neither env var alone fully overrides the profile, so a
  // profile is required to fill in whichever half (if any) is missing -
  // same posture as the field-level overrides below.
  if (envContentRepo && envSiteUrl) {
    return {
      contentRepo: envContentRepo,
      siteUrl: envSiteUrl,
      branch: env.PUBLISHD_BRANCH ?? 'main',
      ...(env.PUBLISHD_PREVIEW_SECRET !== undefined
        ? { previewSecret: env.PUBLISHD_PREVIEW_SECRET }
        : {}),
      ...(env.PUBLISHD_CLONE_PATH !== undefined
        ? { clonePath: env.PUBLISHD_CLONE_PATH }
        : {}),
    };
  }

  const name = profileName ?? 'default';
  const profile = config.profiles[name];
  if (!profile) {
    throw new Error(
      `no profile "${name}" in ${defaultConfigPath()}, and PUBLISHD_CONTENT_REPO/PUBLISHD_SITE_URL are not both set`,
    );
  }

  const previewSecret = env.PUBLISHD_PREVIEW_SECRET ?? profile.previewSecret;
  const clonePath = env.PUBLISHD_CLONE_PATH ?? profile.clonePath;
  return {
    contentRepo: envContentRepo ?? profile.contentRepo,
    branch: env.PUBLISHD_BRANCH ?? profile.branch,
    siteUrl: envSiteUrl ?? profile.siteUrl,
    ...(previewSecret !== undefined ? { previewSecret } : {}),
    ...(clonePath !== undefined ? { clonePath } : {}),
  };
}

/** Where the content repo is cloned locally for `profileName`, absent an explicit override. */
export function resolveClonePath(profile: Profile, profileName: string): string {
  return (
    profile.clonePath ??
    join(homedir(), '.cache', 'publishd', profileName, 'content-repo')
  );
}
