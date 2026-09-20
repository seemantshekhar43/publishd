/**
 * The single deployment-specific identity file. Every value here is what
 * makes this deployment "mine" - fork the repo, edit this file, and nothing
 * else needs to change. See docs/architecture.md section 8.
 *
 * Never import this file directly from apps/ or packages/. Import the typed
 * `getSiteConfig()` accessor instead, so identity never gets copy-pasted
 * around the codebase as a raw import path.
 */

import { defineSiteConfig, type SiteConfig } from 'publishd-schema';

const siteConfig: SiteConfig = defineSiteConfig({
  title: 'shekse',
  url: 'https://publish.shekse.com',
  bio: 'Notes on homelab infrastructure, distributed systems, and tools I build.',
  author: {
    name: 'Seemant Shekhar',
    byline: 'shekse',
    github: 'seemantshekhar43',
  },
  content: {
    repo: 'seemantshekhar43/shekse-publish-content',
    branch: 'main',
  },
  theme: {
    font: 'docs',
    palette: 'cream',
  },
  features: {
    til: true,
    search: true,
    htmlPages: true,
  },
});

export default siteConfig;

/** The typed accessor other packages import instead of the raw config object. */
export function getSiteConfig(): SiteConfig {
  return siteConfig;
}
