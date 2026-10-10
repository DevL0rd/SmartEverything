import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kill, pid } from 'node:process';

export const LOCK_FILE = 'server.lock';

const HELD_HERE = new Set<string>();

export class DataDirectoryLockedError extends Error {
  override readonly name = 'DataDirectoryLockedError';

  constructor(
    readonly directory: string,
    readonly holder: number,
  ) {
    super(
      `Another SmartEverything server (process ${String(holder)}) is already using ${directory}; stop it before starting another.`,
    );
  }
}

function isAlive(processId: number): boolean {
  try {
    kill(processId, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

export interface DataLock {
  readonly release: () => Promise<void>;
}

async function holderOf(path: string): Promise<number | null> {
  try {
    const holder = Number.parseInt(await readFile(path, 'utf8'), 10);
    return Number.isInteger(holder) && holder > 0 ? holder : null;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

export async function lockDataDirectory(directory: string): Promise<DataLock> {
  const path = join(directory, LOCK_FILE);
  if (HELD_HERE.has(path)) {
    throw new DataDirectoryLockedError(directory, pid);
  }
  try {
    await writeFile(path, String(pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) {
      throw error;
    }
    const holder = await holderOf(path);
    if (holder !== null && holder !== pid && isAlive(holder)) {
      throw new DataDirectoryLockedError(directory, holder);
    }
    await rm(path, { force: true });
    await writeFile(path, String(pid), { flag: 'wx', mode: 0o600 });
  }
  HELD_HERE.add(path);
  return {
    release: async (): Promise<void> => {
      HELD_HERE.delete(path);
      await rm(path, { force: true });
    },
  };
}
