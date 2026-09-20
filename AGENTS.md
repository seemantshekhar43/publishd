# AGENTS.md

Entry point for any coding agent working on this repository. Read this file first, then the specific doc your task touches.

---

## What we are building

`publishd` is a publishing pipeline: a markdown file becomes a public URL in under 10 seconds, from any client - Obsidian, a coding agent, a terminal, or a phone.

It is **not a CMS**. There is no admin UI and no database. The authoring tool stays whatever the author already uses; the only contract is markdown plus frontmatter. The reference deployment is `publish.shekse.com`, but nothing in the codebase may hardcode it.

The one-line test the whole project is judged against:

```bash
publishd ./my-note.md
# -> https://publish.shekse.com/my-note
```

---

## Current status

**Pre-M1. No application code exists yet.** This repository currently contains documentation, the license, and the agent skill. The first code lands via the issues on the M1 milestone.

Do not assume any file, package, script, or command described in the docs exists yet. Check before you reference it. Where a doc describes something not yet built, it is a specification, not a description.

---

## Documentation map

Read the one that matches your task. Do not read all of them by default.

| Doc                                                | Read it when                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`docs/PRD.md`](docs/PRD.md)                       | You need the _why_ behind a decision, or the full product scope. Contains the decision log.       |
| [`docs/architecture.md`](docs/architecture.md)     | You are touching the ingest endpoint, the build pipeline, repo boundaries, or auth.               |
| [`docs/content-schema.md`](docs/content-schema.md) | You are touching frontmatter, validation, slugs, or Obsidian normalisation. The precise contract. |
| [`docs/design.md`](docs/design.md)                 | You are writing UI, CSS, an HTML artifact, or _any_ content file. Also the content style guide.   |
| [`docs/development.md`](docs/development.md)       | You are about to open an issue, branch, PR, or merge. The workflow is mandatory.                  |
| [`docs/roadmap.md`](docs/roadmap.md)               | You need to know what milestone something belongs to, or what is deliberately deferred.           |

`docs/PRD.md` is the source of truth for product decisions. If another doc contradicts it, the PRD wins and the other doc is a bug - fix it in the same PR.

---

## The development loop

Every change follows this path. No step is optional.

```
inkloop (plan)  ->  GitHub issue  ->  branch  ->  code  ->  PR
                                                            |
                              merge (closes issue)  <-  no-mistakes gate
```

1. **Plan in inkloop.** Anything non-trivial gets an HTML artifact under `.inkloop/` and a review round before code. This is how we decide what to do next. `.inkloop/` is gitignored - the artifact is scratch, its _outcome_ lands in an issue and in `docs/`.
2. **Open an issue** with `gh-axi`. Every change has one. The issue states what to achieve and how we will know it is done.
3. **Branch** from `main`. Short-lived, one issue per branch.
4. **Code**, following the docs above.
5. **Open a PR** with `Closes #<n>` in the body.
6. **Run the `no-mistakes` gate** before the PR is considered ready. It is the only path to merge.
7. **Merge**, which closes the issue.

See [`docs/development.md`](docs/development.md) for the full detail, including commit conventions and the definition of done.

---

## Tooling

Use these rather than generic alternatives.

| Task                                                             | Tool                         |
| ---------------------------------------------------------------- | ---------------------------- |
| Anything on GitHub - issues, PRs, CI runs, labels, releases, API | `npx -y gh-axi <command>`    |
| Planning, brainstorming, anything better reviewed visually       | `npx -y inkloop <file.html>` |
| Validating changes before they reach `main`                      | the `no-mistakes` skill      |
| Driving a real browser to verify UI                              | `npx -y chrome-devtools-axi` |

---

## Hard rules

These are non-negotiable. Violating one is a defect regardless of whether tests pass.

1. **Never commit a secret.** The repository is public from the first commit. A token pushed here is burned immediately and rewriting history does not un-burn it. Secret scanning and `gitleaks` run in pre-commit and CI; do not disable or bypass them.
2. **Never hardcode identity.** No `shekse.com`, no personal name, no repo path anywhere in application code. It all lives in `site.config.ts`. Anything requiring a source edit to make the project someone else's is a bug.
3. **The schema is the single source of truth.** `packages/schema` defines frontmatter once. The CLI, the ingest endpoint, and the site build all import it. Never re-declare a field shape in a second place.
4. **Publishing is draft-first from an agent.** An agent may publish with `--status draft`. Publishing with `--status published` requires an explicit, separate confirmation turn from the author. Never combine them.
5. **The content repo is separate and private.** Never commit content, drafts, or assets into this repository. It is public.
6. **A `page` (HTML) is served verbatim, never sanitised.** If you find yourself writing an HTML sanitiser, stop and re-read `docs/architecture.md` - the ingest token is the trust boundary, not the parser.
7. **URLs are permanent.** A slug change requires a `redirects.json` entry in the same change. CI enforces this.

---

## Writing style

Applies to docs, commit messages, PR descriptions, and any content this project generates.

- Use a plain dash `-`, never an em dash.
- Sentence case in headings.
- State what changed and why. Skip preamble.
- No agent name or co-author trailer in commit messages.
- Do not edit `CHANGELOG.md` or any file marked auto-generated by hand.
