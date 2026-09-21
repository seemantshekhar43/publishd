// One social card per `type: post` (issue #16); note/til/doc fall back to
// /og/default.png. Static PNG, generated once at build - not a runtime
// image service.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { getSiteConfig } from '../../../../../site.config.js';
import { renderOgImage } from '../../lib/og-image.js';
import { formatLongDate } from '../../lib/format-date.js';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('posts', ({ data }) => data.type === 'post');
  return posts.map((post) => ({ params: { slug: post.data.slug }, props: { post } }));
};

interface Props {
  post: CollectionEntry<'posts'>;
}

export const GET: APIRoute<Props> = async ({ props }) => {
  const siteConfig = getSiteConfig();
  const { post } = props;
  const png = await renderOgImage({
    title: post.data.title,
    type: post.data.type,
    dateLabel: formatLongDate(post.data.date),
    byline: siteConfig.author.byline,
  });

  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
