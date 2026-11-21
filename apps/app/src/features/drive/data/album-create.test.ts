import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { driveKey } from '../../../queries/keys';
import { EntityStore } from '../../../store/entity-store';
import { ALBUM_ID, FOLDER_ID, ROOT_ID, imageFixture } from './fixtures';

const api = vi.hoisted(() => ({ createDriveAlbum: vi.fn() }));
vi.mock('../../../api/drive', () => api);

const { createAlbumShown } = await import('./album-create');

const PHOTO = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const ITEMS = driveKey('album-items', { rootId: null, folderId: null, albumId: ALBUM_ID });

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(driveKey('folder', { rootId: ROOT_ID, folderId: FOLDER_ID, albumId: null }), {
    pages: [{ folder: null, items: [imageFixture({ id: PHOTO })], next: null }],
    pageParams: [null],
  });
  return client;
}

const BODY = {
  id: ALBUM_ID,
  kind: 'manual',
  title: 'Trip',
  surface: 'photos',
  scope: 'home',
  itemIds: [PHOTO],
} as const;

describe('a new album shown before the hub answers', () => {
  it('lists the album with its photos under the id it sends', async () => {
    const store = new EntityStore();
    const client = seeded();
    api.createDriveAlbum.mockImplementationOnce((body: { id: string }) => {
      expect(body.id).toBe(ALBUM_ID);
      expect(store.get().tables.drive_albums.byId[ALBUM_ID]).toMatchObject({
        title: 'Trip',
        itemCount: 1,
        ownerProfileId: null,
      });
      expect(client.getQueryData(ITEMS)).toMatchObject({ pages: [{ items: [{ id: PHOTO }] }] });
      return Promise.resolve(store.get().tables.drive_albums.byId[ALBUM_ID]);
    });
    await createAlbumShown(store, client, BODY);
    expect(api.createDriveAlbum).toHaveBeenCalledTimes(1);
  });

  it('takes the album and its photos away again when the hub refuses it', async () => {
    const store = new EntityStore();
    const client = seeded();
    api.createDriveAlbum.mockRejectedValueOnce(new Error('refused'));
    await expect(createAlbumShown(store, client, BODY)).rejects.toThrow('refused');
    expect(store.get().tables.drive_albums.byId[ALBUM_ID]).toBeUndefined();
    expect(client.getQueryData(ITEMS)).toBeUndefined();
  });
});
