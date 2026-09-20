/**
 * The single typed, schema-validated shape of a deployment's identity.
 *
 * `site.config.ts` at the repo root is the only place deployment-specific
 * values (title, url, author, content repo, theme, feature flags) may live.
 * See docs/architecture.md section 8 and issue #3.
 */

import { z } from 'zod';

const siteConfigSchema = z.object({
  title: z.string().min(1, 'title must not be empty'),
  url: z.url('url must be a valid absolute URL'),
  bio: z.string().min(1, 'bio must not be empty'),
  author: z.object({
    name: z.string().min(1, 'author.name must not be empty'),
    byline: z.string().min(1, 'author.byline must not be empty'),
    github: z.string().min(1, 'author.github must not be empty'),
  }),
  content: z.object({
    repo: z.string().min(1, 'content.repo must not be empty'),
    branch: z.string().min(1, 'content.branch must not be empty'),
  }),
  theme: z.object({
    font: z.string().min(1, 'theme.font must not be empty'),
    palette: z.string().min(1, 'theme.palette must not be empty'),
  }),
  features: z.object({
    til: z.boolean(),
    search: z.boolean(),
    htmlPages: z.boolean(),
  }),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type SiteConfigInput = z.input<typeof siteConfigSchema>;

/**
 * Validates a site config, throwing a readable error naming the offending
 * field if it is invalid. This is the only supported way to construct a
 * `SiteConfig` - never build one by hand.
 */
export function defineSiteConfig(config: SiteConfigInput): SiteConfig {
  const result = siteConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid site.config.ts:\n${issues}`);
  }
  return result.data;
}
