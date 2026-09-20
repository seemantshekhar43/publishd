#!/usr/bin/env node
/**
 * The publishd CLI.
 *
 * Publishing is the default action, so `publishd note.md` is the whole command.
 * Full surface in docs/PRD.md section 8.4.
 *
 * Scaffold only. The real CLI lands with issue #7.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CLI_NAME = 'publishd';

/** Placeholder entry point so the package is wired end to end. */
export function main(argv: readonly string[] = []): number {
  if (argv.includes('--version')) {
    process.stdout.write('0.0.0\n');
    return 0;
  }
  process.stderr.write(`${CLI_NAME}: not implemented yet - see issue #7\n`);
  return 1;
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
  process.exitCode = main(process.argv.slice(2));
}
