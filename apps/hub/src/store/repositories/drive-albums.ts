import {
  DRIVE_ALBUM,
  DRIVE_ALBUM_SCOPES,
  DRIVE_ALBUM_SURFACES,
  type DriveAlbum,
  type DriveAlbumSurface,
  type SmartRule,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

export class DriveAlbumKindError extends Error {
  override readonly name = 'DriveAlbumKindError';

  constructor(
    readonly albumId: string,
    readonly kind: DriveAlbum['kind'],
  ) {
    super(`The ${kind} album ${albumId} does not take this change.`);
  }
}

const COLUMNS =
  'id, title, kind, rule, surface, scope, owner_profile_id, cover_item_id, item_count, created_at, updated_at';

const ALBUM_COLUMNS = z.strictObject({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['manual', 'smart']),
  rule: z.unknown(),
  surface: z.enum(DRIVE_ALBUM_SURFACES),
  scope: z.enum(DRIVE_ALBUM_SCOPES),
  owner_profile_id: z.string().nullable(),
  cover_item_id: z.string().nullable(),
  item_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

function albumOf(row: z.output<typeof ALBUM_COLUMNS>): DriveAlbum {
  return DRIVE_ALBUM.parse({
    id: row.id,
    title: row.title,
    kind: row.kind,
    ...(row.kind === 'smart' ? { rule: row.rule } : {}),
    surface: row.surface,
    scope: row.scope,
    ownerProfileId: row.owner_profile_id,
    coverItemId: row.cover_item_id,
    itemCount: row.item_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const STORED_ALBUM = storedRow(ALBUM_COLUMNS.transform(albumOf), { json: ['rule'] });

const MEMBER = z.strictObject({
  item_id: z.string(),
  position: z.number(),
  added_at: z.string(),
});

const POSITION = z.object({ edge: z.number().nullable() });

const COUNT = z.object({ total: z.number() });

type DraftOf<T> = T extends unknown ? Omit<T, 'createdAt' | 'updatedAt' | 'itemCount'> : never;

export type DriveAlbumDraft = DraftOf<DriveAlbum>;

export interface DriveAlbumPatch {
  readonly title?: string;
  readonly rule?: SmartRule;
  readonly coverItemId?: string | null;
}

export interface DriveAlbumMember {
  readonly itemId: string;
  readonly position: number;
  readonly addedAt: string;
}

export interface DriveAlbumCursor {
  readonly position: number;
  readonly itemId: string;
}

export interface DriveAlbumNeighbours {
  readonly before: string | null;
  readonly after: string | null;
}

export interface DriveAlbumWindow {
  readonly members: readonly DriveAlbumMember[];
  readonly next: DriveAlbumCursor | null;
}

function memberOf(row: z.output<typeof MEMBER>): DriveAlbumMember {
  return { itemId: row.item_id, position: row.position, addedAt: row.added_at };
}

function insertColumns(
  album: DriveAlbumDraft,
  now: string,
): Record<string, string | number | null> {
  return {
    id: album.id,
    title: album.title,
    kind: album.kind,
    rule: album.kind === 'smart' ? jsonText(album.rule) : null,
    surface: album.surface,
    scope: album.scope,
    owner: album.ownerProfileId,
    cover: album.coverItemId,
    now,
  };
}

export class DriveAlbumsRepository {
  constructor(private readonly context: StoreContext) {}

  listAll(): DriveAlbum[] {
    return this.context.sql.all(
      STORED_ALBUM,
      `select ${COLUMNS} from drive_albums order by title, id`,
    );
  }

  list(surface: DriveAlbumSurface): DriveAlbum[] {
    return this.context.sql.all(
      STORED_ALBUM,
      `select ${COLUMNS} from drive_albums where surface = $surface order by title, id`,
      { surface },
    );
  }

  listVisibleTo(profileId: string, surface: DriveAlbumSurface): DriveAlbum[] {
    return this.context.sql.all(
      STORED_ALBUM,
      `select ${COLUMNS} from drive_albums
        where surface = $surface and (scope = 'home' or owner_profile_id = $profileId)
        order by title, id`,
      { profileId, surface },
    );
  }

  find(id: string): DriveAlbum | undefined {
    return this.context.sql.get(
      STORED_ALBUM,
      `select ${COLUMNS} from drive_albums where id = $id`,
      {
        id,
      },
    );
  }

  byId(id: string): DriveAlbum {
    return found(this.find(id), 'drive album', id);
  }

  insert(album: DriveAlbumDraft): DriveAlbum {
    return this.context.write(() => {
      this.context.sql.run(
        'create the drive album',
        `insert into drive_albums (${COLUMNS}) values ($id, $title, $kind, $rule, $surface, $scope, $owner,
          $cover, 0, $now, $now)`,
        insertColumns(album, this.context.now()),
      );
      const row = this.byId(album.id);
      this.context.changed('drive_albums', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, patch: DriveAlbumPatch): DriveAlbum {
    return this.context.write(() => {
      const before = this.byId(id);
      if (patch.rule !== undefined && before.kind !== 'smart') {
        throw new DriveAlbumKindError(id, before.kind);
      }
      const changes = assignments({
        title: patch.title,
        rule: patch.rule === undefined ? undefined : jsonText(patch.rule),
        cover_item_id: patch.coverItemId,
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'update the drive album',
        `update drive_albums set ${changes.text} where id = $id`,
        { ...changes.parameters, id },
      );
      return this.emitUpdate(id, before);
    });
  }

  setItemCount(id: string, itemCount: number): DriveAlbum {
    return this.context.write(() => {
      const before = this.byId(id);
      if (before.kind !== 'smart') {
        throw new DriveAlbumKindError(id, before.kind);
      }
      this.context.sql.run(
        'count the smart drive album',
        'update drive_albums set item_count = $itemCount, updated_at = $now where id = $id',
        { id, itemCount, now: this.context.now() },
      );
      return this.emitUpdate(id, before);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the drive album', 'delete from drive_albums where id = $id', {
        id,
      });
      this.context.changed('drive_albums', 'DELETE', null, before);
    });
  }

  members(id: string, after: DriveAlbumCursor | null, limit: number): DriveAlbumWindow {
    const rows = this.context.sql.all(
      MEMBER,
      `select item_id, position, added_at from drive_album_items
        where album_id = $id
          ${after === null ? '' : 'and (position, item_id) > ($position, $itemId)'}
        order by position, item_id limit $limit`,
      after === null
        ? { id, limit }
        : { id, limit, position: after.position, itemId: after.itemId },
    );
    const members = rows.map(memberOf);
    const last = members.at(-1);
    return {
      members,
      next:
        members.length === limit && last !== undefined
          ? { position: last.position, itemId: last.itemId }
          : null,
    };
  }

  albumsOf(itemId: string): string[] {
    return this.context.sql
      .all(
        z.object({ album_id: z.string() }),
        'select album_id from drive_album_items where item_id = $itemId',
        {
          itemId,
        },
      )
      .map((row) => row.album_id);
  }

  addItems(id: string, itemIds: readonly string[]): DriveAlbum {
    return this.context.write(() => {
      const before = this.manual(id);
      let position = this.edge(id, 'max') ?? 0;
      for (const itemId of itemIds) {
        position += 1;
        this.context.sql.run(
          'add the item to the drive album',
          `insert into drive_album_items (album_id, item_id, position, added_at)
            values ($id, $itemId, $position, $now)
            on conflict (album_id, item_id) do nothing`,
          { id, itemId, position, now: this.context.now() },
        );
      }
      return this.recount(id, before);
    });
  }

  removeItems(id: string, itemIds: readonly string[]): DriveAlbum {
    return this.context.write(() => {
      const before = this.manual(id);
      for (const itemId of itemIds) {
        this.context.sql.run(
          'remove the item from the drive album',
          'delete from drive_album_items where album_id = $id and item_id = $itemId',
          { id, itemId },
        );
      }
      this.context.sql.run(
        'clear the drive album cover',
        `update drive_albums set cover_item_id = null
          where id = $id and cover_item_id is not null
            and cover_item_id not in (select item_id from drive_album_items where album_id = $id)`,
        { id },
      );
      return this.recount(id, before);
    });
  }

  moveItem(id: string, itemId: string, between: DriveAlbumNeighbours): DriveAlbum {
    return this.context.write(() => {
      const before = this.manual(id);
      this.positionOf(id, itemId);
      this.context.sql.run(
        'move the item in the drive album',
        'update drive_album_items set position = $position where album_id = $id and item_id = $itemId',
        { id, itemId, position: this.positionBetween(id, between) },
      );
      return this.recount(id, before);
    });
  }

  dropItem(itemId: string): void {
    this.context.write(() => {
      for (const id of this.albumsOf(itemId)) {
        const album = this.byId(id);
        if (album.kind === 'manual') {
          this.removeItems(id, [itemId]);
        }
      }
    });
  }

  private manual(id: string): DriveAlbum {
    const album = this.byId(id);
    if (album.kind !== 'manual') {
      throw new DriveAlbumKindError(id, album.kind);
    }
    return album;
  }

  private edge(id: string, direction: 'min' | 'max'): number | null {
    return (
      this.context.sql.get(
        POSITION,
        `select ${direction}(position) as edge from drive_album_items where album_id = $id`,
        { id },
      )?.edge ?? null
    );
  }

  private positionOf(id: string, itemId: string): number {
    return found(
      this.context.sql.get(
        z.object({ position: z.number() }),
        'select position from drive_album_items where album_id = $id and item_id = $itemId',
        { id, itemId },
      ),
      'drive album item',
      itemId,
    ).position;
  }

  private positionBetween(id: string, between: DriveAlbumNeighbours): number {
    const low = between.before === null ? null : this.positionOf(id, between.before);
    const high = between.after === null ? null : this.positionOf(id, between.after);
    if (low !== null && high !== null) {
      const middle = (low + high) / 2;
      if (middle > low && middle < high) {
        return middle;
      }
      this.renumber(id);
      return this.positionBetween(id, between);
    }
    if (low !== null) {
      return low + 1;
    }
    return high === null ? 1 : high - 1;
  }

  private renumber(id: string): void {
    this.context.sql.run(
      'renumber the drive album',
      `with ordered as (
        select item_id, row_number() over (order by position, item_id) as rank
          from drive_album_items where album_id = $id
      )
      update drive_album_items
        set position = (select rank from ordered where ordered.item_id = drive_album_items.item_id)
        where album_id = $id`,
      { id },
    );
  }

  private recount(id: string, before: DriveAlbum): DriveAlbum {
    const total =
      this.context.sql.get(
        COUNT,
        'select count(*) as total from drive_album_items where album_id = $id',
        {
          id,
        },
      )?.total ?? 0;
    this.context.sql.run(
      'count the drive album',
      'update drive_albums set item_count = $total, updated_at = $now where id = $id',
      { id, total, now: this.context.now() },
    );
    return this.emitUpdate(id, before);
  }

  private emitUpdate(id: string, before: DriveAlbum): DriveAlbum {
    const row = this.byId(id);
    this.context.changed('drive_albums', 'UPDATE', row, before);
    return row;
  }
}
