import { readFile, rm, writeFile } from 'node:fs/promises';
import { kill, pid as ownPid } from 'node:process';
import { fsCode } from './fs-code';
import { isMissing } from './fs-util';

const HELD_HERE = new Set<string>();

export class PidLockedError extends Error {
  override readonly name = 'PidLockedError';

  constructor(
    readonly path: string,
    readonly holder: number,
  ) {
    super(`${path} is held by process ${String(holder)}.`);
  }
}

export interface PidLock {
  readonly release: () => Promise<void>;
}

export interface PidLockOptions {
  readonly pid?: number;
  readonly isAlive?: (processId: number) => boolean;
}

function processAlive(processId: number): boolean {
  try {
    kill(processId, 0);
    return true;
  } catch (error) {
    return fsCode(error) === 'EPERM';
  }
}

export async function pidHolder(path: string): Promise<number | null> {
  try {
    const holder = Number.parseInt(await readFile(path, 'utf8'), 10);
    return Number.isInteger(holder) && holder > 0 ? holder : null;
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

export async function pidLock(path: string, options: PidLockOptions = {}): Promise<PidLock> {
  const { pid = ownPid, isAlive = processAlive } = options;
  if (HELD_HERE.has(path)) {
    throw new PidLockedError(path, pid);
  }
  try {
    await writeFile(path, String(pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (fsCode(error) !== 'EEXIST') {
      throw error;
    }
    const holder = await pidHolder(path);
    if (holder !== null && holder !== pid && isAlive(holder)) {
      throw new PidLockedError(path, holder);
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
