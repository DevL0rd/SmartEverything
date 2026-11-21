import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  hasPhotoFlag,
  type DriveItem,
  type LibraryPage,
  type LibraryScope,
} from '@smarteverything/domain';
import { driveKey } from '../../../queries/keys';
import { PHOTO_ALL, photoKeys } from '../../photos';
import { FOLDER_ID, OTHER_FOLDER_ID, ROOT_ID, imageFixture } from './fixtures';
import { editOfChange, hiddenEdit, shownDriveChange, writeDriveShown } from './shown';

const A = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const B = 'a1b2c3d4-0000-4000-8000-0000000000b1';

interface Listing {
  readonly items: readonly DriveItem[];
  readonly next: string | null;
}

const FOLDER = driveKey('folder', { rootId: ROOT_ID, folderId: FOLDER_ID, albumId: null }, 'name');
const TRASH = driveKey('trash', { rootId: ROOT_ID, folderId: null, albumId: null });
const SCOPE: LibraryScope = PHOTO_ALL;

function listing(...items: readonly DriveItem[]): InfiniteData<Listing, string | null> {
  return { pages: [{ items, next: null }], pageParams: [null] };
}

function page(ids: readonly string[]): LibraryPage {
  return {
    month: '2026-11',
    ids,
    revs: ids.map((_, index) => index + 1),
    aspect: ids.map(() => 1),
    takenAt: ids.map((_, index) => index * 1000),
    offsetMin: ids.map(() => null),
    durationMs: ids.map(() => null),
    flags: ids.map(() => 0),
    next: null,
  };
}

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(
    FOLDER,
    listing(imageFixture({ id: A, name: 'a.jpg' }), imageFixture({ id: B, name: 'b.jpg' })),
  );
  client.setQueryData(TRASH, listing());
  client.setQueryData(photoKeys.month('2026-11', SCOPE), {
    pages: [page([A, B])],
    pageParams: [null],
  });
  return client;
}

function names(client: QueryClient): readonly string[] {
  const data = client.getQueryData<InfiniteData<Listing, string | null>>(FOLDER);
  return data === undefined ? [] : data.pages.flatMap((entry) => entry.items.map((i) => i.name));
}

function monthIds(client: QueryClient): readonly string[] {
  const data = client.getQueryData<InfiniteData<LibraryPage, string | null>>(
    photoKeys.month('2026-11', SCOPE),
  );
  return data === undefined ? [] : data.pages.flatMap((entry) => entry.ids);
}

const DONE = { done: [], failed: [], conflicts: [] };

describe('drive changes shown at once', () => {
  it('shows a rename in every listing before the Hub answers', async () => {
    const client = seeded();
    const seen: (readonly string[])[] = [];
    await shownDriveChange(client, () => {
      seen.push(names(client));
      return Promise.resolve(DONE);
    })({ action: 'rename', itemId: A, name: 'beach.jpg' });
    expect(seen).toEqual([['beach.jpg', 'b.jpg']]);
  });

  it('hides trashed items outside the trash and brings them back when the Hub refuses', async () => {
    const client = seeded();
    let refuse = (_error: Error): void => {
      throw new Error('Expected a pending trash');
    };
    const trash = shownDriveChange(
      client,
      () =>
        new Promise<typeof DONE>((_resolve, reject) => {
          refuse = reject;
        }),
    )({ action: 'trash', itemIds: [A] });
    await vi.waitFor(() => {
      expect(names(client)).toEqual(['b.jpg']);
    });
    expect(monthIds(client)).toEqual([B]);
    refuse(new Error('locked'));
    await expect(trash).rejects.toThrow('locked');
    expect(names(client)).toEqual(['a.jpg', 'b.jpg']);
    expect(monthIds(client)).toEqual([A, B]);
  });

  it('marks favourites in the photo library at once', async () => {
    const client = seeded();
    await shownDriveChange(client, () => Promise.resolve(DONE))({ action: 'star', itemIds: [B] });
    const data = client.getQueryData<InfiniteData<LibraryPage, string | null>>(
      photoKeys.month('2026-11', SCOPE),
    );
    const flags = data?.pages[0]?.flags ?? [];
    expect(flags.map((value) => hasPhotoFlag(value, 'favourite'))).toEqual([false, true]);
  });

  it('takes moved items out of the folder they left', () => {
    const edit = editOfChange({ action: 'move', itemIds: [A], toFolderId: OTHER_FOLDER_ID });
    expect(edit?.hiddenIn(FOLDER)).toBe(true);
    expect(
      edit?.hiddenIn(
        driveKey('folder', { rootId: ROOT_ID, folderId: OTHER_FOLDER_ID, albumId: null }),
      ),
    ).toBe(false);
  });

  it('leaves the cache alone for a change it cannot predict', async () => {
    const client = seeded();
    expect(editOfChange({ action: 'copy', itemIds: [A], toFolderId: OTHER_FOLDER_ID })).toBeNull();
    await writeDriveShown(client, {
      event: 'photos.organise.archive',
      edit: hiddenEdit([A], () => false),
      send: () => Promise.resolve({ count: 1 }),
      incomplete: () => false,
    });
    expect(names(client)).toEqual(['a.jpg', 'b.jpg']);
  });
});
