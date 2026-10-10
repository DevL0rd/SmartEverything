import { execFile } from 'node:child_process';

const PROGRAM_TIMEOUT_MS = 15_000;

export class ProgramFailedError extends Error {
  override readonly name = 'ProgramFailedError';

  constructor(
    readonly program: string,
    readonly output: string,
  ) {
    super(`${program} failed: ${output}`);
  }
}

export type RunProgram = (file: string, args: readonly string[]) => Promise<string>;

export const runProgram: RunProgram = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: PROGRAM_TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
          return;
        }
        const output = stderr.trim();
        reject(new ProgramFailedError(file, output === '' ? error.message : output));
      },
    );
  });
