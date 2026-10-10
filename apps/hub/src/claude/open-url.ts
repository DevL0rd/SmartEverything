import { execFile } from 'node:child_process';
import { ClaudeControlFailedError } from './errors';

const OPEN_TIMEOUT_MS = 15_000;

const OPENER = 'xdg-open';

export function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(OPENER, [url], { timeout: OPEN_TIMEOUT_MS }, (error) => {
      if (error === null) {
        resolve();
      } else {
        reject(new ClaudeControlFailedError('open', OPENER, error.message));
      }
    });
  });
}
