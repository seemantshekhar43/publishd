/**
 * The `pageDrafts` content loader - feeds `/preview/[...uuid].ts`. Same
 * `previewId` mechanism as `drafts-loader.ts`: computed here from the same
 * deterministic `derivePreviewId`, never persisted anywhere itself.
 */

import type { Loader } from 'astro/loaders';
import { derivePreviewId } from '../lib/preview.js';
import { createPagesLoader } from './pages-loader.js';

export function pagesDraftsLoader(
  secret: string | undefined = process.env.PUBLISHD_PREVIEW_SECRET,
): Loader {
  const base = createPagesLoader({
    name: 'pages-drafts-loader',
    statuses: ['draft'],
    extraData: (frontmatter) =>
      secret ? { previewId: derivePreviewId(frontmatter.slug, secret) } : {},
  });

  return {
    ...base,
    load: async (context) => {
      if (!secret) {
        context.logger.warn(
          'PUBLISHD_PREVIEW_SECRET is not set - skipping page draft previews',
        );
        context.store.clear();
        return;
      }
      await base.load(context);
    },
  };
}
