import type { HubLayout } from './data-layout';
import { PidLockedError, pidLock, type PidLock } from './pid-lock';

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

export async function lockDataDirectory(
  layout: Pick<HubLayout, 'root' | 'lock'>,
): Promise<DataLock> {
  try {
    return await pidLock(layout.lock);
  } catch (error) {
    if (error instanceof PidLockedError) {
      throw new DataDirectoryLockedError(layout.root, error.holder);
    }
    throw error;
  }
}
