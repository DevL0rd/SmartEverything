import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import type { DrivePathOf } from '../../src/store/repositories/drive-roots';
import { openStore, type Store } from '../../src/store/store';
import { testLogger } from './logs';

export interface TestStore {
  readonly store: Store;
  readonly directory: string;
  readonly layout: HubLayout;
  readonly close: () => Promise<void>;
}

export const unusedDrivePath: DrivePathOf = () => {
  throw new Error('This test store has no drive folders.');
};

export async function testStore(
  now: () => Date = () => new Date('2026-10-08T10:00:00.000Z'),
): Promise<TestStore> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-store-'));
  const layout = hubLayout(directory, {});
  const store = openStore({
    path: join(directory, 'test.db'),
    log: testLogger('store'),
    now,
    systemTimeZone: 'UTC',
    drivePathOf: (scope, ownerProfileId) =>
      scope === 'home' ? layout.home.drive : layout.person(String(ownerProfileId)).drive,
  });
  return {
    store,
    directory,
    layout,
    close: async (): Promise<void> => {
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
