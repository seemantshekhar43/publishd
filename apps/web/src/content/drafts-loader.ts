/**
 * The `drafts` content loader - feeds `/preview/[uuid].astro`. See
 * `articles-loader.ts` for the shared machinery with `posts-loader.ts`, and
 * docs/content-schema.md section 4 for the draft lifecycle.
 *
 * Each entry's `previewId` is computed here, at load time, with the same
 * `derivePreviewId` the ingest endpoint used to build the link it handed
 * back to the author (apps/web/src/pages/api/ingest.ts) - so the two only
 * ever agree because they run the same deterministic function on the same
 * secret, never because either one persists the id anywhere.
 */

import type { Loader } from 'astro/loaders';
import { derivePreviewId } from '../lib/preview.js';
import { createArticlesLoader } from './articles-loader.js';

export function draftsLoader(
  secret: string | undefined = process.env.PUBLISHD_PREVIEW_SECRET,
): Loader {
  const base = createArticlesLoader({
    name: 'drafts-loader',
    statuses: ['draft'],
    extraData: (frontmatter) =>
      secret ? { previewId: derivePreviewId(frontmatter.slug, secret) } : {},
  });

  return {
    ...base,
    load: async (context) => {
      if (!secret) {
        // No PUBLISHD_PREVIEW_SECRET configured (e.g. plain local dev) -
        // skip rather than fail the whole build. Drafts simply don't
        // render; every other collection is unaffected.
        context.logger.warn(
          'PUBLISHD_PREVIEW_SECRET is not set - skipping draft previews',
        );
        context.store.clear();
        return;
      }
      await base.load(context);
    },
  };
}
