---
name: publish
description: Publish the current markdown or HTML document to the configured publishd endpoint. Use when the user says "publish this", "ship this post", "put this online", or asks to share a write-up as a URL.
---

# publish

Publishes a document through `publishd`. Works with any coding agent that can read instructions and run a shell command.

## Before you write or edit any content file

Read `docs/design.md` in the publishd repository, sections 7 to 10. It is the content style contract: how to write a `title` and `summary`, when each `type` applies, and the rule that tags are reused before they are invented.

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
- **Use `--dry-run` when unsure.** It prints the resolved frontmatter and the diff without sending anything.
- If validation fails, the error names the field and the expected shape. Fix the file, do not work around the schema.
- Never pass a token on the command line. The CLI reads `~/.config/publishd/config.toml`, or `PUBLISHD_TOKEN` from the environment.

## Configuration

```bash
npx -y publishd init      # write the config file interactively
npx -y publishd doctor    # check config, token, and endpoint reachability
```

Target a different deployment with `--profile <name>`.
