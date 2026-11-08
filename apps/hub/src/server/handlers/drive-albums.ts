import { z } from 'zod';
import { API_ENDPOINTS as E, type DriveItem } from '@smarteverything/domain';
import { decodeCursor, encodeCursor } from '../../drive/search';
import { DRIVE_PAGE_SIZE, type DriveActor } from '../../drive/service-read';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf, callerOf, type DriveServices } from './drive-services';

type DriveAlbumRoute =
  'listAlbums' | 'listAlbumItems' | 'createAlbum' | 'updateAlbum' | 'removeAlbum';

const ALBUM_CURSOR = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual'), position: z.number(), itemId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('smart'), at: z.number(), itemId: z.string().min(1) }),
]);

interface AlbumPageRequest {
  readonly albumId: string;
  readonly cursor: string | undefined;
}

function membersOf(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  request: AlbumPageRequest,
): { readonly items: DriveItem[]; readonly next: string | null } {
  const { albumId, cursor } = request;
  const page = services.albums.members(
    albumId,
    actor,
    cursor === undefined ? null : decodeCursor(ALBUM_CURSOR, cursor),
    DRIVE_PAGE_SIZE,
  );
  return {
    items: page.itemIds.map((itemId) => store.driveItems.byId(itemId)),
    next: page.next === null ? null : encodeCursor(page.next),
  };
}

export function driveAlbumRoutes(store: Store, services: DriveServices): Routes<DriveAlbumRoute> {
  const { write, albums } = services;
  return {
    listAlbums: bound(E.listAlbums, ({ query, caller }) =>
      refusing(() => albums.list(actorOf(store, caller), query.surface)),
    ),
    listAlbumItems: bound(E.listAlbumItems, ({ params, query, caller }) =>
      refusing(() =>
        membersOf(store, services, actorOf(store, caller), {
          albumId: params.albumId,
          cursor: query.cursor,
        }),
      ),
    ),
    createAlbum: bound(E.createAlbum, ({ body, caller }) =>
      refusing(() => write.createAlbum(callerOf(store, caller), body)),
    ),
    updateAlbum: bound(E.updateAlbum, ({ params, body, caller }) =>
      refusing(() => write.updateAlbum(callerOf(store, caller), params.albumId, body)),
    ),
    removeAlbum: bound(E.removeAlbum, ({ params, caller }) =>
      refusing(() => {
        write.removeAlbum(callerOf(store, caller), params.albumId);
        return DONE_REPLY;
      }),
    ),
  };
}
