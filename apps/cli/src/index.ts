/**
 * The publishd CLI.
 *
 * Publishing is the default action, so `publishd note.md` is the whole command.
 * Full surface in docs/PRD.md section 8.4.
 *
 * Scaffold only. The real CLI lands with issue #7.
 */

export const CLI_NAME = 'publishd';

/** Placeholder entry point so the package is wired end to end. */
export function main(argv: readonly string[] = []): number {
  if (argv.includes('--version')) {
    process.stdout.write('0.0.0\n');
    return 0;
  }
  process.stderr.write(
    `${CLI_NAME}: not implemented yet - see issue #7 (https://github.com/seemantshekhar43/publishd/issues/7)\n`,
  );
  return 1;
}
