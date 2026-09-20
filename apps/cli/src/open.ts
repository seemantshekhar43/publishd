/** Opens a URL in the default browser, for `--open`. */

import { spawn } from 'node:child_process';

export function openUrl(url: string): void {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
}
