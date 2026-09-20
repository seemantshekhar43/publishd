# Architecture

How `publishd` is put together, and why. For the product reasoning behind these choices, see [`PRD.md`](PRD.md).

---

## 1. The shape of the system

One sentence: **a small serverless endpoint validates markdown and commits it to a git repo, which triggers a static site build.**

Everything else is detail. There is no database, no running server to maintain, no queue, and no state that is not either in git or regenerated at build time.

```
  Obsidian          Coding agent        Terminal
  (shell cmd)       (SKILL.md)          (publishd)
      |                  |                  |
      +---------+--------+------------------+
                |  POST /api/ingest   Authorization: Bearer <token>
                v
      +---------------------------+
      |  Ingest function (Vercel) |  1. auth  -> named client
      |                           |  2. validate against zod schema
      |                           |  3. normalise Obsidian syntax
      |                           |  4. resolve slug, detect create vs update
      +-------------+-------------+  5. commit via GitHub API
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

Publishing must work on a plane, when home internet is down, and when the homelab is mid-upgrade. Putting the ingest endpoint behind a Cloudflare Tunnel would make publishing a blog post depend on the author's house being up. The homelab gets the two jobs where it genuinely wins - analytics the author owns, and an offline backup that is not another GitHub clone.

---

## 2. Repository boundaries

Two repositories, and the split is load-bearing.

| Repo | Visibility | Holds |
| --- | --- | --- |
| `seemantshekhar43/publishd` | **Public**, MIT | All code: site, CLI, ingest function, schema |
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
    web/                 Astro site + /api/ingest route
      src/content/       content collection, synced from the content repo at build time
      src/pages/
      src/components/
      src/styles/
    cli/                 the publishd CLI, published to npm
  packages/
    schema/              zod frontmatter schema + Obsidian normalisers
  integrations/
    obsidian-plugin/     deferred to M5
    skill/               SKILL.md - agent-agnostic
  docs/
  site.config.ts         all deployment-specific identity
```

### `packages/schema` is the keystone

It is imported by three consumers, and that is the entire point:

| Consumer | When it validates | What it catches |
| --- | --- | --- |
| `apps/cli` | Before sending | Bad frontmatter on the author's laptop, before a network call |
| `apps/web` ingest route | On receipt | A malformed request from any client, including a future one |
| `apps/web` build | At build time | Drift between what is in the content repo and what the site expects |

It is also published to npm as `publishd-schema` so the **content repo's** CI can validate a push without vendoring the whole site.

**Rule:** a frontmatter field is declared exactly once, in `packages/schema`. If you need its shape somewhere else, import the type. Never re-declare it.

---

## 4. The ingest endpoint

`POST /api/ingest`, a Vercel serverless function on the Node runtime (it needs Node for the GitHub SDK).

### Request

```http
POST /api/ingest
Authorization: Bearer <token>
Content-Type: application/json

{
  "kind": "article",          // "article" | "page"
  "frontmatter": { ... },     // parsed and validated client-side too
  "body": "# ...",            // markdown, or raw HTML when kind is "page"
  "assets": [                 // optional
    { "path": "topology.png", "contentType": "image/png", "data": "<base64>" }
  ]
}
```

### Pipeline

1. **Authenticate.** Constant-time compare against hashed tokens. Resolve to a named client (`cli`, `obsidian`, `agent`) and log it. Rate limit 30 publishes/hour/token.
2. **Validate** against the zod schema. Reject with a readable error naming the offending field. Never partially apply.
3. **Normalise** Obsidian syntax - see [`content-schema.md`](content-schema.md) for the exact rules.
4. **Resolve the slug** and determine create vs update. The slug is the primary key, so republishing the same slug is an update, producing a `publish: update <slug>` commit.
5. **Commit** via the GitHub API, one commit per publish, including any assets.

The function returns the final URL immediately. It does not wait for the build. The CLI polls the deploy and prints `live` when it completes.

### Latency budget

| Stage | Target |
| --- | --- |
| Ingest (auth, validate, normalise) | 300ms |
| GitHub commit | 500ms |
| Vercel build | 20-40s |

The 60-second end-to-end figure in the PRD is the metric that decides whether this gets used. Treat a regression here as a bug.

### Failure modes

| Failure | Behaviour |
| --- | --- |
| Invalid token | 401, logged, no commit. Rate limiter still counts the attempt. |
| Schema violation | 422 with the field path and the expected shape. No commit. |
| GitHub API down | 502. The CLI retries with backoff. Nothing is half-written, because it is one commit. |
| Content CI fails after commit | The deploy hook never fires. The site keeps serving the previous build. |
| Build fails | Vercel keeps the last good deployment live. ntfy alert fires. |

The design goal is that **no failure produces a broken published site** - the worst case is that a publish does not appear.

---

## 5. Auth

Bearer tokens, one per client, stored as hashes in a single Vercel environment variable:

```
PUBLISHD_TOKENS='{"cli":"sha256:...","obsidian":"sha256:...","agent":"sha256:..."}'
```

- Constant-time comparison. Never `===` on the raw value.
- Per-client tokens so a leak is revoked without rotating everything.
- The client name is logged on every publish, which is how you find out *which* integration is misbehaving.
- No OAuth, no user table, no session. There is exactly one author per deployment.

The token is the trust boundary for the whole system. Everything downstream - including raw HTML in a `page` - is trusted because it got past the token.

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

Do not write a sanitiser. Sanitising HTML well enough to be a real security boundary is a losing game, and it would break the entire point of serving an artifact verbatim. The ingest token is the boundary.

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
| RSS, JSON Feed, sitemap | Astro integrations |

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
| `PUBLISHD_TOKENS` | Vercel | Hashed ingest tokens |
| `GITHUB_TOKEN` | Vercel | Commit access to the content repo |
| `PUBLISHD_ENDPOINT` | Client | Overrides the configured endpoint |
| `PUBLISHD_TOKEN` | Client | The client's bearer token |

The client reads `~/.config/publishd/config.toml` for named profiles, so the same CLI targets local, staging, and production without a code change.

---

## 9. Extension points

Where to add things, so they land in the right layer:

| You want to | Change |
| --- | --- |
| Add a frontmatter field | `packages/schema` only. The three consumers pick it up. |
| Support a new client | Nothing. Add a token to `PUBLISHD_TOKENS`. The HTTP contract is the integration surface. |
| Change the look | `site.config.ts` theme presets, or `docs/design.md` tokens. Not component CSS. |
| Add a route | `apps/web/src/pages`, and add the slug to the reserved list in the schema. |
| Move assets off git | Reimplement `uploadAsset()` in the CLI. One function, by design. |

---

## 10. Deliberately not built

Listed so nobody re-proposes them as improvements:

- **A database.** Git is the store. See PRD §4.2.
- **An admin UI.** The editor is Obsidian or an IDE.
- **Bidirectional sync.** The pipeline is one-way. The site is never the source of truth.
- **An HTML sanitiser.** See §6.
- **R2 / object storage for assets.** Deferred behind a single function until the repo size warning at 200MB actually fires.
- **Multi-author support.** One author per deployment. Open-sourcing means many deployments, not many authors on one.
