import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hubLayout } from '../../src/data-layout';
import { openStore } from '../../src/store/store';
import { testLogger } from '../support/logs';
import type { TestStore } from '../support/store';

export async function driveTestStore(
  now: () => Date = () => new Date('2026-11-07T00:00:00.000Z'),
): Promise<TestStore> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-drive-'));
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

export interface PutItem {
  readonly rootId: string;
  readonly id: string;
  readonly relPath: string;
  readonly kind: 'folder' | 'document';
  readonly addedBy?: string | null;
}

export function putItem(
  store: TestStore['store'],
  { rootId, id, relPath, kind, addedBy = null }: PutItem,
): void {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  const slash = relPath.lastIndexOf('/');
  const parent = slash < 0 ? null : store.driveItems.byPath(rootId, relPath.slice(0, slash), null);
  const common = {
    id,
    rootId,
    parentId: parent?.id ?? null,
    relPath,
    name,
    modifiedAt: '2026-11-07T00:00:00.000Z',
    addedAt: '2026-11-07T00:00:00.000Z',
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: addedBy,
    remoteId: null,
    remoteRev: null,
  };
  store.driveItems.write({
    item:
      kind === 'folder'
        ? { ...common, kind: 'folder', childCount: 0, bytes: 0 }
        : {
            ...common,
            kind: 'document',
            mime: 'text/plain',
            bytes: 10,
            sha256: null,
            integrity: 'unknown',
            thumb: { state: 'none' },
          },
    identity: { dev: '1', ino: id.slice(-8) },
  });
}
