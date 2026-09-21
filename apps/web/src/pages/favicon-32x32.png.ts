import type { APIRoute } from 'astro';
import { renderIconPng } from '../lib/icons.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderIconPng(32);
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
