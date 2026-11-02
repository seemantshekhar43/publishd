/**
 * Thin wrapper around the system `git` binary - no npm git library, since
 * git itself is already a prerequisite for anyone using this repo. Used to
 * keep a local clone of the content repo in sync and push a publish's
 * commit, replacing the GitHub Git Data API calls the old `/api/ingest`
 * endpoint used to make. See docs/architecture.md section 4.
 */

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clones `remote` to `clonePath` if it isn't there yet; otherwise fetches
 * and hard-resets the existing clone to `origin/<branch>`. The hard reset is
 * safe here because this clone is a CLI-managed cache the user never edits
 * by hand - not their own working tree - so there is nothing of theirs to
 * lose.
 */
export async function ensureClone(
  remote: string,
  branch: string,
  clonePath: string,
): Promise<void> {
  if (!(await pathExists(clonePath))) {
    await git(['clone', '--branch', branch, remote, clonePath]);
    return;
  }
  await git(['fetch', 'origin', branch], clonePath);
  await git(['checkout', branch], clonePath);
  await git(['reset', '--hard', `origin/${branch}`], clonePath);
}

/**
 * Stages every change in `clonePath`, commits it, and pushes to its
 * upstream. Returns the resulting commit sha. A republish with
 * byte-identical content leaves nothing staged - `git commit` then exits
 * non-zero with "nothing to commit" - which is treated as success (the
 * current HEAD sha is returned) rather than an error, matching the old
 * ingest endpoint's "unchanged assets are simply left out" posture.
 */
export async function commitAndPush(clonePath: string, message: string): Promise<string> {
  await git(['add', '-A'], clonePath);
  try {
    await git(['commit', '-m', message], clonePath);
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? '';
    if (!/nothing to commit/.test(stdout)) {
      throw error;
    }
  }
  await git(['push', 'origin', 'HEAD'], clonePath);
  return git(['rev-parse', 'HEAD'], clonePath);
}

/** True when `remote` is reachable and accepts the credentials in use - via `git ls-remote`. */
export async function remoteIsReachable(remote: string): Promise<boolean> {
  try {
    await git(['ls-remote', remote]);
    return true;
  } catch {
    return false;
  }
}

/** Empty when the clone has no uncommitted changes - see `publishd doctor`. */
export async function workingTreeStatus(clonePath: string): Promise<string> {
  return git(['status', '--porcelain'], clonePath);
}

/** The branch the clone currently has checked out. */
export async function currentBranch(clonePath: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], clonePath);
}
