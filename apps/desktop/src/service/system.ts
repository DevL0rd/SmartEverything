import { execFile } from 'node:child_process';
import { watch } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kill } from 'node:process';

export interface CommandResult {
  readonly stdout: string;
}

export type RunCommand = (file: string, args: readonly string[]) => Promise<CommandResult>;

export interface ServiceFiles {
  readonly read: (file: string) => Promise<string | null>;
  readonly write: (file: string, text: string, mode: number) => Promise<void>;
  readonly remove: (file: string) => Promise<void>;
}

export interface WatchHandlers {
  readonly changed: (name: string) => void;
  readonly failed: (cause: unknown) => void;
}

type WatchDirectory = (directory: string, handlers: WatchHandlers) => () => void;

export interface ServiceSystem {
  readonly run: RunCommand;
  readonly files: ServiceFiles;
  readonly isAlive: (processId: number) => boolean;
  readonly watch: WatchDirectory;
  readonly fetch: typeof fetch;
}

export class CommandFailedError extends Error {
  readonly command: string;
  readonly exitCode: number | null;
  readonly output: string;

  constructor(command: string, exitCode: number | null, failure: string, output: string) {
    super(`${command} must succeed; it ${failure}${output === '' ? '' : `: ${output}`}`);
    this.name = 'CommandFailedError';
    this.command = command;
    this.exitCode = exitCode;
    this.output = output;
  }
}

const COMMAND_TIMEOUT_MS = 60_000;

const APPROVAL_TIMEOUT_MS = 600_000;

function exitCodeOf(error: Error): number | null {
  return 'code' in error && typeof error.code === 'number' ? error.code : null;
}

function failureOf(error: Error): string {
  const code = exitCodeOf(error);
  return code === null ? `failed with ${error.message}` : `exited with code ${String(code)}`;
}

const commandRunner =
  (timeout: number): RunCommand =>
  (file, args) =>
    new Promise((resolve, reject) => {
      execFile(
        file,
        [...args],
        { timeout, windowsHide: true, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error !== null) {
            const output = `${stderr}${stdout}`.trim().slice(-600);
            reject(
              new CommandFailedError(
                [file, ...args].join(' '),
                exitCodeOf(error),
                failureOf(error),
                output,
              ),
            );
            return;
          }
          resolve({ stdout });
        },
      );
    });

const runCommand = commandRunner(COMMAND_TIMEOUT_MS);

export const runAwaitingApproval = commandRunner(APPROVAL_TIMEOUT_MS);

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

const nodeFiles: ServiceFiles = {
  read: async (file) => {
    try {
      return await readFile(file, 'utf8');
    } catch (error: unknown) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  },
  write: async (file, text, mode) => {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, text, { mode });
  },
  remove: (file) => rm(file, { force: true }),
};

function isProcessAlive(processId: number): boolean {
  try {
    kill(processId, 0);
    return true;
  } catch (error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

const watchDirectory: WatchDirectory = (directory, handlers) => {
  const watcher = watch(directory, (_event, name) => {
    if (name !== null) {
      handlers.changed(name);
    }
  });
  watcher.on('error', handlers.failed);
  return () => {
    watcher.close();
  };
};

export const nodeSystem: ServiceSystem = {
  run: runCommand,
  files: nodeFiles,
  isAlive: isProcessAlive,
  watch: watchDirectory,
  fetch: (input, init) => fetch(input, init),
};
