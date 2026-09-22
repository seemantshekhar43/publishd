# Design

The look-and-feel contract. **Read this before writing any UI code, any HTML artifact, or any content file.**

Two halves: §1-6 are the visual system, §7-10 are the content style guide. An agent writing a blog post needs §7-10. An agent writing a component needs §1-6.

---

## 1. Direction

**Reading-first, editorially restrained, dark-mode native.** The site should feel closer to a well-set book than a SaaS marketing page.

The design was chosen over three alternatives in a review round. It is all-sans on a warm cream ground - which means it **gives up the serif signal** that usually does the heavy lifting for "this was designed, not generated". The character has to come from somewhere else: the warm ground, the single burnt-orange accent, generous spacing, and restraint in the layout. Every one of those is load-bearing. Cramming the spacing or adding a second accent colour collapses the whole thing.

### References worth studying

| Source | What to take |
| --- | --- |
| paco.me | The homepage list pattern; hierarchy built from weight and colour rather than size |
| rauno.me | Interaction polish, especially the command palette and hover states |
| maggieappleton.com | Surfacing a content `type` without a category tree |
| Linear changelog | The year-grouped chronological list |
| Stripe docs | Code block treatment and inline code density |
| Are.na | The discipline of a two-colour palette |

### Anti-patterns - do not ship these

- Card grids with gradient placeholder images
- A hero section with a centred headline
- "Read more →" buttons
- Reading-time badges on the index
- Animated gradient blobs, glassmorphism, or anything that reads as a Tailwind UI template
- A second accent colour
- More than three heading levels on one page

---

## 2. Colour tokens - palette "cream"

Defined once as CSS custom properties. **Every colour in the codebase is a token reference.** Never write a hex value in a component.

```css
:root {
  --bg:      #FDFBF7;   /* warm paper, not white */
  --surface: #F5F1E8;
  --text:    #14120F;
  --mute:    #6E665A;
  --border:  #E6DFD1;
  --accent:  #A8480B;   /* links, focus rings, command palette. Used sparingly. */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:      #0F0E0C;
    --surface: #1A1815;
    --text:    #EDE8DF;
    --mute:    #948B7C;
    --border:  #2A2621;
    --accent:  #E3944A;
  }
}

:root[data-theme="dark"] { /* same dark values, so an explicit toggle wins */ }
:root[data-theme="light"] { /* same light values */ }
```

The `:not([data-theme="light"])` guard on the media query is required. Without it, an explicit light choice loses to a dark OS preference.

Two neutrals plus one accent. No secondary accent. No semantic colour scale beyond what syntax highlighting needs. Status colours (success/warning/error) only where content genuinely has that meaning, always paired with a non-colour cue.

`site.config.ts` exposes `theme.palette` as a named preset. Other presets exist (`paper`, `slate`, `terminal`) for people running their own deployment. Adding a preset means adding a full light and dark token set, not overriding three values.

---

## 3. Typography - pairing "docs"

| Role | Face | Size | Weight |
| --- | --- | --- | --- |
| Article body | Inter | 17px / 1.68 | 400 |
| Headings | Inter Tight | 32 / 24 / 21px | 600, tight tracking |
| UI, meta, dates | Inter | 14px | 450 |
| Code | JetBrains Mono | 14px | 400 |

Body is 17px rather than 19px because Inter runs optically larger than a serif at the same size. Do not raise it back.

Give every face a real fallback stack. Never leave text on the browser serif default.

---

## 4. Layout

- **One column, centred, no sidebar.** Measure capped at **40rem (640px)**. `ch` is the width of "0", not the average glyph - at 17px Inter, 68ch rendered as ~86 characters/line, well past what the measured reference sites (paco.me, rauno.me, overreacted.io, et al.) cluster at.
- Code blocks, tables, and diagrams may break out to 76ch, each in its own `overflow-x: auto` container.
- 8px spacing base. Paragraph spacing is about 1x line-height (~1em) - the reference sites' field median is 18-28px; 1.5x line-height measured at 43px, well past that.
- One breakpoint at 720px collapsing multi-column layouts to a single column.
- Side gutter of at least 16px at every width. The page body must never scroll horizontally.

---

## 5. Component rules

| Component | Rule |
| --- | --- |
| Header | Static (not fixed) 64px rail: wordmark left, linking home; search (⌘K) and theme toggle right. Same left edge as the article/homepage column below it. |
| Footer | Archive / Tags / RSS / GitHub, same on every page - homepage, archive, tags, and articles |
| Headings | Anchor link (`#`) appears on hover, in the left margin |
| Code blocks | Shiki, themed from the site's own CSS variables so highlighting flips with the theme. Never a stock Dracula. Copy button on hover. |
| Footnotes | Margin sidenotes above 1100px, inline below |
| Table of contents | Only if the article exceeds 6 headings, and then a thin sticky rail, never a boxed card |
| Images | 1px border in light mode, slight desaturation in dark so light-background screenshots do not glare |
| Links | Accent coloured, underline at 35% accent that goes solid on hover |
| Focus rings | Always visible, accent coloured, never removed |
| Theme toggle | A sun/moon **icon button**, no text label, with an accessible name and `title` |

### Theme toggle implementation

A tiny inline script in `<head>`, **before first paint**, applies the stored choice. This is the only render-blocking JavaScript on the site and it exists solely to prevent a white flash on a dark-theme load. Do not move it, defer it, or bundle it.

Default follows `prefers-color-scheme`. An explicit choice persists to `localStorage` and wins from then on. Listen for OS theme changes so a system flip is picked up while the page is open.

---

## 6. Performance and accessibility budget

Enforced by Lighthouse CI. **A build that regresses this fails.**

| Metric | Budget |
| --- | --- |
| LCP, simulated 4G | < 1.0s |
| CLS | 0 |
| Total JS per page | < 20KB gzipped |
| Lighthouse performance | >= 98 |
| Lighthouse accessibility | >= 98 |
| Lighthouse SEO | 100 |

Plus: WCAG AA contrast minimum on both themes, and `prefers-reduced-motion` disables view transitions.

Implementation notes (`lighthouserc.cjs`, `playwright.config.ts`, issue #29):

- Lighthouse runs against the built static output (`staticDistDir`), not yet a live Vercel preview deployment - CI has no deploy-time access to one until the content-repo template work in issue #31 lands. "CLS 0" is asserted at `<= 0.01`: Lighthouse measures real sub-pixel movement from webfont loading even on a well-built static page, so a literal 0 would fail on measurement noise rather than a regression.
- The "both themes" contrast check runs as a Playwright + axe-core pass (`visual/homepage-and-article.spec.ts`), not a second Lighthouse run - Lighthouse can't toggle `data-theme` between runs on its own. It also carries the homepage/article screenshot diffs.

---

## 7. Content style - frontmatter

See [`content-schema.md`](content-schema.md) for the full contract. The style rules on top of it:

- **`title`** - sentence case, no trailing punctuation, specific over clever. "Running Kubernetes on a Beelink cluster", not "My homelab journey".
- **`summary`** - one sentence, present tense, says what the reader gets. Never "In this post we will..." or "A deep dive into...".
- **`type`** - pick honestly. A three-paragraph observation is a `note`, not a `post`. A reference you will keep editing is a `doc`.
- **`tags`** - **reuse before inventing.** Check the existing tag list first. This is what stops `k8s` appearing alongside `kubernetes`. CI flags any tag used only once.

---

## 8. Content style - prose

- Sentence case in headings. At most three heading levels.
- Lead with the conclusion. The reader decides in two sentences whether to continue.
- Code blocks always language-tagged.
- Links in prose, never a "Links" section at the bottom.
- Use a plain dash `-`, never an em dash.
- First person is fine. Marketing voice is not.
- No "In conclusion", no "Let's dive in", no rhetorical questions as section openers.

---

## 9. Worked examples

Examples move an agent's output far more than rules do. Match these.

### A good short note

```markdown
---
title: "systemd timers beat cron for this"
type: til
tags: [linux, homelab]
summary: "A timer that misses its window because the machine was asleep will still run; a cron job silently will not."
---

Cron assumes the machine is awake. If a nightly backup is scheduled for 03:00 and the
box is suspended, the job is simply skipped - no error, no retry, no record.

`systemd` timers have `Persistent=true`:

```ini
[Timer]
OnCalendar=daily
Persistent=true
```

On the next boot, a missed activation fires immediately. For anything running on
hardware that sleeps, that single line is the whole argument.
```

### A good post opening

```markdown
---
title: "Running Kubernetes on a Beelink cluster"
type: post
tags: [homelab, kubernetes]
summary: "Three mini PCs, one control plane, and the disk-speed problem that cost me a weekend."
---

The first thing nobody tells you about a control plane on consumer hardware is that
etcd punishes a slow disk long before the CPU becomes the problem. I spent a weekend
tuning kubelet before checking `fsync` latency, which is where the answer was.

## The hardware
```

Note what both do: the summary states the payoff, the first sentence is the conclusion, and there is no throat-clearing.

---

## 10. HTML artifacts

When generating a standalone HTML file that will be published as a `page`:

- Use the tokens in §2 and the type scale in §3, so it matches the site.
- Support both themes using the exact mechanism in §2. Never define a colour only inside a media query.
- It must render correctly opened directly from disk, with no server.
- Responsive to 400px width.
- Inline the CSS. External resources may not be available.
