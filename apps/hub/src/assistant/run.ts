import { execFile } from 'node:child_process';

export interface RunOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type Runner = (
  file: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<RunResult>;

export class ProgramError extends Error {
  override readonly name = 'ProgramError';

  constructor(
    readonly program: string,
    readonly detail: string,
  ) {
    super(`${program} failed: ${detail}`);
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? '';
}

export const runFile: Runner = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new ProgramError(file, lastLine(stderr) || error.message));
      },
    );
  });
