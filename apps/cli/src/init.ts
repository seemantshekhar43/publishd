/**
 * `publishd init` - interactively writes a profile to
 * ~/.config/publishd/config.toml. See docs/PRD.md section 8.4, issue #22,
 * and config.ts for the file format `loadConfig` reads back.
 */

import { stringify as stringifyToml } from 'smol-toml';
import type { CliConfig, Profile } from './config.js';
import type { Logger } from './publish.js';

export interface InitDeps {
  existingConfig: CliConfig;
  /** Prompts with `question`, returns the trimmed answer. */
  prompt(question: string): Promise<string>;
  writeConfigFile(path: string, content: string): Promise<void>;
  configPath: string;
  log: Logger;
}

/** Returns the process exit code. */
export async function runInit(deps: InitDeps): Promise<number> {
  const name = (await deps.prompt('Profile name [default]: ')) || 'default';

  const endpoint = await deps.prompt('Endpoint URL (e.g. https://publish.example.com): ');
  if (endpoint.length === 0) {
    deps.log.error('an endpoint is required');
    return 1;
  }

  const token = await deps.prompt('Token: ');
  if (token.length === 0) {
    deps.log.error('a token is required');
    return 1;
  }

  // Rewrites the whole file from the merged profile set rather than
  // appending text, so re-running `init` for a second profile never
  // corrupts or drops the first one.
  const profiles: Record<string, Profile> = {
    ...deps.existingConfig.profiles,
    [name]: { endpoint, token },
  };
  await deps.writeConfigFile(deps.configPath, stringifyToml(profiles));

  deps.log.info(`Wrote profile "${name}" to ${deps.configPath}`);
  return 0;
}
