import { defineCollection } from 'astro:content';
import { postsLoader } from './content/posts-loader.js';
import { draftsLoader } from './content/drafts-loader.js';

const posts = defineCollection({ loader: postsLoader() });
const drafts = defineCollection({ loader: draftsLoader() });

export const collections = { posts, drafts };
