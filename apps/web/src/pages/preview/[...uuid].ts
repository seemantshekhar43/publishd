/**
 * The draft-preview fallback for a `page` - `/preview/[uuid].astro`'s
 * `getStaticPaths` only ever covers article drafts (it renders inside
 * site chrome via `astro:content`'s `render()`, which only works for
 * markdown), so a page draft's preview UUID is never in that list and
 * falls through here instead. Served byte-for-byte, same as a published
 * page at `/p/<slug>` - a draft preview should look exactly like what
 * publishing it for real would produce.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ params }) => {
  const drafts = await getCollection('pageDrafts');
  const draft = drafts.find((entry) => entry.data.previewId === params.uuid);

  if (!draft) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(draft.body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};
