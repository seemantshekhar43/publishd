/**
 * `publishd doctor` - checks config, token validity, and endpoint
 * reachability, each with an actionable message. See docs/PRD.md section
 * 8.4 and issue #22.
 */

import type { Logger } from './publish.js';

export interface DoctorDeps {
  /** Set when a profile resolved; the message `resolveProfile` threw otherwise. */
  profile: { endpoint: string; token: string } | { error: string };
  fetchImpl: typeof fetch;
  protectionBypass?: string | undefined;
  log: Logger;
}

/** Returns the process exit code. */
export async function runDoctor(deps: DoctorDeps): Promise<number> {
  if ('error' in deps.profile) {
    deps.log.error(`config: ${deps.profile.error}`);
    deps.log.info('Run `publishd init` to write a config file.');
    return 1;
  }
  deps.log.info(`config: resolved (endpoint ${deps.profile.endpoint})`);

  const { endpoint, token } = deps.profile;
  let response: Response;
  try {
    response = await deps.fetchImpl(`${endpoint}/api/list`, {
      headers: {
        authorization: `Bearer ${token}`,
        ...(deps.protectionBypass
          ? { 'x-vercel-protection-bypass': deps.protectionBypass }
          : {}),
      },
    });
  } catch (error) {
    deps.log.error(
      `endpoint: ${endpoint} is unreachable - ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  deps.log.info(`endpoint: ${endpoint} reachable`);

  if (response.status === 401) {
    deps.log.error(
      'token: rejected by the server - check PUBLISHD_TOKEN or the profile token',
    );
    return 1;
  }
  if (!response.ok) {
    deps.log.error(`token: could not be verified - server responded ${response.status}`);
    return 1;
  }
  deps.log.info('token: valid');
  return 0;
}
