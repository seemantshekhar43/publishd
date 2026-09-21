/**
 * Draft preview links. See docs/content-schema.md section 4.
 *
 * A preview id is an HMAC of the slug, not a random value stored anywhere -
 * there is no database (docs/PRD.md section 4.1's "Store: Git"), so
 * stability across republishes has to come from being a pure function of
 * the slug and a server-only secret rather than from looked-up state. The
 * HMAC is what makes it unguessable: without the secret, the slug alone
 * (which an author's own filenames, editor tabs, or git history might leak)
 * gives an attacker nothing.
 */

import { createHmac } from 'node:crypto';

const PREVIEW_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Deterministic per-slug preview id, formatted as a UUID. */
export function derivePreviewId(slug: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(slug).digest();
  const bytes = Uint8Array.prototype.slice.call(digest, 0, 16);
  // Stamp version/variant bits so the output reads as an ordinary UUID,
  // even though it is deterministic rather than random.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** True when a value has the shape of a preview id - not a proof it resolves to a draft. */
export function hasValidPreviewIdShape(value: string): boolean {
  return PREVIEW_ID_PATTERN.test(value);
}
