import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { env } from 'node:process';
import { ClaudeLinkError, ClaudeNotReadyError } from './errors';

export type ClaudeCli = (args: readonly string[]) => Promise<string>;

const TIMEOUT_MS = 120_000;

const MAX_OUTPUT = 4 * 1024 * 1024;

async function findClaude(): Promise<string> {
  const directories = [
    ...(env['PATH'] ?? '').split(delimiter).filter((entry) => entry !== ''),
    join(homedir(), '.local', 'bin'),
  ];
  for (const directory of directories) {
    const candidate = join(directory, 'claude');
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch (cause) {
      if (!(
        cause instanceof Error &&
        'code' in cause &&
        ['ENOENT', 'EACCES', 'ENOTDIR'].includes(String(cause.code))
      )) {
        throw cause;
      }
    }
  }
  throw new ClaudeNotReadyError('link', 'the claude program is not installed or not on the PATH');
}

export const systemClaudeCli: ClaudeCli = async (args) => {
  const program = await findClaude();
  return new Promise((resolve, reject) => {
    execFile(
      program,
      [...args],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
          return;
        }
        const last = stderr.trim().split('\n').at(-1) ?? '';
        reject(
          new ClaudeLinkError(
            `claude ${args.slice(0, 2).join(' ')}`,
            last === '' ? error.message : last,
          ),
        );
      },
    );
  });
};
