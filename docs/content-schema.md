# Content schema

The precise contract for what a content file is. Defined once in `packages/schema` and enforced in three places: the CLI before sending, the ingest endpoint on receipt, and the site at build time.

If you are changing anything about frontmatter, slugs, or Obsidian syntax, this is the file to read and the file to update.

---

## 1. Article frontmatter

```yaml
---
title: "Running Kubernetes on a Beelink cluster"
slug: k8s-beelink-cluster
date: 2026-09-20
status: published
type: post
tags: [homelab, kubernetes]
summary: "Three mini PCs, one control plane, and every mistake I made getting there."
canonical: https://example.com/original
publishAt: 2026-09-25T09:00:00Z
---
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `title` | string, 1-200 | **yes** | - | The only required field |
| `slug` | slug string | no | derived from `title` | Immutable once published. See §3. |
| `date` | ISO date | no | now, at first publish | Never changes on update |
| `updated` | ISO date | no | set on every update | Written by the pipeline, not the author |
| `status` | `draft` \| `published` \| `archived` | no | `draft` | See §4 |
| `type` | `post` \| `note` \| `til` \| `doc` | no | `post` | Drives layout, not taxonomy |
| `tags` | string[] | no | `[]` | Flat. No hierarchy, no parent tags. |
| `summary` | string, max 300 | no | - | Used in RSS and hover on the index. The OG card template uses title/type/date only. |
| `canonical` | URL | no | - | Points search engines at the original if cross-posted |
| `publishAt` | ISO datetime | no | - | Future value holds the post back. See §5. |
| `listed` | boolean | no | `true` | `false` keeps it out of the feed but still published |

**Only `title` is required.** This matters: a note dragged out of Obsidian with a one-line frontmatter block must just work. Every other field has a defensible default.

### The `type` enum

`type` drives **layout**, not categorisation. Tags do categorisation.

| Value | Layout behaviour |
| --- | --- |
| `post` | Full article. Gets an OG image, appears in RSS and the main feed. |
| `note` | Short-form. No hero, no OG image generation, still indexed and listed. |
| `til` | "Today I learned". Timestamp-prominent, denser layout. |
| `doc` | Evergreen reference. Shows "last updated" rather than a published date, and is **excluded from the chronological feed**. |

Adding a fifth value is a schema change with layout work attached. Do not add one casually.

---

## 2. Page metadata (HTML)

An HTML `page` cannot carry YAML frontmatter, so metadata comes from `<meta>` tags in the document head, falling back to `<title>` and then to CLI flags.

```html
<title>PRD - publish.shekse.com</title>
<meta name="shekse:slug"    content="prd-publishd">
<meta name="shekse:type"    content="doc">
<meta name="shekse:summary" content="Product requirements, settled over four review rounds.">
<meta name="shekse:tags"    content="publishd, planning">
<meta name="shekse:status"  content="published">
<meta name="shekse:listed"  content="true">
```

Resolution order for every field: `<meta name="shekse:*">` -> CLI flag -> `<title>` (for `title` only) -> default.

The document is otherwise **stored and served byte-for-byte**. The pipeline reads the head; it does not rewrite the document.

---

## 3. Slugs

### Derivation

When `slug` is absent, derive from `title`: lowercase, strip accents, replace any run of non-alphanumerics with a single `-`, trim leading and trailing `-`, truncate to 80 characters at a word boundary.

```
"Running Kubernetes on a Beelink cluster"  ->  running-kubernetes-on-a-beelink-cluster
"Why I left Docker Compose (finally)"      ->  why-i-left-docker-compose-finally
```

### Validation

- Pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- Length 1-80
- Must be unique across the whole content repo, not just within a folder
- If `title` has no alphanumeric characters, derivation produces an empty slug, which is rejected: the author must provide an explicit `slug`

### Reserved slugs

These collide with real routes and are rejected **client-side, before sending**:

```
about, api, archive, assets, feed, p, preview, public, rss, search,
sitemap, tags, til, _astro, 404, 500
```

Keep this list in sync with `apps/web/src/pages`. Adding a route means adding its slug here in the same change.

### Slugs are permanent

The slug is the primary key. Republishing the same slug is an **update**, producing a `publish: update <slug>` commit rather than a duplicate.

Changing a slug requires a `redirects.json` entry in the same change, mapping old to new. **CI fails a slug change without one.** URLs never break.

---

## 4. Status lifecycle

```
draft  ->  published  ->  archived
  ^           |
  +-----------+   (can go back)
```

| Status | URL | In feed / RSS / search | Robots |
| --- | --- | --- | --- |
| `draft` | `/preview/<uuid>` | No | `noindex, nofollow` |
| `published` | `/<slug>` | Yes, unless `listed: false` | Indexed |
| `archived` | `/<slug>` returns **410 Gone** | No | - |

The preview UUID is stable per slug, so re-publishing a draft keeps the same shareable link. It is derived deterministically as an HMAC-SHA256 of the slug keyed by the server-only `PUBLISHD_PREVIEW_SECRET` env var (see `apps/web/src/lib/preview.ts`), not a randomly generated id persisted anywhere - the HMAC keeps it unguessable, since the slug alone gives an attacker nothing without the secret. If `PUBLISHD_PREVIEW_SECRET` is unset, publishing a draft is refused (500) and the drafts loader yields no entries.

`archived` returns 410 rather than 404 deliberately: 410 tells a crawler the resource is intentionally gone, so it drops from the index faster and does not look like a broken site.

---

## 5. Scheduled publishing

`publishAt` in the future holds a post back from the build even when `status: published`. An hourly Vercel cron triggers a rebuild, which picks up anything whose time has passed.

- `publishAt` in the past is ignored - treated as already published.
- The comparison is at build time, in UTC.
- A scheduled post is not reachable at its URL before its time. It is not merely hidden from the feed.

---

## 6. Obsidian normalisation

Obsidian-flavoured markdown is **normalised on ingest, never rejected**. Unknown syntax degrades to plain text; it must never produce a broken page.

| Input | Output |
| --- | --- |
| `![[image.png]]` | Resolved against the vault root, uploaded, rewritten to a real URL |
| `![[image.png\|300]]` | As above, width hint preserved |
| `[[Some Other Note]]` | A link if that note is published; **plain text if not**. Never a dead link. |
| `[[Some Note\|display text]]` | As above, using the display text |
| `#tag` inline | Merged into frontmatter `tags`, removed from the body |
| `> [!note]`, `> [!warning]` etc. | Styled admonition components |
| `%%comment%%` | Stripped |
| ` ```dataview ` blocks | Stripped, with a CLI warning naming the file |
| ` ```templater ` / `<%% %%>` | Stripped, with a CLI warning |

### Vault root resolution

The CLI walks up from the target file looking for a `.obsidian/` directory and treats its parent as the vault root. Asset paths in `![[...]]` resolve against that root, matching Obsidian's own behaviour.

If no vault root is found, embeds resolve relative to the file itself, and a warning is printed.

### Testing requirement

Normalisers are unit-tested against a fixture vault containing **every** construct in the table above. This is the highest-value test surface in the project, because it is where correctness actually lives. A new Obsidian construct means a new fixture.

---

## 7. Validation errors

Errors must name the field path and the expected shape. The author is usually mid-flow in Obsidian and needs to fix it in one read.

Good:

```
✗ frontmatter.type: expected one of "post" | "note" | "til" | "doc", got "article"
✗ frontmatter.slug: "My Post" is not a valid slug (lowercase letters, digits, hyphens)
✗ frontmatter.slug: "tags" is reserved and collides with the /tags route
```

Bad:

```
✗ Validation failed
✗ ZodError: [{"code":"invalid_enum_value","path":["type"], ... }]
```

Validation is **all-or-nothing**. A request that fails validation results in no commit at all, never a partial write.
