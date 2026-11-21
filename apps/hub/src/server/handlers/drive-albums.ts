import { z } from 'zod';
import { API_ENDPOINTS as E, type DriveHit, type DriveItem } from '@smarteverything/domain';
import { decodeCursor, encodeCursor } from '../../drive/search';
import type { DriveActor } from '../../drive/access';
import { DRIVE_PAGE_SIZE } from '../../drive/page-size';
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

async function membersOf(
  services: DriveServices,
  actor: DriveActor,
  request: AlbumPageRequest,
): Promise<{
  readonly items: DriveItem[];
  readonly hits: DriveHit[];
  readonly next: string | null;
}> {
  const { albumId, cursor } = request;
  const page = await services.albums.members(
    albumId,
    actor,
    cursor === undefined ? null : decodeCursor(ALBUM_CURSOR, cursor),
    DRIVE_PAGE_SIZE,
  );
  return {
    items: page.items,
    hits: page.items.map((item) => ({ itemId: item.id, where: 'name', snippet: null })),
    next: page.next === null ? null : encodeCursor(page.next),
  };
}

export function driveAlbumRoutes(services: DriveServices): Routes<DriveAlbumRoute> {
  const { write, albums } = services;
  return {
    listAlbums: bound(E.listAlbums, ({ query, caller }) =>
      refusing(() => albums.list(actorOf(caller), query.surface)),
    ),
    listAlbumItems: bound(E.listAlbumItems, ({ params, query, caller }) =>
      refusing(() =>
        membersOf(services, actorOf(caller), {
          albumId: params.albumId,
          cursor: query.cursor,
        }),
      ),
    ),
    createAlbum: bound(E.createAlbum, ({ body, caller }) =>
      refusing(() => write.createAlbum(callerOf(caller), body)),
    ),
    updateAlbum: bound(E.updateAlbum, ({ params, body, caller }) =>
      refusing(() => write.updateAlbum(callerOf(caller), params.albumId, body)),
    ),
    removeAlbum: bound(E.removeAlbum, ({ params, caller }) =>
      refusing(async () => {
        await write.removeAlbum(callerOf(caller), params.albumId);
        return DONE_REPLY;
      }),
    ),
  };
}
