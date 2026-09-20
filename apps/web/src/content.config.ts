import { defineCollection } from 'astro:content';
import { postsLoader } from './content/posts-loader.js';

const posts = defineCollection({ loader: postsLoader() });

export const collections = { posts };
