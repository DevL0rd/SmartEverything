import { randomUUID } from 'node:crypto';
import {
  ALBUM_ACTIVITY,
  ApiError,
  type AlbumActivity,
  type AlbumActivityCreate,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../../drive/search';
import type { DriveActor } from '../../drive/access';
import { DRIVE_PAGE_SIZE } from '../../drive/page-size';
import type { PhotoAlbumActivityRow } from '../../store/repositories/photo-album-activity';
import type { Store } from '../../store/store';
import { requireAccess } from './access';
import type { AlbumSeen } from './seen';

export type ActivityStore = Pick<
  Store,
  'context' | 'write' | 'driveAlbums' | 'photoAlbumMembers' | 'photoAlbumActivity'
>;

const log = new Logger('hub.photos');

const CURSOR = z.strictObject({ createdAt: z.string().min(1), id: z.string().min(1) });

const LIKE_ID = z.strictObject({ id: z.string() });

const PRESENT = z.strictObject({ total: z.number() });

export interface ActivityPage {
  readonly items: readonly AlbumActivity[];
  readonly next: string | null;
}

export function activityOf(row: PhotoAlbumActivityRow): AlbumActivity {
  return ALBUM_ACTIVITY.parse({
    id: row.id,
    albumId: row.albumId,
    itemId: row.itemId,
    profileId: row.profileId,
    kind: row.kind,
    text: row.text,
    createdAt: row.createdAt,
  });
}

export class AlbumActivityService {
  constructor(
    private readonly store: ActivityStore,
    private readonly seen: AlbumSeen,
    private readonly now: () => Date,
  ) {}

  page(actor: DriveActor, albumId: string, cursor: string | undefined): ActivityPage {
    requireAccess(this.store, actor, albumId);
    const window = this.store.photoAlbumActivity.page(
      albumId,
      cursor === undefined ? null : decodeCursor(CURSOR, cursor),
      DRIVE_PAGE_SIZE,
    );
    if (cursor === undefined) this.seen.mark(actor.profileId, albumId, this.now().toISOString());
    return {
      items: window.activity.map(activityOf),
      next: window.next === null ? null : encodeCursor(window.next),
    };
  }

  add(actor: DriveActor, albumId: string, input: AlbumActivityCreate): AlbumActivity {
    return this.store.write(() => {
      requireAccess(this.store, actor, albumId);
      const made = this.alreadyMade(actor, albumId, input);
      if (made !== undefined) return activityOf(made);
      const itemId = input.itemId ?? null;
      if (itemId !== null) this.requireInAlbum(albumId, itemId);
      const text = input.kind === 'comment' ? input.text : null;
      const row = this.store.photoAlbumActivity.add({
        id: input.id ?? randomUUID(),
        albumId,
        itemId,
        profileId: actor.profileId,
        kind: input.kind,
        text,
      });
      if (row === undefined) return activityOf(this.existingLike(albumId, itemId, actor));
      this.store.context.notice({ type: 'photos_activity', albumId, kind: input.kind });
      return activityOf(row);
    });
  }

  remove(actor: DriveActor, albumId: string, activityId: string): void {
    this.store.write(() => {
      requireAccess(this.store, actor, albumId);
      const row = this.store.photoAlbumActivity.find(activityId);
      const own =
        row?.albumId === albumId &&
        row.profileId === actor.profileId &&
        (row.kind === 'comment' || row.kind === 'like');
      if (!own) {
        throw new ApiError('not_found', 'There is no such comment or like of yours in this album.');
      }
      this.store.photoAlbumActivity.remove(activityId);
    });
  }

  private alreadyMade(
    actor: DriveActor,
    albumId: string,
    input: AlbumActivityCreate,
  ): PhotoAlbumActivityRow | undefined {
    const made = input.id === undefined ? undefined : this.store.photoAlbumActivity.find(input.id);
    if (made === undefined) return undefined;
    const same =
      made.albumId === albumId && made.profileId === actor.profileId && made.kind === input.kind;
    if (!same) {
      throw new ApiError('forbidden', 'That comment or like belongs to someone else.');
    }
    log.debug('photos_activity.duplicate_add_ignored', { activityId: made.id, albumId });
    return made;
  }

  private existingLike(
    albumId: string,
    itemId: string | null,
    actor: DriveActor,
  ): PhotoAlbumActivityRow {
    const found = this.store.context.sql.get(
      LIKE_ID,
      `select id from photo_album_activity
        where album_id = $albumId and coalesce(item_id, '') = coalesce($itemId, '')
          and profile_id = $profileId and kind = 'like'`,
      { albumId, itemId, profileId: actor.profileId },
    );
    const like = found === undefined ? undefined : this.store.photoAlbumActivity.find(found.id);
    if (like === undefined) {
      throw new ApiError('conflict', 'The like could not be recorded.');
    }
    return like;
  }

  private requireInAlbum(albumId: string, itemId: string): void {
    const present =
      this.store.context.sql.get(
        PRESENT,
        `select count(*) as total from drive_album_items where album_id = $albumId and item_id = $itemId`,
        { albumId, itemId },
      )?.total ?? 0;
    if (present === 0) {
      throw new ApiError('not_found', 'That photo is not in this album.');
    }
  }
}
