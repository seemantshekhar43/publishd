#!/usr/bin/env node
/**
 * The publishd CLI.
 *
 * Publishing is the default action, so `publishd note.md` is the whole
 * command. Full surface in docs/PRD.md section 8.4.
 */

import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain } from 'citty';
import consola from 'consola';
import type { AssetFs } from './assets.js';
import { loadConfig, resolveProfile } from './config.js';
import { openUrl } from './open.js';
import { pollUntilLive } from './poll.js';
import { runPublish } from './publish.js';

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
    description: 'Publish a markdown file to the web in under 10 seconds, from anywhere.',
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
  await runMain(command);
}
