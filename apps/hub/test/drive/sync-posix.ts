import { DriveReadService } from '../../src/drive/service-read';
import { DrivePosix } from '../../src/drive/posix/service';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { fileEnv } from '../../src/drive/versions';
import { testLogger } from '../support/logs';
import type { TestStore } from '../support/store';

const DISK_BYTES = 10 ** 12;

export function syncPosixOf(store: TestStore['store'], now: () => Date): DrivePosix {
  const space = (): Promise<{ totalBytes: number; freeBytes: number }> =>
    Promise.resolve({ totalBytes: 2 * DISK_BYTES, freeBytes: DISK_BYTES });
  return new DrivePosix({
    change: {
      ...fileEnv(store, testLogger('drive'), now),
      store,
      purge: { rearm: (): void => undefined },
    },
    guard: { status: (profileId) => store.driveQuotas.status(profileId), space },
    space: {
      read: new DriveReadService(store),
      quota: (profileId) => store.driveQuotas.status(profileId),
      probe: { space },
      inodes: () => Promise.resolve({ files: 1000, free: 900 }),
    },
    holds: (): boolean => false,
    lanes: new DriveRootLanes(),
  });
}

export function nsOf(moment: string): string {
  return String(BigInt(Date.parse(moment)) * 1_000_000n);
}
