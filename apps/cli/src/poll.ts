/**
 * Polls the published URL until the build goes live, per docs/PRD.md
 * section 8.4 ("Poll the deploy and print `live` when the build completes").
 */

export interface PollOptions {
  attempts: number;
  delayMs: number;
}

const DEFAULT_OPTIONS: PollOptions = { attempts: 30, delayMs: 2000 };

export async function pollUntilLive(
  url: string,
  fetchImpl: typeof fetch,
  options: PollOptions = DEFAULT_OPTIONS,
): Promise<void> {
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const isLive = await checkOnce(url, fetchImpl);
    if (isLive) {
      return;
    }
    if (attempt < options.attempts - 1) {
      await sleep(options.delayMs);
    }
  }
  throw new Error(`timed out waiting for ${url} to go live`);
}

async function checkOnce(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
