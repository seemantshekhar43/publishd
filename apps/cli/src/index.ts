#!/usr/bin/env node
/**
 * The publishd CLI.
 *
 * Publishing is the default action, so `publishd note.md` is the whole
 * command. Full surface in docs/PRD.md section 8.4.
 */

import { realpathSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain, type CommandDef } from 'citty';
import consola from 'consola';
import type { AssetFs } from './assets.js';
import {
  defaultConfigPath,
  loadConfig,
  resolveProfile,
  type ResolvedProfile,
} from './config.js';
import { runDoctor } from './doctor.js';
import { runInit } from './init.js';
import { runList } from './list.js';
import { openUrl } from './open.js';
import { pollUntilLive } from './poll.js';
import { runPublish } from './publish.js';
import { runUnpublish } from './unpublish.js';

const nodeAssetFs: AssetFs = {
  readBytes: (path) => readFile(path),
  exists: (path) =>
    stat(path)
      .then(() => true)
      .catch(() => false),
};

export const CLI_NAME = 'publishd';
export const CLI_VERSION = '0.0.0';

export const command = defineCommand({
  meta: {
    name: CLI_NAME,
    version: CLI_VERSION,
    description:
      'Publish a markdown file to the web in under 10 seconds, from anywhere. Also: list, unpublish, doctor, init - run `publishd <command> --help`.',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Markdown file to publish, or - to read from stdin',
      required: true,
    },
    status: { type: 'string', description: 'draft or published' },
    profile: {
      type: 'string',
      description: 'Named profile from ~/.config/publishd/config.toml',
    },
    kind: {
      type: 'string',
      description: 'article (only supported kind for now)',
      default: 'article',
    },
    tags: { type: 'string', description: 'Comma-separated tags, overrides frontmatter' },
    type: { type: 'string', description: 'post, note, til, or doc' },
    'dry-run': {
      type: 'boolean',
      description: 'Print resolved frontmatter and the diff, send nothing',
      default: false,
    },
    open: {
      type: 'boolean',
      description: 'Open the URL when the build goes live',
      default: false,
    },
  },
  async run({ args }) {
    const config = await loadConfig();

    // A profile is required to actually publish, but --dry-run validates
    // and prints locally without one - see issue #7 acceptance criteria.
    let endpoint = '<no profile configured>';
    let token = '';
    try {
      ({ endpoint, token } = resolveProfile(config, args.profile, process.env));
    } catch (error) {
      if (!args['dry-run']) {
        throw error;
      }
    }

    const exitCode = await runPublish(
      {
        filePath: args.file,
        status: args.status,
        profile: args.profile,
        kind: args.kind,
        tags: args.tags,
        type: args.type,
        dryRun: args['dry-run'],
        open: args.open,
      },
      {
        readStdin: readStdinToString,
        readFileContent: (path) => readFile(path, 'utf-8'),
        fetchImpl: fetch,
        endpoint,
        token,
        protectionBypass: process.env.PUBLISHD_PROTECTION_BYPASS,
        log: consola,
        pollUntilLive,
        openUrl,
        assetFs: nodeAssetFs,
      },
    );

    process.exitCode = exitCode;
  },
});

async function resolveProfileOrExit(
  profileName: string | undefined,
): Promise<ResolvedProfile | undefined> {
  const config = await loadConfig();
  try {
    return resolveProfile(config, profileName, process.env);
  } catch (error) {
    consola.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return undefined;
  }
}

export const listCommand = defineCommand({
  meta: { name: 'list', description: 'List published and draft content' },
  args: {
    status: { type: 'string', description: 'Filter to draft, published, or archived' },
    profile: { type: 'string', description: 'Named profile from the config file' },
  },
  async run({ args }) {
    const profile = await resolveProfileOrExit(args.profile);
    if (!profile) return;
    process.exitCode = await runList(
      { status: args.status },
      {
        ...profile,
        fetchImpl: fetch,
        protectionBypass: process.env.PUBLISHD_PROTECTION_BYPASS,
        log: consola,
      },
    );
  },
});

export const unpublishCommand = defineCommand({
  meta: { name: 'unpublish', description: 'Set a published article to archived' },
  args: {
    slug: {
      type: 'positional',
      description: 'Slug of the article to unpublish',
      required: true,
    },
    profile: { type: 'string', description: 'Named profile from the config file' },
  },
  async run({ args }) {
    const profile = await resolveProfileOrExit(args.profile);
    if (!profile) return;
    process.exitCode = await runUnpublish(args.slug, {
      ...profile,
      fetchImpl: fetch,
      protectionBypass: process.env.PUBLISHD_PROTECTION_BYPASS,
      log: consola,
    });
  },
});

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check config, token validity, and endpoint reachability',
  },
  args: {
    profile: { type: 'string', description: 'Named profile from the config file' },
  },
  async run({ args }) {
    const config = await loadConfig();
    let profile: DoctorProfile;
    try {
      profile = resolveProfile(config, args.profile, process.env);
    } catch (error) {
      profile = { error: error instanceof Error ? error.message : String(error) };
    }
    process.exitCode = await runDoctor({
      profile,
      fetchImpl: fetch,
      protectionBypass: process.env.PUBLISHD_PROTECTION_BYPASS,
      log: consola,
    });
  },
});

/**
 * Queues `readline`'s `line` events instead of calling its `.question()`
 * once per prompt: `.question()` only attaches its listener right before
 * asking, so with piped (non-TTY) stdin - a scripted `init`, or `init`
 * under test - lines that arrive before a later question is asked are
 * simply lost, and that question then hangs forever. Queuing every line as
 * it arrives, answering from the queue when one is already there and
 * waiting on the next `line` event otherwise, works the same way for a
 * real interactive terminal and for piped input.
 */
export function createPrompt(
  rl: ReturnType<typeof createInterface>,
): (question: string) => Promise<string> {
  const buffered: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  let closed = false;

  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) {
      next(line);
    } else {
      buffered.push(line);
    }
  });
  rl.on('close', () => {
    closed = true;
    for (const next of waiting.splice(0)) next('');
  });

  return async (question) => {
    process.stdout.write(question);
    const bufferedLine = buffered.shift();
    if (bufferedLine !== undefined) {
      return bufferedLine.trim();
    }
    if (closed) {
      return '';
    }
    const line = await new Promise<string>((resolve) => waiting.push(resolve));
    return line.trim();
  };
}

export const initCommand = defineCommand({
  meta: { name: 'init', description: 'Write a profile to the config file interactively' },
  async run() {
    const configPath = defaultConfigPath();
    const existingConfig = await loadConfig(configPath);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.exitCode = await runInit({
        existingConfig,
        configPath,
        prompt: createPrompt(rl),
        writeConfigFile: async (path, content) => {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content, 'utf-8');
        },
        log: consola,
      });
    } finally {
      rl.close();
    }
  },
});

type DoctorProfile = ResolvedProfile | { error: string };

// citty's CommandDef is contravariant in its args, so a map of
// differently-shaped commands needs `any` here; each command's own `args`
// stays fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SUBCOMMANDS: Record<string, CommandDef<any>> = {
  list: listCommand,
  unpublish: unpublishCommand,
  doctor: doctorCommand,
  init: initCommand,
};

async function readStdinToString(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * True when this module is the process entry point.
 *
 * Both sides are resolved through realpath because the bin is reached through
 * a symlink - pnpm's shim, `npm link`, a global install - so `process.argv[1]`
 * is the link while the module URL is the target.
 */
function isEntryPoint(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }
  try {
    return realpathSync(invokedPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

// Only take over the process when invoked as the `publishd` binary, so that
// importing this module stays side-effect free.
if (isEntryPoint(import.meta.url)) {
  // citty's own `subCommands` requires every first positional to name a
  // subcommand - it has no way to fall through to a default action, which
  // publishing needs to be (`publishd note.md` is the common case, per
  // docs/PRD.md section 8.4). So the four management subcommands are
  // dispatched by hand here instead, on an exact match of the first
  // non-flag argument; anything else - a filename, `-`, or nothing - goes
  // to the publish command exactly as before.
  const rawArgs = process.argv.slice(2);
  const firstPositional = rawArgs.find((arg) => !arg.startsWith('-'));
  const subCommand = firstPositional ? SUBCOMMANDS[firstPositional] : undefined;
  if (subCommand && firstPositional) {
    const index = rawArgs.indexOf(firstPositional);
    await runMain(subCommand, {
      rawArgs: [...rawArgs.slice(0, index), ...rawArgs.slice(index + 1)],
    });
  } else {
    await runMain(command);
  }
}
