# Development workflow

Mandatory for every change, human or agent. The steps exist because each one catches a class of problem the next one cannot.

---

## 1. The loop

```
inkloop (plan)  ->  GitHub issue  ->  branch  ->  code  ->  PR
                                                            |
                              merge (closes issue)  <-  no-mistakes gate
```

### Step 1 - Plan in inkloop

Anything non-trivial gets an HTML artifact under `.inkloop/` and at least one review round before code is written.

```bash
npx -y inkloop .inkloop/<topic>.html     # start or resume a session
npx -y inkloop poll .inkloop/<topic>.html --agent-reply "<what changed>"
npx -y inkloop end .inkloop/<topic>.html
```

This is how we decide **what to do next**. `.inkloop/` is gitignored: the artifact is scratch, and its outcome lands in an issue and in `docs/`. If a planning round changes a decision, update `docs/PRD.md` in the same PR that implements it.

Skip this step for genuinely mechanical work - a dependency bump, a typo fix. Do not skip it for anything with a design decision inside.

### Step 2 - Open an issue

Every change has one. Use `gh-axi`:

```bash
npx -y gh-axi issue create --title "..." --body-file /tmp/body.md \
  --label area:cli --label type:feat --milestone M1
```

An issue states **what to achieve and how we will know it is done**, not how to implement it. See §4 for the template.

### Step 3 - Branch

Short-lived, branched from `main`, one issue per branch:

```
<type>/<issue-number>-<short-slug>
feat/12-ingest-endpoint
fix/34-slug-collision
docs/41-architecture-diagram
```

### Step 4 - Code

Follow the docs. Before you start, read the one that matches the area:

- Ingest, build, repo boundaries, auth -> [`architecture.md`](architecture.md)
- Frontmatter, slugs, normalisation -> [`content-schema.md`](content-schema.md)
- Any UI, or any content file -> [`design.md`](design.md)
- Why a decision is what it is -> [`PRD.md`](PRD.md)

### Step 5 - Open a PR

The body must contain `Closes #<n>` so the merge closes the issue automatically.

```bash
npx -y gh-axi pr create --title "feat: ingest endpoint" --body-file /tmp/pr.md
```

### Step 6 - The no-mistakes gate

**The only path to `main`.** Run the `no-mistakes` skill on the change. It runs review, tests, lint, docs checks, push, PR, and CI in one pipeline.

A PR is not ready for merge until the gate passes. Do not merge around it, and do not ask for an exception because "it is a small change" - small changes are where the gate earns its keep.

### Step 7 - Merge

Squash merge. The issue closes automatically. Delete the branch.

---

## 2. Commit messages

Conventional commits, enforced by commitlint:

```
<type>(<scope>): <subject>

feat(cli): add --dry-run flag
fix(schema): reject reserved slugs before sending
docs(architecture): document the ingest failure modes
chore(deps): bump astro to 5.2
```

Types and scopes are enforced by commitlint; `commitlint.config.js` owns the exact lists. Types are the conventional set (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, ...) plus `no-mistakes`. Scopes are the `area:` labels from §5, plus a doc name, plus the no-mistakes pipeline step names.

`no-mistakes(<step>): ...` is reserved for the gate committing its own fix rounds. Do not write one by hand.

Rules:

- Imperative mood. "add", not "added" or "adds".
- No trailing period.
- **Never add an agent name or co-author trailer.**
- Use a plain dash `-`, never an em dash.

---

## 3. Definition of done

A change is done when **all** of these hold. Not most.

- [ ] The issue's acceptance criteria are met, each one demonstrably
- [ ] Unit tests cover the new logic, especially schema and normaliser behaviour
- [ ] `lint`, `typecheck`, `test`, and `build` all pass locally
- [ ] Docs updated in the same PR if behaviour changed - a doc that contradicts the code is a bug
- [ ] No secret, token, or personal identifier added anywhere
- [ ] No hardcoded `shekse.com`, personal name, or repo path in application code - CI greps `apps/` and `packages/` for these and fails the build
- [ ] If a slug or route changed, `redirects.json` was updated
- [ ] The no-mistakes gate passed
- [ ] UI work: verified in a real browser in **both themes**, at desktop and 400px width

The last one is not optional for UI. Screenshots in the PR.

---

## 4. Issue template

```markdown
## Goal
One or two sentences. What this achieves, in terms of behaviour the author would notice.

## Context
Why now, what it depends on, which doc section governs it. Link the doc.

## Scope
- Bullet list of what changes
- Be specific about files and packages where known

## Out of scope
- What this deliberately does not do, so the PR does not sprawl

## Acceptance criteria
- [ ] Observable, checkable statements
- [ ] Each one is something a reviewer can verify without reading the diff

## Notes
Gotchas, links, prior decisions from the PRD decision log.
```

---

## 5. Labels

| Prefix | Values |
| --- | --- |
| `area:` | `cli`, `web`, `ingest`, `schema`, `skill`, `content`, `infra`, `docs` |
| `type:` | `feat`, `fix`, `chore`, `docs`, `test`, `refactor` |
| `priority:` | `p0` (blocks the milestone), `p1` (should), `p2` (nice) |
| standalone | `blocked`, `good first issue`, `security` |

Every issue gets one `area:`, one `type:`, and one `priority:`.

---

## 6. Branch protection on `main`

- No direct pushes. PR only.
- CI must pass.
- Secret scanning and push protection **enabled, and never bypassed**.
- Linear history. Squash merge only.

---

## 7. Local setup

Node `>=22` (see `.nvmrc`) and pnpm, pinned by `packageManager` in the root `package.json`. Also install `gitleaks` (`brew install gitleaks`), since the pre-commit hook refuses to run without it.

```bash
pnpm install
pnpm test
pnpm lint         # eslint with zero warnings tolerated, then prettier --check
pnpm lint:fix
pnpm typecheck
pnpm build
pnpm dev          # runs the Astro dev server for apps/web
```

`packages/schema`, `apps/web` (the Astro site and `/api/ingest`), and `apps/cli` (the `publishd` binary) are all implemented. `pnpm dev` runs whichever packages have declared a `dev` script - currently `apps/web`.

Publishing against a local instance uses the `local` profile in `~/.config/publishd/config.toml`, so the full loop is testable without touching production.

---

## 8. Security practices

The repository is **public from the first commit**. This is not a normal private-then-public project.

1. **Secret scanning and push protection are enabled before the first push.** A token pushed to a public repo is burned the moment it lands, and rewriting history does not un-burn it. If push protection blocks you, rotate the secret - do not bypass the block.
2. **`gitleaks` runs in pre-commit and in CI.** Do not skip hooks with `--no-verify`.
3. **Secrets live in 1Password**, referenced from config by `op://` URI. The CLI never echoes a token.
4. **Never commit content.** Drafts live in the private content repo. This repo is public.
5. **Report a suspected leak immediately** by rotating the token first and asking questions second.

---

## 9. Tooling reference

| Task | Command |
| --- | --- |
| GitHub dashboard for this repo | `npx -y gh-axi` |
| Create an issue | `npx -y gh-axi issue create --title "..." --body-file <path>` |
| List open issues | `npx -y gh-axi issue list` |
| Create a PR | `npx -y gh-axi pr create --title "..." --body-file <path>` |
| Check CI on a PR | `npx -y gh-axi pr checks <n>` |
| Debug a failing run | `npx -y gh-axi run view <id> --log-failed` |
| Start a planning artifact | `npx -y inkloop .inkloop/<topic>.html` |
| Verify UI in a real browser | `npx -y chrome-devtools-axi open <url>` |
| Validate before merge | the `no-mistakes` skill |

Use `--body-file` for anything multi-line. Do not try to pass markdown through `--body`.
