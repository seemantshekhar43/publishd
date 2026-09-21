/**
 * `publishd unpublish <slug>` - see docs/PRD.md section 8.4 and issue #22.
 */

import type { Logger } from './publish.js';

export interface UnpublishDeps {
  fetchImpl: typeof fetch;
  endpoint: string;
  token: string;
  protectionBypass?: string | undefined;
  log: Logger;
}

interface ErrorBody {
  error: string;
}

/** Returns the process exit code. */
export async function runUnpublish(slug: string, deps: UnpublishDeps): Promise<number> {
  const response = await deps.fetchImpl(`${deps.endpoint}/api/unpublish`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.token}`,
      'content-type': 'application/json',
      ...(deps.protectionBypass
        ? { 'x-vercel-protection-bypass': deps.protectionBypass }
        : {}),
    },
    body: JSON.stringify({ slug }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: response.statusText,
    }))) as ErrorBody;
    deps.log.error(`unpublish failed (${response.status}): ${body.error}`);
    return 1;
  }

  deps.log.info(`${slug}: archived`);
  return 0;
}
