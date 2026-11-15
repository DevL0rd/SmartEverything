import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { openStore, type Store } from '../../apps/hub/src/store/store.ts';
import type { ScratchPaths } from './guard.ts';
import { layoutOf } from './layout.ts';

export interface SeedStore {
  readonly store: Store;
  readonly layout: HubLayout;
  readonly close: () => void;
}

export async function openSeedStore(paths: ScratchPaths): Promise<SeedStore> {
  const layout = layoutOf(paths);
  await mkdir(dirname(layout.system.database.file), { recursive: true, mode: 0o700 });
  Logger.configure({ level: 'error' });
  const store = openStore({
    path: layout.system.database.file,
    log: new Logger('tool.test-hub'),
    now: () => new Date(),
    systemTimeZone: 'UTC',
    drivePathOf: (scope, ownerProfileId) =>
      scope === 'home' ? layout.home.drive : layout.person(String(ownerProfileId)).drive,
  });
  return {
    store,
    layout,
    close: (): void => {
      store.close();
    },
  };
}
