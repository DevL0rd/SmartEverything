import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  DriveAlbum,
  DriveAlbumChange,
  DriveAlbumCreate,
  DriveAlbumSurface,
  DriveItem,
} from '@smarteverything/domain';
import { found } from '../../store/context';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import type { DriveActor } from '../access';
import {
  DriveAlbumsService,
  type AlbumCursor,
  type SmartMemberRow,
  type SmartQueryRunner,
} from '../albums';

const MEMBER_ROW = z.object({ id: z.string(), at: z.number() });

const TOTAL_ROW = z.object({ total: z.number() });

function smartRunnerOf(store: HostStore): SmartQueryRunner {
  const { sql } = store.context;
  return {
    rows: (statement): readonly SmartMemberRow[] =>
      sql.all(MEMBER_ROW, statement.text, statement.parameters),
    count: (statement): number =>
      found(
        sql.get(TOTAL_ROW, statement.text, statement.parameters),
        'smart album count',
        statement.text,
      ).total,
  };
}

function albumsOf(store: HostStore): DriveAlbumsService {
  return new DriveAlbumsService({
    albums: store.driveAlbums,
    items: store.driveItems,
    roots: store.driveRoots,
    grants: store.driveGrants,
    runner: smartRunnerOf(store),
    newId: randomUUID,
    now: (): string => store.now().toISOString(),
    timeZone: store.settings.read().time_zone,
  });
}

export interface AlbumMembersInput {
  readonly actor: DriveActor;
  readonly albumId: string;
  readonly cursor: AlbumCursor | null;
  readonly limit: number;
}

export interface AlbumMembers {
  readonly items: DriveItem[];
  readonly next: AlbumCursor | null;
}

export interface AlbumItemsInput {
  readonly actor: DriveActor;
  readonly albumId: string;
  readonly itemIds: readonly string[];
}

export const DRIVE_ALBUMS_LIST_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly surface: DriveAlbumSurface }) =>
    albumsOf(store).list(input.actor, input.surface),
);

export const DRIVE_ALBUM_MEMBERS_UNIT = storeUnit(
  (store, input: AlbumMembersInput): AlbumMembers => {
    const { actor } = input;
    const page = albumsOf(store).members(input.albumId, actor, input.cursor, input.limit);
    return {
      items: page.itemIds.map((itemId) => store.driveItems.byId(itemId, actor.profileId)),
      next: page.next,
    };
  },
);

export const DRIVE_ALBUM_CREATE_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly create: DriveAlbumCreate }): DriveAlbum => {
    const { actor, create } = input;
    const albums = albumsOf(store);
    const base = {
      id: create.id,
      title: create.title,
      surface: create.surface,
      scope: create.scope,
    };
    if (create.kind === 'smart') {
      return albums.create({ ...base, kind: 'smart', rule: create.rule }, actor);
    }
    const created = albums.create({ ...base, kind: 'manual' }, actor);
    return create.itemIds.length === 0
      ? created
      : albums.addItems(created.id, create.itemIds, actor);
  },
);

export const DRIVE_ALBUM_UPDATE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly albumId: string;
      readonly change: DriveAlbumChange;
    },
  ): DriveAlbum => {
    const { actor, albumId, change } = input;
    const albums = albumsOf(store);
    if (change.title !== undefined) albums.rename(albumId, change.title, actor);
    if (change.rule !== undefined) albums.setRule(albumId, change.rule, actor);
    if (change.coverItemId !== undefined) albums.setCover(albumId, change.coverItemId, actor);
    return albums.get(albumId, actor);
  },
);

export const DRIVE_ALBUM_REMOVE_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly albumId: string }) => {
    albumsOf(store).remove(input.albumId, input.actor);
  },
);

export const DRIVE_ALBUM_ADD_ITEMS_UNIT = storeUnit((store, input: AlbumItemsInput): DriveAlbum =>
  albumsOf(store).addItems(input.albumId, input.itemIds, input.actor),
);

export const DRIVE_ALBUM_REMOVE_ITEMS_UNIT = storeUnit(
  (store, input: AlbumItemsInput): DriveAlbum =>
    albumsOf(store).removeItems(input.albumId, input.itemIds, input.actor),
);
