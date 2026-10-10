import { execFile } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';

interface ProgramResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

type RunProgram = (file: string, args: readonly string[]) => Promise<ProgramResult | null>;

type ReadText = (path: string) => Promise<string | null>;

type WatchPath = (path: string, changed: () => void) => (() => void) | null;

export type FirewallPlatform = 'linux' | 'darwin' | 'win32';

export interface FirewallSystem {
  readonly platform: FirewallPlatform;
  readonly go2rtcBinary: string;
  readonly appBinary: string;
  readonly run: RunProgram;
  readonly read: ReadText;
  readonly watch: WatchPath;
}

const PROGRAM_TIMEOUT_MS = 20_000;

class UnsupportedFirewallPlatformError extends Error {
  override readonly name = 'UnsupportedFirewallPlatformError';

  constructor(received: string) {
    super(`Firewall detection runs on linux, darwin or win32; received ${received}.`);
  }
}

class ProgramFailedError extends Error {
  override readonly name = 'ProgramFailedError';

  constructor(
    readonly program: string,
    readonly reason: string,
  ) {
    super(`${program} must run to read the firewall; it failed: ${reason}.`);
  }
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

const runProgram: RunProgram = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: PROGRAM_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const code = errorCode(error);
        if (error === null) {
          resolve({ code: 0, stdout, stderr });
        } else if (code === 'ENOENT') {
          resolve(null);
        } else if (typeof code === 'number') {
          resolve({ code, stdout, stderr });
        } else {
          reject(new ProgramFailedError(file, error.message));
        }
      },
    );
  });

const readText: ReadText = async (path) => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const watchPath: WatchPath = (path, changed) => {
  try {
    const watcher = watch(path, changed);
    watcher.on('error', changed);
    return () => {
      watcher.close();
    };
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

function firewallPlatform(platform: string): FirewallPlatform {
  if (platform === 'linux' || platform === 'darwin' || platform === 'win32') {
    return platform;
  }
  throw new UnsupportedFirewallPlatformError(platform);
}

export function nodeFirewallSystem(go2rtcBinary: string): FirewallSystem {
  return {
    platform: firewallPlatform(process.platform),
    go2rtcBinary,
    appBinary: process.execPath,
    run: runProgram,
    read: readText,
    watch: watchPath,
  };
}

class FirewallQueryError extends Error {
  override readonly name = 'FirewallQueryError';

  constructor(program: string, args: readonly string[], reason: string) {
    super(`${program} ${args.join(' ')} must answer to read the firewall; ${reason}.`);
  }
}

export async function answerOf(
  system: FirewallSystem,
  program: string,
  args: readonly string[],
): Promise<string> {
  const result = await system.run(program, args);
  if (result === null) {
    throw new FirewallQueryError(program, args, 'it is not installed');
  }
  if (result.code !== 0) {
    throw new FirewallQueryError(
      program,
      args,
      `it exited with ${String(result.code)}: ${result.stderr.trim() || 'no output'}`,
    );
  }
  return result.stdout;
}
