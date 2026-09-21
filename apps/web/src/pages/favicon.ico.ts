import type { APIRoute } from 'astro';
import { renderFaviconIco } from '../lib/icons.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const ico = await renderFaviconIco();
  return new Response(new Uint8Array(ico), {
    headers: { 'content-type': 'image/x-icon' },
  });
};
