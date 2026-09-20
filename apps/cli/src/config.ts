/**
 * Named profiles in `~/.config/publishd/config.toml`, so the same CLI
 * targets local, staging, and production without a code change. See
 * docs/architecture.md section 8.
 *
 * `PUBLISHD_ENDPOINT` / `PUBLISHD_TOKEN` env vars override the resolved
 * profile entirely - useful for CI or a one-off override.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';

export interface Profile {
  endpoint: string;
  token: string;
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
    if (typeof candidate.endpoint === 'string' && typeof candidate.token === 'string') {
      profiles[name] = { endpoint: candidate.endpoint, token: candidate.token };
    }
  }
  return { profiles };
}

export interface ResolvedProfile {
  endpoint: string;
  token: string;
}

/** Never logs or echoes the resolved token. */
export function resolveProfile(
  config: CliConfig,
  profileName: string | undefined,
  env: Record<string, string | undefined>,
): ResolvedProfile {
  const envEndpoint = env.PUBLISHD_ENDPOINT;
  const envToken = env.PUBLISHD_TOKEN;
  if (envEndpoint && envToken) {
    return { endpoint: envEndpoint, token: envToken };
  }

  // Past this point neither env var alone fully overrides the profile, so a
  // profile is required to fill in whichever half (if any) is missing.
  const name = profileName ?? 'default';
  const profile = config.profiles[name];
  if (!profile) {
    throw new Error(
      `no profile "${name}" in ${defaultConfigPath()}, and PUBLISHD_ENDPOINT/PUBLISHD_TOKEN are not both set`,
    );
  }

  return {
    endpoint: envEndpoint ?? profile.endpoint,
    token: envToken ?? profile.token,
  };
}
