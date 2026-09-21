# Obsidian integration

Publish the current note with a hotkey, no custom plugin required. This is v1 of the
Obsidian integration - see [`docs/PRD.md`](../../docs/PRD.md) section 8.3. A real plugin
(status bar indicator, command palette modal, `shekse-url` written back to frontmatter) is
v2, deferred to M5 so it can be designed after a few months of actually using this.

## Setup

1. Install the community plugin **[Shell commands](https://github.com/Taitava/obsidian-shellcommands)** (Settings → Community plugins → Browse).
2. Settings → Shell commands → **New shell command**, and enter:

   ```bash
   npx -y publishd "{{file_path:absolute}}" --status draft
   ```

   `{{file_path:absolute}}` is filled in by the plugin at run time with the absolute path of
   the note you're currently editing.

3. Under that shell command's own settings, open **Events** and bind a hotkey (for
   example `⌘⇧P` on macOS, or whatever isn't already taken in your vault). You can also
   trigger it from the command palette without a hotkey.
4. Make sure `publishd` can find your endpoint and token - run `publishd init` once from a
   terminal to write `~/.config/publishd/config.toml` (see the root [README](../../README.md)).
   The Shell commands plugin runs in your normal shell environment, so anything `publishd`
   can already do from a terminal, it can do here too.

## What happens when you run it

- The current note publishes as a **draft** - never published outright from a single
  hotkey press. Confirming that a draft looks right, then publishing it for real, is a
  deliberate second step (`publishd <file> --status published`, or edit the frontmatter's
  `status` and run the shell command again).
- Any `![[embed]]` image in the note is read off disk, resolved against the vault root, and
  uploaded alongside the note in the same commit - see
  [`docs/content-schema.md`](../../docs/content-schema.md) section 6.
- The CLI prints the draft's `/preview/<uuid>` URL to the Shell commands plugin's output
  panel once the build goes live.

## Embedded images

Path resolution walks up from the note looking for a `.obsidian/` directory and treats its
parent as the vault root; a `![[...]]` embed is then read relative to *that* root - not
relative to the note. If a note references `![[topology.png]]` but the file actually lives
at `attachments/topology.png`, use the vault-relative path in the embed
(`![[attachments/topology.png]]`), matching what Obsidian itself writes when its "New link
format" setting is "Relative path to file" rather than "Shortest path". A missing file is
never a broken publish - it's left as plain text in the body with a warning printed to the
Shell commands output panel.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Shell command output says `command not found: npx` or `node` | Obsidian (and the Shell commands plugin) don't inherit your shell's `PATH` on macOS by default | In Shell commands plugin settings, set an explicit shell (Settings → Shell commands → General → "Shell") to one that sources your profile, e.g. `/bin/zsh -l -c`, or hardcode the full path to `node`/`npx` in the command |
| `no profile "default" in ~/.config/publishd/config.toml` | `publishd init` hasn't been run yet, or was run as a different user than Obsidian runs as | Run `publishd init` from the same terminal/user Obsidian's shell commands execute as, then `publishd doctor` to confirm |
| A warning about "no `.obsidian/` vault root found" | The note lives outside any Obsidian vault, or `.obsidian/` was excluded from sync | Publish from a file inside the vault; embeds fall back to resolving relative to the note itself, but that's rarely what you want for a shared `attachments/` folder |
| The shell command runs but nothing appears to happen | The plugin is running the command but not showing its output | Enable "Display in floating popup" or "Display in status bar" for that shell command's output settings, or open the plugin's log |
