/**
 * `publishd doctor` - checks config, content repo reachability, the local
 * clone's state, and site reachability, each with an actionable message.
 * See docs/PRD.md section 8.4 and issue #22.
 */

import { resolveClonePath, type Profile } from './config.js';
import type { Logger } from './publish.js';

export interface DoctorGitOps {
  remoteIsReachable(remote: string): Promise<boolean>;
  workingTreeStatus(clonePath: string): Promise<string>;
}

export interface DoctorDeps {
  /** Set when a profile resolved; the message `resolveProfile` threw otherwise. */
  profile: Profile | { error: string };
  profileName: string;
  fetchImpl: typeof fetch;
  git: DoctorGitOps;
  cloneExists(clonePath: string): Promise<boolean>;
  log: Logger;
}

/** Returns the process exit code. */
export async function runDoctor(deps: DoctorDeps): Promise<number> {
  if ('error' in deps.profile) {
    deps.log.error(`config: ${deps.profile.error}`);
    deps.log.info('Run `publishd init` to write a config file.');
    return 1;
  }
  const profile = deps.profile;
  deps.log.info(
    `config: resolved (content repo ${profile.contentRepo}, branch ${profile.branch})`,
  );

  const remoteOk = await deps.git.remoteIsReachable(profile.contentRepo);
  if (!remoteOk) {
    deps.log.error(
      `content repo: ${profile.contentRepo} is unreachable - check the remote URL and your git credentials`,
    );
    return 1;
  }
  deps.log.info(`content repo: ${profile.contentRepo} reachable`);

  const clonePath = resolveClonePath(profile, deps.profileName);
  if (await deps.cloneExists(clonePath)) {
    const status = await deps.git.workingTreeStatus(clonePath);
    if (status.length > 0) {
      deps.log.warn(
        `clone: ${clonePath} has uncommitted changes - publishd will hard-reset it on the next publish, so check it before continuing`,
      );
    } else {
      deps.log.info(`clone: ${clonePath} is clean`);
    }
  } else {
    deps.log.info(`clone: not yet cloned - will clone to ${clonePath} on first publish`);
  }

  let response: Response;
  try {
    response = await deps.fetchImpl(profile.siteUrl, { method: 'HEAD' });
  } catch (error) {
    deps.log.error(
      `site: ${profile.siteUrl} is unreachable - ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  if (!response.ok) {
    deps.log.error(`site: ${profile.siteUrl} responded ${response.status}`);
    return 1;
  }
  deps.log.info(`site: ${profile.siteUrl} reachable`);

  if (!profile.previewSecret) {
    deps.log.warn(
      'previewSecret: not configured - draft publishes will have no preview link',
    );
  }

  return 0;
}
