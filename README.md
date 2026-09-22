# publishd

Publish a markdown file to the web in under 10 seconds, from anywhere - Obsidian, a coding agent, a terminal, or a phone.

```bash
publishd ./my-note.md
# -> https://publish.shekse.com/my-note
```

Not a CMS. There is no admin UI and no database. Your editor stays whatever it already is; the only contract is markdown plus frontmatter. Content lives as plain files in a git repo you own, so nothing here is a lock-in.

---

> ## 🚧 Status: M1 in progress, not deployed yet
>
> The schema, the site skeleton, the ingest endpoint, and the `publishd` CLI exist and are tested, but there is no live deployment - the private content repo and the Vercel/DNS setup (issues #5 and #9) haven't landed, so `publishd ./my-note.md` doesn't have anywhere to publish to yet.
>
> It is public from the first commit because building in the open keeps the configuration honest - not because it is ready. Follow the [M1 milestone](../../milestones) to see the walking skeleton come together.
>
> Docs describing behavior beyond what is implemented so far are **specifications, not descriptions**.

---

## How it works

```
Obsidian / agent / terminal
        |
        |  POST /api/ingest   (bearer token)
        v
  ingest function  ->  commit to a private content repo  ->  static site build
                                                                     |
                                                                     v
                                                              your published URL
```

A small serverless endpoint validates your markdown and commits it to a git repo. The commit triggers a static site build. That is the whole system.

- **Git is the database.** Version history is free, rollback is `git revert`, and your Obsidian vault can be the repo.
- **Static output.** No server to patch, no container to restart.
- **Markdown in, permanent URLs out.** Republishing the same file updates the same URL.
- **Self-contained HTML pages too**, served verbatim, for things like interactive artifacts and reports.

## HTML pages run on the site's own origin

An HTML `page` (`--kind page`) is stored and served **verbatim** at `/p/<slug>` - the pipeline reads its `<meta name="shekse:*">` tags for metadata and otherwise never touches it. That means a page's own JavaScript runs on `publish.shekse.com`'s origin, same-origin with every other page on the site.

This is safe **only because the site has no cookies, no login, and no authenticated surface to steal from.** There is nothing for a page's script to exfiltrate. **If a deployment ever adds authentication, pages must move to a separate origin first** - a sandboxed `<iframe>` or a dedicated subdomain, not a runtime sanitiser. Sanitising HTML well enough to be a real security boundary is a losing game and would defeat the point of serving an artifact verbatim; the ingest token, not the document's contents, is what's actually trusted here.

## Integrations

| Integration | What it does |
| --- | --- |
| [Obsidian](integrations/obsidian/README.md) | Publish the current note with a hotkey, via the community "Shell commands" plugin - no custom plugin required |
| [Coding agent skill](integrations/skill/SKILL.md) | Draft-first publishing instructions any agent that reads markdown can follow |

## Documentation

| Doc | What is in it |
| --- | --- |
| [Product requirements](docs/PRD.md) | Full scope, every decision and why, the decision log |
| [Architecture](docs/architecture.md) | System design, ingest contract, auth, failure modes |
| [Content schema](docs/content-schema.md) | Frontmatter contract, slugs, Obsidian normalisation |
| [Design](docs/design.md) | Visual system and content style guide |
| [Development](docs/development.md) | Workflow, conventions, security practices |
| [Roadmap](docs/roadmap.md) | Milestones and what is deliberately deferred |

Working on this with a coding agent? Start at [`AGENTS.md`](AGENTS.md).

## Run your own

Not yet possible. The target, once M4 lands: fork the content template, set four environment variables, click deploy, and publish your first post within fifteen minutes - with no code edits. If anything requires editing source to make it yours, that is a bug.

## Licence

MIT. See [LICENSE](LICENSE).
