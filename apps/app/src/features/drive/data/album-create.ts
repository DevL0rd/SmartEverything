import type { QueryClient } from '@tanstack/react-query';
import type { DriveAlbum, DriveAlbumCreate } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { createDriveAlbum } from '../../../api/drive';
import { driveKey } from '../../../queries/keys';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import type { StoreState } from '../../../store/state';
import { cachedItems } from './added';

export type AlbumCreate = DriveAlbumCreate & { readonly id: string };

export function predictedAlbum(state: StoreState, body: AlbumCreate, at: Date): DriveAlbum | null {
  const profileId = state.session?.client.profile_id ?? null;
  if (body.scope === 'person' && profileId === null) return null;
  const now = at.toISOString();
  const base = {
    id: body.id,
    title: body.title,
    surface: body.surface,
    scope: body.scope,
    ownerProfileId: body.scope === 'person' ? profileId : null,
    coverItemId: null,
    createdAt: now,
    updatedAt: now,
  };
  return body.kind === 'manual'
    ? { ...base, kind: 'manual', itemCount: body.itemIds.length }
    : { ...base, kind: 'smart', rule: body.rule, itemCount: 0 };
}

function albumItemsKey(albumId: string): readonly unknown[] {
  return driveKey('album-items', { rootId: null, folderId: null, albumId });
}

function seedItems(client: QueryClient, body: AlbumCreate): void {
  const items = body.kind === 'manual' ? [...cachedItems(client, body.itemIds).values()] : [];
  const hits = items.map((item) => ({ itemId: item.id, where: 'name', snippet: null }));
  client.setQueryData(albumItemsKey(body.id), {
    pages: [{ items, hits, next: null }],
    pageParams: [null],
  });
}

export async function createAlbumShown(
  store: EntityStore,
  client: QueryClient,
  body: AlbumCreate,
): Promise<DriveAlbum> {
  const next = predictedAlbum(store.get(), body, new Date());
  seedItems(client, body);
  try {
    const album = await writeOptimistically(store, {
      event: 'drive.album_create',
      edits: next === null ? [] : [liveRowEdit('drive_albums', body.id, null, next)],
      send: () => createDriveAlbum(body),
      fields: { albumId: body.id, kind: body.kind, surface: body.surface },
    });
    background(
      client.invalidateQueries({ queryKey: albumItemsKey(body.id) }),
      'queries.invalidate_failed',
    );
    return album;
  } catch (error) {
    client.removeQueries({ queryKey: albumItemsKey(body.id), exact: true });
    throw error;
  }
}
