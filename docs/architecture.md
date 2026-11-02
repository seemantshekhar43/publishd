# Architecture

How `publishd` is put together, and why. For the product reasoning behind these choices, see [`PRD.md`](PRD.md).

---

## 1. The shape of the system

One sentence: **the CLI validates markdown locally and pushes it to a git repo, which triggers a static site build.**

Everything else is detail. There is no database, no running server to maintain, no queue, and no state that is not either in git or regenerated at build time.

```
  Obsidian          Coding agent        Terminal
  (shell cmd)       (SKILL.md)          (publishd)
      |                  |                  |
      +---------+--------+------------------+
                |  all three shell out to the same `publishd` CLI
                v
      +---------------------------+
      |  publishd CLI             |  1. validate against zod schema
      |                           |  2. normalise Obsidian syntax (local clone)
      |                           |  3. resolve slug, detect create vs update
      +-------------+-------------+  4. write + `git commit` + `git push`
                    v
      +---------------------------+
      | GitHub: content repo      |  markdown + assets, full history
      | (private)                 |  CI validates before the deploy hook fires
      +-------------+-------------+
                    | repository_dispatch / deploy hook
                    v
      +---------------------------+
      | Vercel build (Astro)      |  MD -> HTML, OG images, Pagefind index,
      +-------------+-------------+  RSS, JSON Feed, sitemap, icons
                    v
      +---------------------------+
      | publish.shekse.com        |  static, CDN, ~40KB/page
      +---------------------------+

  Homelab, deliberately off the critical path:
    - Umami analytics
    - nightly `git clone --mirror` of the content repo
    - ntfy push notification on ingest failure
```

### Why the homelab is not in the path

Publishing must work on a plane, when home internet is down, and when the homelab is mid-upgrade. Routing a publish through anything hosted on the homelab (e.g. behind a Cloudflare Tunnel) would make publishing a blog post depend on the author's house being up. The homelab gets the two jobs where it genuinely wins - analytics the author owns, and an offline backup that is not another GitHub clone.

---

## 2. Repository boundaries

Two repositories, and the split is load-bearing.

| Repo | Visibility | Holds |
| --- | --- | --- |
| `seemantshekhar43/publishd` | **Public**, MIT | All code: site, CLI, schema |
| `seemantshekhar43/shekse-publish-content` | **Private** | Markdown and assets only. Never code. |

Reasons they are separate:

- Content commits must not trigger code CI, and code commits must not appear in content history.
- The content repo must stay something you could hand to any other static site generator tomorrow.
- The code repo is public. The content repo being private is the **only** thing separating unpublished drafts from the world.

A third repo, `seemantshekhar43/publishd-content-template`, is a GitHub *template* repo so that someone else can create their own content repo with one click. It carries a neutral name because other people start from it.

---

## 3. Monorepo layout

```
publishd/
  apps/
    web/                 Astro site (no write path - read-only at build time)
      src/content/       content collection, synced from the content repo at build time
      src/pages/
      src/components/
      src/styles/
    cli/                 the publishd CLI, published to npm - writes directly to a local
                         clone of the content repo and pushes
  packages/
    schema/              zod frontmatter schema, content-repo path helpers, Obsidian
                         normalisers, and preview-id derivation - shared by the CLI and
                         the site build
  integrations/
    obsidian/            shell-command integration (v1); a real plugin is deferred to M5
    skill/               SKILL.md - agent-agnostic
  docs/
  site.config.ts         all deployment-specific identity
```

### `packages/schema` is the keystone

It is imported by two consumers, and that is the entire point:

| Consumer | When it validates | What it catches |
| --- | --- | --- |
| `apps/cli` | Before writing to the content repo | Bad frontmatter on the author's laptop, before anything is committed |
| `apps/web` build | At build time | Drift between what is in the content repo and what the site expects |

It is also published to npm as `publishd-schema` so the **content repo's** CI can validate a push without vendoring the whole site.

**Rule:** a frontmatter field is declared exactly once, in `packages/schema`. If you need its shape somewhere else, import the type. Never re-declare it.

---

## 4. The publish pipeline

There is no ingest endpoint. Earlier versions of this system posted to a Vercel serverless function (`POST /api/ingest`) that validated the request and committed to the content repo on the CLI's behalf, authenticated with per-client bearer tokens. That hop only bought multi-tenant auth and rate limiting - value that matters when multiple untrusted clients publish through one server, and doesn't apply to a single-author deployment where the author already has git write access to their own content repo. So the CLI now writes and pushes directly.

### Pipeline (`apps/cli/src/publish.ts`)

1. **Validate** against the zod schema (`packages/schema`), locally, before anything is cloned or touched. Reject with a readable error naming the offending field. Never partially apply.
2. **Ensure the local clone** of the content repo is present and up to date (`apps/cli/src/git.ts`'s `ensureClone`) - clones it on first use, otherwise fetches and hard-resets to `origin/<branch>`. This clone is CLI-managed state the author never edits by hand.
3. **Normalise** Obsidian syntax (`publishd-schema`'s `normaliseObsidianMarkdown`) - see [`content-schema.md`](content-schema.md) for the exact rules. The published-slug lookup for wikilinks is now a filesystem walk of the local clone (`apps/cli/src/content-repo.ts`'s `listPublishedSlugs`), not a GitHub API call.
4. **Resolve the slug** and determine create vs update by checking whether the article file already exists in the clone. The slug is the primary key, so republishing the same slug is an update, producing a `publish: update <slug>` commit.
5. **Write** the article/page and any assets into the clone (`apps/cli/src/content-repo.ts`'s `commitArticle`/`commitPage`), then `git add -A && git commit && git push` (`git.ts`'s `commitAndPush`), one commit per publish, including any assets.

The push is the actual publish - it already succeeded by the time it returns. The CLI does not wait for the build; it polls the deploy and prints `live` when it completes. If the poll times out - e.g. several publishes queue back-to-back builds on Vercel - the CLI warns instead of failing, since the commit already succeeded; only the "wait and confirm live" step timed out.

### Failure modes

| Failure | Behaviour |
| --- | --- |
| Schema violation | CLI exits 1 with the field path and the expected shape. Nothing cloned, nothing written. |
| git remote unreachable / credentials rejected | `ensureClone`/`commitAndPush` throws; the CLI exits non-zero. Nothing is half-written, because the commit is local before the push. |
| Content CI fails after push | The deploy hook never fires. The site keeps serving the previous build. |
| Build fails | Vercel keeps the last good deployment live. ntfy alert fires. |
| Poll for "live" times out | Not a failure: the push already succeeded. The CLI warns and exits 0. |

The design goal is that **no failure produces a broken published site** - the worst case is that a publish does not appear.

---

## 5. Auth

No bearer tokens, no server-side auth layer. Obsidian, the agent skill, and the terminal are all just invocations of the same `publishd` CLI running as the author, on the author's own machine - there is no separate "client" to authenticate, because there is exactly one author and no server in between.

The trust boundary is ordinary git push access to the content repo: whatever credential (SSH key, PAT) the CLI's git invocations use is what's actually trusted. Everything downstream - including raw HTML in a `page` - is trusted because it got past that, not because it got past a token check in a serverless function.

This only holds because the deployment is single-author. A deployment that needs multiple untrusted publishers again would need to reintroduce a server-side gate (per-client credentials, rate limiting) in front of the content repo - see the now-removed `/api/ingest` in git history for the shape that took.

---

## 6. Content kinds

Two, and they run different pipelines on purpose.

| | `article` | `page` |
| --- | --- | --- |
| Input | `.md` / `.mdx` | One self-contained `.html` file |
| Processing | Parsed, normalised, rendered into the site layout | **None.** Stored and served byte-for-byte. |
| Metadata | YAML frontmatter | `<meta name="shekse:*">` tags, falling back to `<title>` and CLI flags |
| Site chrome | Full header, footer, theme | None. The artifact owns the whole page. |
| URL | `/<slug>` | `/p/<slug>` |
| Feed and search | Yes | Yes. `listed: false` hides one. |

A `page` is not a document the site renders, it is an artifact the site **hosts**. The separate route namespace is what stops the two blurring.

### The HTML security constraint

A `page` ships arbitrary JavaScript on the site's own origin. This is safe **only because** the site has no cookies, no login, and no authenticated surface to steal from.

> **If any deployment ever adds authentication, pages must move to a separate origin first.**

Do not write a sanitiser. Sanitising HTML well enough to be a real security boundary is a losing game, and it would break the entire point of serving an artifact verbatim. Git push access to the content repo is the boundary.

---

## 7. Build pipeline

Astro 5, static output. Everything below is generated at build and is disposable - none of it is stored in git.

| Output | Produced by |
| --- | --- |
| HTML pages | Astro content collections |
| Syntax highlighting | Shiki, themed from the site's own CSS variables so it flips with the theme |
| Search index | Pagefind, ~50KB, indexes the built output |
| OG images | `satori` + `@resvg/resvg-js`, from title, type, and date |
| Icons and manifest | Generated from one source SVG |
| RSS | `@astrojs/rss` |
| JSON Feed, sitemap | Hand-rolled - `@astrojs/sitemap` cannot produce the literal `/sitemap.xml` route section 9.3 specifies, and there is no official Astro helper for JSON Feed |

`lastmod` in the sitemap comes from the **git commit date**, not the build date. Otherwise a rebuild churns every entry and the sitemap becomes noise.

---

## 8. Configuration

All deployment-specific identity lives in one typed, schema-validated file:

```ts
export default defineSiteConfig({
  title:    "shekse",
  url:      "https://publish.shekse.com",
  bio:      "Notes on homelab infrastructure, distributed systems, and tools I build.",
  author:   { name: "Seemant Shekhar", byline: "shekse", github: "seemantshekhar43" },
  content:  { repo: "seemantshekhar43/shekse-publish-content", branch: "main" },
  theme:    { font: "docs", palette: "cream" },
  features: { til: true, search: true, htmlPages: true },
})
```

Secrets never live here. They are environment variables:

| Variable | Where | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | Vercel | Read-only access for `apps/web/scripts/sync-content.mjs` to pull content into the build. No longer needs write scope - the CLI pushes to the content repo directly over git, not through this token. |
| `PUBLISHD_PREVIEW_SECRET` | Vercel (build) and the author's `publishd` config | HMAC key deriving each draft's stable `/preview/<uuid>` id - see docs/content-schema.md section 4. The CLI needs its own copy (in `~/.config/publishd/config.toml` or `PUBLISHD_PREVIEW_SECRET` below) to print the same link the site build later verifies. |
| `PUBLISHD_CONTENT_REPO` | Client | Overrides the configured profile's content repo git remote |
| `PUBLISHD_SITE_URL` | Client | Overrides the configured profile's site URL |
| `PUBLISHD_BRANCH` | Client | Overrides the configured profile's branch |
| `PUBLISHD_PREVIEW_SECRET` | Client | Overrides the configured profile's preview secret |
| `PUBLISHD_CLONE_PATH` | Client | Overrides where the content repo is cloned locally |

The client reads `~/.config/publishd/config.toml` for named profiles, so the same CLI targets local, staging, and production without a code change. See `apps/cli/src/config.ts`.

---

## 9. Extension points

Where to add things, so they land in the right layer:

| You want to | Change |
| --- | --- |
| Add a frontmatter field | `packages/schema` only. Both consumers pick it up. |
| Support a new client | Nothing. Any script or integration that can shell out to `publishd` is a new client - there is no separate contract to extend. |
| Change the look | `site.config.ts` theme presets, or `docs/design.md` tokens. Not component CSS. |
| Add a route | `apps/web/src/pages`, and add the slug to the reserved list in the schema. |
| Move assets off git | Change `commitArticle()`'s writes in `apps/cli/src/content-repo.ts`. One function, by design. |
| Support multiple untrusted publishers again | Reintroduce a server-side gate in front of the content repo (auth, rate limiting) - see section 5. Not a small change. |

---

## 10. Deliberately not built

Listed so nobody re-proposes them as improvements:

- **A database.** Git is the store. See PRD §4.2.
- **An admin UI.** The editor is Obsidian or an IDE.
- **Bidirectional sync.** The pipeline is one-way. The site is never the source of truth.
- **An HTML sanitiser.** See §6.
- **R2 / object storage for assets.** Deferred behind a single function until the repo size warning at 200MB actually fires.
- **Multi-author support.** One author per deployment. Open-sourcing means many deployments, not many authors on one.
