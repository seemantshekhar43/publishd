# Roadmap

Five milestones. M1 to M4 are roughly a week each. Each has a single exit criterion - if it is not met, the milestone is not done, regardless of how many issues closed.

Issues are tracked on GitHub milestones `M1` through `M4`. M5 is deliberately unplanned.

---

## M1 - Walking skeleton

**Exit criterion: `publishd note.md` returns a working public URL.**

The full path end to end, ugly but real: CLI -> ingest -> GitHub commit -> Astro build -> live URL. Unstyled. Markdown only, no assets, no drafts, no search.

The point of M1 is to prove the pipeline, not to look good. Resist styling it. The biggest risk to this project is that building the tool becomes a substitute for writing with it, and an ugly M1 that works is the antidote.

Two things must land in M1 rather than later, because both are cheap now and expensive to retrofit:

- **`site.config.ts` exists in the first commit**, even though nothing needs it yet. Hardcoding is trivial to avoid on day one and painful to unpick later.
- **Secret scanning and `gitleaks` are enabled before the first push.** The repo is public from commit one.

---

## M2 - The site

**Exit criterion: it looks like something you would link to from a CV.**

Design system from [`design.md`](design.md), homepage, article page, both themes with the icon toggle, RSS, JSON Feed, sitemap, generated OG images, icons and manifest.

This is where the Lighthouse budget gets wired into CI, because it is much easier to hold a budget from the start than to recover one.

---

## M3 - Real authoring

**Exit criterion: you publish something from Obsidian without touching a terminal.**

Drafts and `/preview/<uuid>`, Obsidian asset resolution and wikilink handling, the shell-command integration, the agent skill, the HTML `page` kind, and the remaining CLI surface (`list`, `unpublish`, `doctor`, `init`).

This is the milestone that makes the tool actually usable day to day. M1 and M2 are infrastructure; M3 is the product.

---

## M4 - Hardening

**Exit criterion: CI would catch every failure mode you can currently name.**

Pagefind search and the command palette, tag and type pages, redirects with the CI guard, link checking, the full Lighthouse budget, homelab Umami and the nightly backup mirror, ntfy alerts on ingest failure, and the public-facing README with the deploy button.

---

## M5 - Later

Deliberately unplanned. Do not start any of these until M1 to M4 are in daily use:

- Obsidian plugin proper (the shell command covers 90% of the value)
- Scheduled publishing UI
- Multi-part series
- giscus comments
- R2 asset migration - **only if** the 200MB repo size warning actually fires

---

## What is deliberately not on this roadmap

Listed so nobody proposes them as improvements. Reasoning is in [`PRD.md`](PRD.md) §3 and `architecture.md` §10.

- A database
- An admin UI or web editor
- Bidirectional sync
- Multi-author support
- An HTML sanitiser
