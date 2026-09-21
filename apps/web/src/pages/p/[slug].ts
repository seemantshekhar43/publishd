/**
 * Serves a published `page` verbatim at `/p/<slug>` - a separate route
 * namespace from `/<slug>`, per docs/content-schema.md section 2 and
 * issue #21. A plain API route rather than an `.astro` component: Astro's
 * own compiler would reformat markup passed through a component, which
 * would break the byte-for-byte guarantee this route exists to keep.
 */
export const prerender = true;

import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';

export const getStaticPaths: GetStaticPaths = async () => {
  const pages = await getCollection('pages');
  return pages.map((page) => ({ params: { slug: page.data.slug }, props: { page } }));
};

interface Props {
  page: CollectionEntry<'pages'>;
}

export const GET: APIRoute<Props> = async ({ props }) => {
  return new Response(props.page.body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};
