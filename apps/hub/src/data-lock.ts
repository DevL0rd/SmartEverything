import { join } from 'node:path';
import { PidLockedError, pidLock, type PidLock } from './pid-lock';

export const LOCK_FILE = 'server.lock';

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

export type DataLock = PidLock;

export async function lockDataDirectory(directory: string): Promise<DataLock> {
  try {
    return await pidLock(join(directory, LOCK_FILE));
  } catch (error) {
    if (error instanceof PidLockedError) {
      throw new DataDirectoryLockedError(directory, error.holder);
    }
    throw error;
  }
}
