import { defineCollection } from 'astro:content';
import { postsLoader } from './content/posts-loader.js';
import { draftsLoader } from './content/drafts-loader.js';
import { archivedLoader } from './content/archived-loader.js';
import { pagesPublishedLoader } from './content/pages-published-loader.js';
import { pagesDraftsLoader } from './content/pages-drafts-loader.js';
import { pagesArchivedLoader } from './content/pages-archived-loader.js';

const posts = defineCollection({ loader: postsLoader() });
const drafts = defineCollection({ loader: draftsLoader() });
const archived = defineCollection({ loader: archivedLoader() });
const pages = defineCollection({ loader: pagesPublishedLoader() });
const pageDrafts = defineCollection({ loader: pagesDraftsLoader() });
const archivedPages = defineCollection({ loader: pagesArchivedLoader() });

export const collections = { posts, drafts, archived, pages, pageDrafts, archivedPages };
