import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { DriveChangeResult, DriveItem } from '@smarteverything/domain';
import { driveKey } from '../../../queries/keys';
import {
  ALBUM_ID,
  FOLDER_ID,
  OTHER_FOLDER_ID,
  ROOT_ID,
  folderFixture,
  imageFixture,
} from './fixtures';
import { shownDriveChange, shownDriveCreates } from './shown';

const PHOTO = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const NEW_FOLDER = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const COPY = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const VIEWER = 'a1b2c3d4-0000-4000-8000-0000000000d1';

interface Listing {
  readonly folder: DriveItem | null;
  readonly items: readonly DriveItem[];
  readonly next: string | null;
}

const SOURCE = driveKey('folder', { rootId: ROOT_ID, folderId: FOLDER_ID, albumId: null }, null);
const TARGET = driveKey(
  'folder',
  { rootId: ROOT_ID, folderId: OTHER_FOLDER_ID, albumId: null },
  null,
);
const ALBUM = driveKey('album-items', { rootId: null, folderId: null, albumId: ALBUM_ID });

const TARGET_FOLDER = folderFixture({ id: OTHER_FOLDER_ID, name: 'Trips', relPath: 'Trips' });

function listing(folder: DriveItem | null, ...items: readonly DriveItem[]): InfiniteData<Listing> {
  return { pages: [{ folder, items, next: null }], pageParams: [null] };
}

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(SOURCE, listing(null, imageFixture({ id: PHOTO, name: 'sea.jpg' })));
  client.setQueryData(TARGET, listing(TARGET_FOLDER));
  client.setQueryData(ALBUM, { pages: [{ items: [], hits: [], next: null }], pageParams: [null] });
  return client;
}

function itemsIn(client: QueryClient, key: readonly unknown[]): readonly DriveItem[] {
  const data = client.getQueryData<InfiniteData<Listing>>(key);
  return data === undefined ? [] : data.pages.flatMap((page) => page.items);
}

const DONE: DriveChangeResult = { done: [], failed: [], conflicts: [] };

describe('drive creates shown before the hub answers', () => {
  it('shows a new folder in its parent at once under the id it sends', async () => {
    const client = seeded();
    let seen: readonly DriveItem[] = [];
    await shownDriveCreates(client, VIEWER, () => {
      seen = itemsIn(client, TARGET);
      return Promise.resolve(DONE);
    })({
      action: 'new_folder',
      parent: { kind: 'folder', folderId: OTHER_FOLDER_ID },
      name: 'Day one',
      id: NEW_FOLDER,
    });
    expect(seen).toMatchObject([
      { id: NEW_FOLDER, kind: 'folder', relPath: 'Trips/Day one', addedByProfileId: VIEWER },
    ]);
  });

  it('shows copies in the destination and takes them away when the hub refuses', async () => {
    const client = seeded();
    let seen: readonly DriveItem[] = [];
    const copy = shownDriveCreates(client, VIEWER, () => {
      seen = itemsIn(client, TARGET);
      return Promise.reject(new Error('refused'));
    })({ action: 'copy', itemIds: [PHOTO], toFolderId: OTHER_FOLDER_ID, copyIds: [COPY] });
    await expect(copy).rejects.toThrow('refused');
    expect(seen).toMatchObject([
      { id: COPY, name: 'sea.jpg', parentId: OTHER_FOLDER_ID, relPath: 'Trips/sea.jpg' },
    ]);
    expect(itemsIn(client, TARGET)).toEqual([]);
  });

  it('shows photos added to an album at once with their hits', async () => {
    const client = seeded();
    let seen: unknown = null;
    await shownDriveChange(client, () => {
      seen = client.getQueryData(ALBUM);
      return Promise.resolve(DONE);
    })({ action: 'album_add', albumId: ALBUM_ID, itemIds: [PHOTO] });
    expect(seen).toMatchObject({
      pages: [{ items: [{ id: PHOTO }], hits: [{ itemId: PHOTO, where: 'name', snippet: null }] }],
    });
  });
});
