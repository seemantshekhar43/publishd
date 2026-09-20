# PRD: publish.shekse.com

**Status:** Draft v3 (settled through 4 review rounds)
**Owner:** shekse (Seemant Shekhar)
**Last updated:** 2026-09-20
**Reviewed artifact:** `.inkloop/prd-publish-shekse.html` (local only - `.inkloop/` is gitignored; see [development.md](development.md) §1)

---

## 1. Summary

A personal publishing surface at `publish.shekse.com` where a markdown file becomes a public URL in under 10 seconds, from any client: Obsidian, Claude Code, a terminal, or a phone.

This is not a CMS. It is a **content pipeline with a reading-first website on the end of it**. The authoring tool stays whatever you already use. The only contract is markdown plus frontmatter.

### The one-line test

```bash
publishd ./my-note.md
# -> https://publish.shekse.com/my-note
```

If that does not work offline-to-online in one command, the product has failed.

### Decisions at a glance

| | |
| --- | --- |
| **Format** | Markdown pipeline, plus verbatim `.html` pages as a second content kind |
| **Store** | Git. A private GitHub repo, no database |
| **Host** | Vercel (site + ingest), GitHub (content), Cloudflare (DNS) |
| **Homelab** | Deliberately off the critical path: analytics and backup only |
| **Licence** | MIT, public from the first commit |
| **Tool** | `publishd` on npm, unscoped |

---

## 2. Problem

Content is trapped in three silos that do not talk to each other:

| Silo | Problem |
| --- | --- |
| Obsidian vault | Rich, linked, well-written notes that never leave the local machine |
| Claude Code sessions | Good write-ups that die in scrollback or a stray `.md` in a repo |
| Ad-hoc blog drafts | No home, so they are never finished |

Rejected alternatives:

- **Obsidian Publish** - $8/mo, vendor lock-in, no API, cannot publish from Claude Code.
- **Ghost / WordPress** - a database and an admin UI to maintain, and writing happens in a browser textarea instead of your editor.
- **Plain GitHub Pages repo** - works, but no programmatic ingest endpoint, no drafts, no preview, no asset handling.

---

## 3. Goals and non-goals

### Goals

- **G1** Publish from any client via a single HTTP endpoint or one CLI command.
- **G2** Content is plain markdown in git, fully portable, no proprietary store.
- **G3** Published pages are fast (< 1s LCP on 4G), readable, and look deliberate rather than templated.
- **G4** Zero maintenance burden. No database to back up, no server to patch, no container to restart.
- **G5** Republishing the same file updates the same URL. URLs are permanent.

### Non-goals (v1)

- Multi-author, roles, or permissions. Single author *per deployment* - open-sourcing means many deployments, not many authors on one.
- Comments, likes, or any social layer. Revisit via giscus in v3.
- A web-based WYSIWYG editor. The editor is Obsidian or your IDE, always.
- Newsletter sending. RSS is the subscription mechanism.
- Bidirectional sync. The pipeline is one-way: local -> published. The site is never the source of truth.

---

## 4. Core decisions

### 4.1 Format: markdown only, plus a narrow HTML escape hatch

**The markdown pipeline accepts `.md` / `.mdx` only**, with a validated YAML frontmatter block. Anything else is rejected at the endpoint. A single input format is what makes every downstream feature cheap: search indexing, RSS, OG images, reading time, link rewriting, diffing.

Conversion happens *at the edge*, not at the endpoint: `publishd --from docx file.docx` runs pandoc locally and posts markdown. The server contract never widens.

**Frontmatter contract** (validated by a shared zod schema, §6.3):

```yaml
---
title: "Running Kubernetes on a Beelink cluster"   # required
slug: k8s-beelink-cluster                          # optional, derived from title
date: 2026-09-20                                   # optional, defaults to now
status: published                                  # draft | published | archived
type: post                                         # post | note | til | doc
tags: [homelab, kubernetes]                        # optional, flat list
summary: "What I learned..."                       # optional, used in OG + RSS
canonical: https://example.com/original            # optional, if cross-posted
publishAt: 2026-09-25T09:00:00Z                    # optional, scheduled
---
```

Only `title` is required. A note dragged out of Obsidian with a one-line frontmatter block must just work.

**Obsidian syntax is normalised on ingest, not rejected:**

- `![[image.png]]` -> resolved against the vault, uploaded, rewritten to a real URL
- `[[Some Other Note]]` -> a link if published, plain text if not. Never a dead link.
- Inline `#tag` -> merged into frontmatter tags
- Callouts (`> [!note]`) -> styled admonitions
- Dataview and Templater syntax -> stripped, with a CLI warning

#### Second content kind: `page`

So that inkloop artifacts and other self-contained HTML can be published through the same pipeline, without widening the markdown contract:

| | `article` (markdown) | `page` (HTML) |
| --- | --- | --- |
| Input | `.md` / `.mdx` | One self-contained `.html` file |
| Processing | Parsed, normalised, rendered into the site layout | **None.** Served verbatim. |
| Metadata | YAML frontmatter | `<meta name="shekse:*">` tags, falling back to `<title>` and CLI flags |
| Site chrome | Full header, footer, theme | None. The artifact owns the whole page. |
| RSS, search, feed | Yes | Yes, listed like posts. `listed: false` hides one. |
| URL | `/<slug>` | `/p/<slug>`, a separate namespace |

A `page` is not a document the site renders, it is an artifact the site **hosts**. The separate route namespace is what stops the two blurring.

```bash
publishd .inkloop/prd-publish-shekse.html --kind page
# -> https://publish.shekse.com/p/prd-publish-shekse
```

Two consequences of listing pages in the feed: a page has no body text to syndicate, so its RSS entry carries title, date, and summary with a link out, which is the right shape for an interactive artifact anyway. And Pagefind indexes built output, so a page's visible text is searchable for free.

> **Security constraint (matters once public):** a `page` ships arbitrary JS on your own origin. Harmless here, because the site has no cookies, no login, and no authenticated surface. **If a deployment ever adds authentication, pages must move to a separate origin first.** This belongs in the README as a documented constraint, not a runtime sanitiser - sanitising HTML well enough to be a real boundary is a losing game, and the ingest token is the actual boundary.

### 4.2 Storage: git is the database

A private GitHub repo, `seemantshekhar43/shekse-publish-content`.

```
shekse-publish-content/
  posts/2026/k8s-beelink-cluster.md
  assets/k8s-beelink-cluster/topology.png
  .github/workflows/validate.yml
```

Why git rather than Postgres, SQLite, or an object store:

- **Version history is free.** Every edit is a commit. Rollback is `git revert`.
- **Obsidian can be the repo.** A `published/` subfolder synced by obsidian-git, zero custom code.
- **Claude Code is already excellent at git.** Writing a file and committing is its native mode.
- **Portability.** If Vercel, GitHub, or this project dies, you still have a folder of markdown.
- **No backup strategy needed** beyond clones.

Binaries live in the same repo under `assets/<slug>/` in v1. CI warns above 200MB and fails above 400MB. The escape hatch, only when that warning fires: move to Cloudflare R2. The CLI routes every asset through one `uploadAsset()` function, so it is a one-file change. **Do not build it before the warning fires.**

Not stored: rendered HTML, the search index, derived metadata. All regenerated at build and disposable.

### 4.3 Hosting: homelab deliberately off the critical path

| Component | Where | Why |
| --- | --- | --- |
| Markdown + assets | GitHub, private repo | Durable, free |
| Website (static) | Vercel | Global CDN, preview deploy per PR, zero ops |
| Ingest API | Vercel serverless function | Same deploy unit as the site |
| DNS | Cloudflare CNAME -> Vercel | Already yours |
| **Analytics** | **Homelab** (Umami in Docker) | Privacy, and a real job for the homelab |
| **Backup mirror** | **Homelab** (nightly `git clone --mirror`) | Third copy, offline |

The critical call: **do not put the ingest endpoint on the homelab.** Publishing must work on a plane, when home internet is down, when the Beelink is mid-upgrade, and from a phone. A Cloudflare Tunnel makes publishing a blog post depend on your house being up. Not worth it.

If Vercel's free tier ever stops working, the site is static output: Cloudflare Pages migration is an afternoon, and the ingest function becomes a Worker.

### 4.4 Configurable endpoint: named profiles

`~/.config/publishd/config.toml`:

```toml
default_profile = "prod"

[profiles.prod]
endpoint = "https://publish.shekse.com/api/ingest"
token    = "op://Personal/publishd/prod-token"
author   = "shekse"

[profiles.local]
endpoint = "http://localhost:4321/api/ingest"
token    = "dev"
```

Used as `publishd note.md --profile staging`, overridable by `PUBLISHD_ENDPOINT` / `PUBLISHD_TOKEN` for CI and agent hooks. This is what lets you run the whole stack locally and later point at a different backend without touching a client.

### 4.5 Categorisation: tags yes, hierarchies no

Nested categories are a trap on a personal site. You spend longer deciding between `infra/kubernetes` and `homelab/k8s` than writing, and the taxonomy is wrong within six months.

Two flat axes:

- **`type`** - a closed enum (`post`, `note`, `til`, `doc`) that drives **layout**, not taxonomy. `post` gets an OG image and RSS; `note` is short-form; `til` is date-led; `doc` shows "last updated" and stays out of the chronological feed.
- **`tags`** - an open flat list, no parents. Auto-generated `/tags/<tag>` pages.

A CI check flags any tag used only once, so the list stays small without governance. If you later want `/homelab` as a curated landing page, it is a hand-written page that queries tags, not a new schema concept.

### 4.6 Homepage: a reading list, not a dashboard

```
Shekhar                                  ⌘K   ☾
Notes on homelab infrastructure, distributed
systems, and tools I build.

── 2026 ────────────────────────────────
Running Kubernetes on a Beelink cluster   Sep 20
                                            POST
Cloudflare Tunnel vs Tailscale Funnel     Sep 14
                                            NOTE
── 2025 ────────────────────────────────
Rebuilding my homelab on NixOS            Dec 18
                                            POST

Archive · Tags · RSS · GitHub
```

- **Reverse chronological, grouped by year.** No pagination for the first 30, then "Archive".
- **No excerpts.** Titles you wrote well are better signal than three truncated lines.
- **No images in the list.** Hover reveals the summary as a secondary line.
- **⌘K search** opens a Pagefind-backed palette. The only interactive JS.
- **None of:** view counters, reading-time on the index, a "featured" section, a newsletter modal.

References: `paco.me`, `rauno.me`, `maggieappleton.com`. The bet is that restraint reads as taste and a card grid reads as a template.

---

## 5. Features beyond the original list

| Feature | Why it earns its place |
| --- | --- |
| **Draft previews** | `status: draft` publishes to `/preview/<uuid>` with `noindex`, excluded from index, RSS, and search. *The feature you will use most.* |
| **Scheduled publishing** | `publishAt` in the future holds the post back; an hourly Vercel cron rebuilds. |
| **Auto OG images** | Generated at build with `satori`. Consistent, zero per-post design work. |
| **RSS + JSON Feed** | `/rss.xml`, `/feed.json`. Syndication without a newsletter. |
| **Static search** | Pagefind indexes at build, ~50KB, zero backend. |
| **Canonical URLs** | Cross-posting points search engines at the right copy. |
| **Permanent URLs + redirects** | A slug change writes to `redirects.json`; CI fails a change without one. |
| **Link checker in CI** | Dead internal links fail the build; external links warn. |
| **`publishd list` / `unpublish`** | `unpublish` sets `status: archived`, returning 410 rather than 404. |
| **Idempotent republish** | Slug is the primary key. No accidental duplicates. |

---

## 6. Architecture

```
  Obsidian          Claude Code         Terminal
  (shell cmd)       (skill)             (publishd)
      |                  |                  |
      +---------+--------+------------------+
                |  POST /api/ingest  (Bearer token)
                v
      +---------------------------+
      |  Ingest function (Vercel) |  1. auth -> named client
      |                           |  2. validate against zod schema
      |                           |  3. normalise Obsidian syntax
      |                           |  4. resolve slug / detect update
      +-------------+-------------+  5. commit via GitHub API
                    v
      +---------------------------+
      | GitHub: shekse-publish-   |  markdown + assets, full history
      | content (private)         |
      +-------------+-------------+
                    | deploy hook
                    v
      +---------------------------+
      | Vercel build (Astro)      |  MD -> HTML, OG images,
      +-------------+-------------+  Pagefind index, RSS, sitemap
                    v
      +---------------------------+
      | publish.shekse.com        |  static, CDN, ~40KB/page
      +---------------------------+

  Homelab (off critical path):
    · Umami analytics
    · nightly git mirror of the content repo
```

**Latency budget, command to live URL:** ingest 300ms, GitHub commit 500ms, Vercel build 20-40s. The CLI returns the final URL immediately and polls the deploy, printing `live` when the build completes.

### 6.2 Two repositories, deliberately separate

- **`seemantshekhar43/publishd`** (public, MIT) - the code: website, CLI, ingest function, schema.
- **`seemantshekhar43/shekse-publish-content`** (private) - the markdown. Never contains code. Keeps the personal name because it is your content, not the tool.

Content commits should not trigger code CI, code commits should not appear in content history, and the content repo must stay something you could hand to any other static site generator tomorrow.

### 6.3 Monorepo layout

```
publishd/
  apps/
    web/                 Astro site + /api/ingest route
      src/content/       content collection (CI-cloned)
      src/pages/
      src/components/
    cli/                 the publishd CLI
  packages/
    schema/              zod frontmatter schema + Obsidian normalisers
                         SHARED by cli, ingest, and site build
  integrations/
    obsidian-plugin/     v2
    skill/               SKILL.md - agent-agnostic, any coding agent
  docs/
    PRD.md
    design.md            the look-and-feel contract agents must follow
```

`packages/schema` is the keystone. The CLI validates before sending, the endpoint validates on receipt, the site validates at build. One definition, three enforcement points, so bad frontmatter is caught on your laptop rather than in a failed deploy.

### 6.4 Auth

Bearer tokens, one per client, so a leaked token is revoked without rotating everything.

```
PUBLISHD_TOKENS='{"cli":"sha256:...","obsidian":"sha256:...","agent":"sha256:..."}'
```

Stored as hashes in a Vercel env var. Constant-time compare, client name logged on every publish, rate limited to 30 publishes/hour/token. No OAuth, no user table, no session - there is exactly one user.

---

## 7. Tech stack

| Layer | Choice | Reasoning |
| --- | --- | --- |
| Site framework | **Astro 5** | Content Layer API is purpose-built for this. Zero JS by default, islands where needed. MDX, Shiki, RSS first-party. |
| Styling | Tailwind v4 + custom tokens | CSS-first config: the design system lives in one `theme.css`. |
| Search | Pagefind | Static index at build, no service, ~50KB. |
| OG images | satori + resvg at build | Deterministic, no runtime image service. |
| Ingest | Vercel function, Node runtime | Colocated with the site; needs Node for the GitHub SDK. |
| Content store | GitHub private repo via Octokit | See §4.2. |
| CLI | TypeScript, citty + consola, via npx | Ships as `publishd`. |
| Validation | **zod** | One schema, three enforcement points. |
| Hosting | Vercel | Preview deploys per PR matter for a design-heavy site. |
| Analytics | Umami, self-hosted | Privacy, ownership, a job for the homelab. |
| Monorepo | pnpm workspaces | Three publishable units. |

### Considered and rejected

- **Next.js** - App Router is more machinery than a static content site needs.
- **Hugo** - fastest builds, but the CLI, ingest function, and shared zod schema all want to be TypeScript. A Go SSG splits the stack for no gain.
- **Self-hosting everything on the homelab** - see §4.3.
- **Headless CMS (Sanity, Contentful)** - reintroduces the lock-in and browser editing this project exists to avoid.
- **Content in a database** - loses git history, loses Obsidian-as-repo, adds a backup problem.

---

## 8. Integrations

### 8.1 Coding agents (Claude Code and anything else)

**Not Claude-specific.** Ships as `integrations/skill/SKILL.md`, a plain markdown file any agent that can read instructions and run a command can consume. Claude Code picks it up from `~/.claude/skills/publish/`; Cursor, Codex, Aider, or a shell script read the same file.

```markdown
---
name: publish
description: Publish the current markdown or HTML document to the
  configured publishd endpoint. Use when the user says "publish this",
  "ship this post", or asks to put a write-up online.
---

Read docs/design.md before writing or editing any content file.

1. Confirm the target file with the user if ambiguous.
2. Ensure frontmatter has at minimum a `title`. Propose `tags`, `type`,
   and a one-line `summary`; confirm before adding.
3. Run: npx -y publishd <file> --status draft
4. Report the preview URL. Publish for real ONLY on explicit
   confirmation: npx -y publishd <file> --status published
```

**Draft-first by default is the important detail.** An agent should never make something public without a second, explicit turn.

`publishd` reads stdin, so `claude -p "write a post about X" | publishd -` covers the fully automated path.

### 8.2 The design contract: `docs/design.md`

A single file telling any agent - or you in six months - what a content file should look like, so output stays consistent no matter what produced it. `SKILL.md` references it in its first instruction.

- **Frontmatter rules** - required and optional fields, the `type` enum with when each applies, how to write a `summary`.
- **Tone and structure** - sentence case headings, at most three heading levels, language-tagged code blocks, links in prose rather than a trailing "Links" section.
- **Tag vocabulary** - the existing tag list, with an instruction to reuse before inventing. This is what stops an agent coining `k8s` when `kubernetes` exists.
- **Typography and colour tokens** - so any HTML `page` an agent generates matches the site.
- **Worked examples** - one good short note and one good long post, in full. Examples move an agent's output far more than rules do.

Kept as `docs/design.md` rather than `CLAUDE.md`: agent-neutral, part of the public repo, and a human reads it as documentation rather than configuration.

### 8.3 Obsidian

**v1, day one, no code.** The "Shell commands" plugin, bound to a hotkey:

```bash
npx -y publishd "{{file_path:absolute}}" --status draft
```

Asset resolution works because the CLI walks up from the file to find `.obsidian/` and treats that as the vault root.

**v2, a real plugin**: command palette entry with a modal for status/tags/type, a status bar indicator showing published / draft / local-only, a `shekse-url` frontmatter property written back on success, and right-click "Copy public link". v2 because the shell command covers 90% of the value, and the plugin should be designed after a few months of knowing what you actually reach for.

### 8.4 CLI surface

```
publishd <file|->              # publish or update (the default action)
  --status draft|published
  --profile <name>
  --kind article|page
  --tags a,b  --type post
  --dry-run                    # print resolved frontmatter + diff, send nothing
  --open                       # open the URL when the build goes live

publishd list [--status draft] # what is out there
publishd unpublish <slug>      # -> status: archived
publishd doctor                # check config, token, endpoint reachability
publishd init                  # write the config file interactively
```

The binary is `publishd` and publishing is its default action, so the common case is `publishd note.md` with no subcommand.

`--dry-run` is not a nicety. It is what makes the pipeline trustworthy from an agent, because you can see exactly what would be committed before anything is.

---

## 9. UI and design

**Reading-first, editorially restrained, dark-mode native.** Closer to a well-set book than a SaaS marketing page.

**References:** paco.me (homepage list pattern, hierarchy from weight and colour rather than size), rauno.me (interaction polish, ⌘K palette), maggieappleton.com (surfacing `type` without a category tree), Linear changelog (year-grouped list), Stripe docs (code block treatment), Are.na (two-colour discipline).

**Anti-patterns to avoid explicitly:** card grids with gradient placeholder images, a hero with a centred headline, "Read more →" buttons, reading-time badges on the index, animated gradient blobs, anything that looks like a Tailwind UI template.

### 9.1 Design tokens - palette 3, Cream

```css
/* light */
--bg:      #FDFBF7;   --surface: #F5F1E8;
--text:    #14120F;   --mute:    #6E665A;
--border:  #E6DFD1;   --accent:  #A8480B;

/* dark */
--bg:      #0F0E0C;   --surface: #1A1815;
--text:    #EDE8DF;   --mute:    #948B7C;
--border:  #2A2621;   --accent:  #E3944A;
```

Two neutrals plus one accent. No secondary accent, no semantic colour scale beyond what code highlighting needs.

### 9.2 Type scale - pairing B, Documentation

| Role | Face | Size |
| --- | --- | --- |
| Article body | Inter, 400, 1.68 line-height | 17px |
| Headings | Inter Tight, 600, tight tracking | 32 / 24 / 19px |
| UI, meta, dates | Inter, 450 | 14px |
| Code | JetBrains Mono | 14px |

All-sans gives up the serif signal, so the design earns its character elsewhere: the warm cream ground, the burnt-orange accent, generous spacing, and layout restraint. Body drops from 19px to 17px because Inter runs optically larger than a serif at the same size.

Measure capped at **68ch** - one column, centred, no sidebar. 8px spacing base with generous vertical rhythm; paragraph spacing about 1.5x line-height.

### 9.3 Pages

| Route | Contents |
| --- | --- |
| `/` | Bio line plus the year-grouped list |
| `/<slug>` | The article. Flat URLs, reserved words guarded by the schema. |
| `/p/<slug>` | An HTML `page` artifact, served verbatim |
| `/preview/<uuid>` | Draft, `noindex`, draft banner strip |
| `/tags`, `/tags/<tag>` | Tag cloud sized by count; filtered list |
| `/til` | TIL entries, denser, date-led |
| `/archive` | Everything, one line per item |
| `/about` | Hand-written |
| `/rss.xml`, `/feed.json`, `/sitemap.xml` | Machine surfaces |

### 9.4 SEO and machine surfaces

All generated at build, none hand-maintained. Nothing here should ever be a checklist item at publish time.

| Surface | What ships |
| --- | --- |
| `sitemap.xml` | Astro's sitemap integration. Drafts, previews, archived excluded. `lastmod` from the git commit date, not the build date, so a rebuild does not churn every entry. |
| `robots.txt` | Allow all, point at the sitemap, disallow `/preview/`. |
| Icons | Generated at build from one source SVG: `favicon.ico`, 32/180px PNGs, `apple-touch-icon`, maskable 192/512. |
| `site.webmanifest` | Name, theme colour per scheme, icons. |
| Per-page meta | `<title>`, description from `summary`, canonical, Open Graph, `twitter:card summary_large_image`. Drafts add `noindex, nofollow`. |
| JSON-LD | `BlogPosting` per article; `Person` + `WebSite` on the homepage. `name: "shekse"`, `alternateName: "Seemant Shekhar"`. |
| Feed autodiscovery | `<link rel="alternate">` for RSS and JSON Feed in every head. |
| Theme colour | `<meta name="theme-color">` with a `prefers-color-scheme` variant. |

Enforced, not assumed: the Lighthouse CI budget covers SEO at >= 100, and a unit test asserts every published route emits a canonical URL, an OG image, and valid JSON-LD.

### 9.5 Light and dark, with an icon toggle

Both themes ship from day one:

- A sun/moon **icon button** in the header, no text label, with an accessible name and `title`.
- Default follows `prefers-color-scheme`. An explicit choice persists to `localStorage` and wins from then on.
- A tiny inline script in `<head>`, before first paint, applies the stored choice. The one piece of render-blocking JS on the site, and it exists solely to prevent a white flash on a dark-theme load.
- Every colour is a CSS custom property. A theme swap changes values in one place.
- Code blocks carry a Shiki theme per scheme via CSS variables, so highlighting flips with the page.
- Images get slight desaturation in dark mode so light-background screenshots do not glare.

### 9.6 Article page details

- **Heading anchors** (`#`) on hover, in the left margin.
- **Code blocks** use Shiki with a theme matched to the site palette, not a stock Dracula. Copy button on hover.
- **Footnotes** as margin sidenotes above 1100px, inline below.
- **No table of contents** unless the article exceeds 6 headings, then a thin sticky rail, not a boxed card.
- **View transitions** between index and article (Astro built-in), so the title appears to persist across navigation. Cheap, and the single most "designed" thing on the site.

### 9.7 Accessibility and performance budget

- WCAG AA contrast minimum on both themes, verified in CI.
- Focus rings visible and accent-coloured, never removed.
- `prefers-reduced-motion` disables view transitions.
- **Enforced by Lighthouse CI:** LCP < 1.0s on simulated 4G, CLS 0, total JS < 20KB gzipped per page, performance and accessibility both >= 98. A build that regresses this fails.

---

## 10. Open source packaging

Public from the first commit, MIT.

### 10.1 What "spin up your own" has to mean

Fork the template, set four environment variables, click deploy, and publish your first post from your own machine inside fifteen minutes, with no code edits. Anything requiring a source edit to make it yours is a bug.

### 10.2 One config file, zero hardcoded identity

Nothing in the codebase may reference `shekse.com`, your name, or your repo:

```ts
export default defineSiteConfig({
  title:       "shekse",
  url:         "https://publish.shekse.com",
  bio:         "Notes on homelab infrastructure, distributed systems, and tools I build.",
  author:      { name: "Seemant Shekhar", byline: "shekse",
                 github: "seemantshekhar43" },
  content:     { repo: "seemantshekhar43/shekse-publish-content", branch: "main" },
  theme:       { font: "docs", palette: "cream" },
  features:    { til: true, search: true, htmlPages: true },
})
```

`theme` makes the font pairings and palettes named presets someone else picks from, rather than a fork-and-edit-the-CSS exercise.

### 10.3 Which name appears where

Three names, settled once here rather than per file:

| Surface | Name | Why |
| --- | --- | --- |
| Site byline, RSS author, homepage | `shekse` | The pen name is the public identity |
| LICENSE copyright line | Seemant Shekhar | Copyright attaches to a legal person. The one non-negotiable. |
| `package.json` author | Seemant Shekhar | Convention, matches the LICENSE |
| JSON-LD `Person` | `name: "shekse"`, `alternateName: "Seemant Shekhar"` | Connects pen name to person without the byline reading as a legal document |
| Repo owner | `seemantshekhar43` | Personal account. No org - an org buys collaborator management a single-author project does not need, and a repo can be transferred later. |
| Git commit author | Seemant Shekhar | Whatever your global git config already is |

**`publishd` always means the tool; `shekse` always means you.** No overlap. The `shekse` npm org is being deleted, so scoped `@shekse/*` is off the table.

### 10.4 What ships

| Artifact | Form | Notes |
| --- | --- | --- |
| `seemantshekhar43/publishd` | Public repo, MIT | Site, ingest function, CLI, schema. "Deploy to Vercel" button prompting for env vars. |
| `seemantshekhar43/publishd-content-template` | GitHub *template* repo | Empty content repo with validation workflow and one example post. Neutral name, unlike your own `shekse-publish-content`, because other people start from it. |
| `publishd` | npm package via npx | Unscoped. Publish is the default action. |
| `publishd-schema` | npm package | Published separately so the content repo's CI can validate without vendoring the site. |
| Skill | `integrations/skill/SKILL.md` | Copy into any agent's skills directory. References `docs/design.md`. |

### 10.5 README structure

1. **One screenshot and one command.** Nothing else above the fold.
2. **Deploy your own** - Vercel button, four env vars, DNS, content repo from template. Numbered, no prose.
3. **Publish from your editor** - CLI install, `publishd init`, first publish.
4. **Integrations** - Obsidian shell command, agent skill with the copy-paste path.
5. **Configuration reference** - every field and env var, generated from the zod schema so it cannot drift.
6. **Architecture** - the diagram, and why git rather than a database.
7. **Security model** - what the ingest token protects, the HTML `page` same-origin constraint, and explicitly what this does *not* defend against.

### 10.6 Public from the first commit

Building in the open forces the config discipline to be real rather than aspirational, and there is no later moment where you have to audit history before flipping the switch. Three consequences must be handled day one:

1. **Secret scanning from commit one, not after the first leak.** GitHub push protection enabled, plus `gitleaks` in pre-commit and CI. A token pushed to a public repo is burned immediately, and rewriting history does not un-burn it. **The single non-negotiable item.**
2. **The README must say "work in progress" honestly.** A public repo at M1 is a walking skeleton. Say so, with a status line and what does not work yet.
3. **Commit messages and code comments are now public writing.** Conventional commits were already planned, which covers most of it.

What does *not* change: the full README, contribution guide, and deploy button are still M4 work. Public from commit one means the repo is *visible* from commit one, not *documented* from commit one.

> The code repo is public, so the **content** repo being private is now the only thing separating drafts from the world. Keep them as two repos, and never let a convenience commit put content into the code repo.

### 10.7 What this costs

- **Config plumbing everywhere.** Every hardcoded value becomes a config lookup. The bulk of the work, and unglamorous.
- **The security story has to be real.** Other people's deployments inherit whatever you ship.
- **Docs become a maintained surface.** A stale README on a public repo is worse than no README.
- **Issues and PRs from strangers.** Pre-decide the scope you will accept in a short CONTRIBUTING.md.

---

## 11. SDLC

`main` is always deployable. Short-lived branches merged by PR. Conventional commits, enforced by commitlint.

### CI on the code repo

Per PR: `lint` -> `typecheck` -> `test` (vitest: schema validation, Obsidian normalisers, slug resolution, ingest auth) -> `build` -> Lighthouse CI against the preview -> internal link check. Preview URL posted to the PR. On merge: production deploy, with changesets handling CLI versioning and the npm publish.

### CI on the content repo

A fast job, under 15 seconds, on every push:

1. Validate changed files' frontmatter against the published `publishd-schema`
2. Check slug uniqueness across the repo
3. Check that any changed slug has a matching `redirects.json` entry
4. Repo size check: warn above 200MB, fail above 400MB

Only on success does it fire the Vercel deploy hook. **This is why a bad publish never produces a broken site** - the content repo gates itself before the site rebuilds.

### Testing strategy

| Level | Covers | Runs |
| --- | --- | --- |
| Unit | Schema, normalisers, slug logic. Highest-value, since this is where correctness lives. | Per PR |
| Integration | Ingest function against a mocked GitHub API: auth, rate limiting, update-vs-create. | Per PR |
| E2E | Playwright: publish a fixture to staging, assert page renders and appears in RSS and search. | Nightly |
| Visual | Screenshot diffs on homepage and article in both themes. On a design-led site these are the regressions that matter. | Per PR |

### Environments

| Env | Site | Content branch |
| --- | --- | --- |
| local | `localhost:4321` | local clone |
| staging | Vercel preview URL | `staging` |
| prod | `publish.shekse.com` | `main` |

### Observability

- Vercel logs for ingest errors, with the client name on every request.
- `/api/health` returns schema version, last successful publish timestamp, and content repo commit SHA.
- Umami on the homelab for reader analytics.
- A failed ingest sends a push notification via ntfy on the homelab. You should know a publish failed without checking a dashboard.

---

## 12. Milestones

### M1 - Walking skeleton (week 1)

The full path end to end, ugly but real: CLI -> ingest -> GitHub commit -> Astro build -> live URL. Unstyled, markdown only, no assets, no drafts.
**Done when:** `publishd note.md` returns a working public URL.

Two things carry into M1 and should not be deferred: `site.config.ts` exists in the first commit (hardcoding is cheap to avoid now, expensive to unpick later), and secret scanning is enabled before the first push.

### M2 - The site (week 2)

Design system, homepage, article page, both themes, RSS, sitemap, OG images.
**Done when:** it looks like something you would link to from a CV.

### M3 - Real authoring (week 3)

Drafts and previews, Obsidian asset resolution and wikilinks, the shell-command integration, the agent skill, `list` / `unpublish` / `doctor`.
**Done when:** you publish from Obsidian without touching a terminal.

### M4 - Hardening (week 4)

Pagefind, tag and type pages, redirects, link checking, the Lighthouse budget in CI, homelab Umami and backup mirror, ntfy alerts, the full README and deploy button.
**Done when:** CI would catch every failure mode you can currently name.

### M5 - Later

Obsidian plugin proper, scheduled publishing, multi-part series, giscus comments, R2 asset migration if the size warning fires.

---

## 13. Success metrics

- **Time from "this is worth publishing" to a live URL: under 60 seconds.** The only metric that decides whether the product gets used.
- Zero manual steps between the command and the live page.
- Publishing works from a phone, via Obsidian mobile plus Working Copy, or the raw API.
- Lighthouse performance and accessibility hold at >= 98 six months in.
- You publish more than you did before it existed. *If not, the problem was never tooling and the project should be reassessed.*

---

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Building the tool becomes the substitute for writing | M1 is deliberately ugly and ships in a week. Write something real before starting M2. |
| Token leaks into the public repo or an agent transcript | Tokens in 1Password, referenced by `op://` URI. CLI never echoes a token. Per-client tokens make revocation cheap. Secret scanning from commit one. |
| An agent publishes something half-finished publicly | Draft-first is the default in the skill. `--status published` requires an explicit flag and confirmation turn. |
| Repo bloat from screenshots | CI warns at 200MB, fails at 400MB. R2 migration pre-planned behind one function. |
| Vercel pricing or policy change | Site is static output. Cloudflare Pages migration is an afternoon; ingest becomes a Worker. Content untouched. |
| Obsidian syntax breaks rendering | Normalisers unit-tested against a fixture vault containing every construct. Unknown syntax degrades to plain text, never a broken page. |
| Slug collisions with reserved routes | Schema rejects `tags`, `til`, `archive`, `about`, `preview`, `api`, `rss`, `p` and friends at validation time, client-side. |

---

## 15. Decision log

All settled across four review rounds on the HTML artifact.

| Question | Answer | Round |
| --- | --- | --- |
| Code repo visibility | Public, open source | 1 |
| Does `/til` need its own surface? | Merged into the main feed; `type: til` still drives layout | 1 |
| Staging domain | Vercel preview URLs only. No DNS entry | 1 |
| Vault layout | `published/` subfolder of the vault, synced by obsidian-git | 2 |
| HTML pages in the feed | Listed like posts, `listed: false` hides one | 2 |
| Open source timing | Public from the first commit | 2 |
| Font pairing | B, Documentation. Inter Tight / Inter / JetBrains Mono | 2 |
| Palette | 3, Cream. Warm ground, burnt-orange accent | 2 |
| Package name | `publishd`, unscoped. Publish is the default action | 3 |
| GitHub owner | `seemantshekhar43`. No org | 3 |
| Repo naming | `publishd` for the tool, `shekse-publish-content` for content | 4 |

### Outstanding

- The round-1 feedback note ended with a bare `5.` and no text. Items 1-3 became `docs/design.md` (§8.2), the icon theme toggle (§9.5), and the SEO surfaces (§9.4). **Item 5 is still unknown.**
