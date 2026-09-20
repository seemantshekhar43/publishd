/**
 * Bearer-token auth for /api/ingest. See docs/architecture.md section 5.
 *
 * Tokens are stored as hashes in PUBLISHD_TOKENS, one per named client:
 *   PUBLISHD_TOKENS='{"cli":"sha256:...","obsidian":"sha256:...","agent":"sha256:..."}'
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export const CLIENT_NAMES = ['cli', 'obsidian', 'agent'] as const;
export type ClientName = (typeof CLIENT_NAMES)[number];

export function hashToken(token: string): string {
  return `sha256:${createHash('sha256').update(token, 'utf8').digest('hex')}`;
}

/** Constant-time string comparison - never `===` on a token or its hash. */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against something of A's own length so this branch still
    // takes roughly the same time as a real mismatch, rather than
    // short-circuiting on length alone.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Resolves a raw bearer token to its named client, or null if it matches no
 * configured token. `tokenHashesJson` is the raw PUBLISHD_TOKENS env value.
 */
export function resolveClient(
  token: string,
  tokenHashesJson: string | undefined,
): ClientName | null {
  if (!tokenHashesJson) {
    return null;
  }

  let hashes: Record<string, unknown>;
  try {
    hashes = JSON.parse(tokenHashesJson) as Record<string, unknown>;
  } catch {
    return null;
  }

  const hashedToken = hashToken(token);
  let resolved: ClientName | null = null;
  // Check every configured client, not just until the first match, so a
  // hit for the third client doesn't take visibly longer than the first.
  for (const name of CLIENT_NAMES) {
    const expected = hashes[name];
    if (typeof expected === 'string' && constantTimeEquals(hashedToken, expected)) {
      resolved = name;
    }
  }
  return resolved;
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
