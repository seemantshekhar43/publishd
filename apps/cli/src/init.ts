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

  const contentRepo = await deps.prompt(
    'Content repo git remote (e.g. git@github.com:you/your-content.git): ',
  );
  if (contentRepo.length === 0) {
    deps.log.error('a content repo remote is required');
    return 1;
  }

  const branch = (await deps.prompt('Branch [main]: ')) || 'main';

  const siteUrl = await deps.prompt('Site URL (e.g. https://publish.example.com): ');
  if (siteUrl.length === 0) {
    deps.log.error('a site URL is required');
    return 1;
  }

  const previewSecret = await deps.prompt(
    'Preview secret (optional - leave blank and draft publishes get no shareable preview link): ',
  );

  const clonePath = await deps.prompt(
    'Local clone path (optional - leave blank for the default ~/.cache/publishd/<profile>/content-repo): ',
  );

  // Rewrites the whole file from the merged profile set rather than
  // appending text, so re-running `init` for a second profile never
  // corrupts or drops the first one.
  const profiles: Record<string, Profile> = {
    ...deps.existingConfig.profiles,
    [name]: {
      contentRepo,
      branch,
      siteUrl,
      ...(previewSecret.length > 0 ? { previewSecret } : {}),
      ...(clonePath.length > 0 ? { clonePath } : {}),
    },
  };
  await deps.writeConfigFile(deps.configPath, stringifyToml(profiles));

  deps.log.info(`Wrote profile "${name}" to ${deps.configPath}`);
  return 0;
}
