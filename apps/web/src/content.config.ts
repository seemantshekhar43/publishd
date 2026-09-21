import { defineCollection } from 'astro:content';
import { postsLoader } from './content/posts-loader.js';
import { draftsLoader } from './content/drafts-loader.js';
import { archivedLoader } from './content/archived-loader.js';

const posts = defineCollection({ loader: postsLoader() });
const drafts = defineCollection({ loader: draftsLoader() });
const archived = defineCollection({ loader: archivedLoader() });

export const collections = { posts, drafts, archived };
