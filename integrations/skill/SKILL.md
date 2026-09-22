---
name: publish
description: Publish the current markdown or HTML document to the configured publishd endpoint. Use when the user says "publish this", "ship this post", "put this online", or asks to share a write-up as a URL.
---

# publish

Publishes a document through `publishd`. This file is plain markdown with no
Claude-specific syntax, so it works with **any** coding agent that can read
instructions and run a shell command - Claude Code is one example, not a
requirement.

## Installing this skill

For Claude Code specifically: copy this file to `~/.claude/skills/publish/SKILL.md`
(available in every project) or `<your-project>/.claude/skills/publish/SKILL.md`
(that project only), then invoke it as `/publish` or let Claude pick it up
automatically when you ask to publish something.

For any other agent: point it at this file - as a system prompt, a pasted
instruction, or however that agent's tooling loads reusable instructions - and
it can follow the same steps.

You do not need a checkout of this repository for any of that: this file, and
everything it links to, resolves from its public GitHub URLs. See "Before you
write or edit any content file" below for the one link this skill depends on.

## Before you write or edit any content file

Read [`docs/design.md`](https://raw.githubusercontent.com/seemantshekhar43/publishd/main/docs/design.md), sections 7 to 10. It is the content style contract: how to write a `title` and `summary`, when each `type` applies, and the rule that tags are reused before they are invented. That link is the raw file on GitHub, so it resolves for an agent that is not working inside a checkout of this repository - which is the common case, since you are usually publishing from wherever the content actually lives (an Obsidian vault, a separate project, anywhere).

## Steps

1. **Identify the target file.** If it is ambiguous, ask. Do not guess between two open files.

2. **Check the frontmatter.** Only `title` is required, but a good publish has more. Propose `type`, `tags`, and a one-line `summary` based on the content, and **confirm with the user before adding them**. Reuse an existing tag rather than coining a new one.

3. **Publish as a draft.**

   ```bash
   npx -y publishd <file> --status draft
   ```

   Use `--kind page` instead if the file is self-contained HTML.

4. **Report the preview URL** back to the user.

5. **Publish for real only on explicit confirmation**, as a separate turn:

   ```bash
   npx -y publishd <file> --status published
   ```

## Rules

- **Draft-first, always.** Never run `--status published` in the same turn that created the draft. Making something public is the user's decision, taken with the preview in front of them.
- **Use `--dry-run` when unsure.** It prints the resolved frontmatter and, if the file embeds any images, the asset(s) it would upload - without sending anything.
- If validation fails, the error names the field and the expected shape. Fix the file, do not work around the schema.
- Never pass a token on the command line. The CLI reads `~/.config/publishd/config.toml`, or `PUBLISHD_TOKEN` from the environment.

## Configuration

```bash
npx -y publishd init      # write the config file interactively
npx -y publishd doctor    # check config, token, and endpoint reachability
```

Target a different deployment with `--profile <name>`.
