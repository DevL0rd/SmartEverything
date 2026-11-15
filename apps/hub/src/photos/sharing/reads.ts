import {
  PHOTO_SHARING,
  SHARED_ALBUM,
  type PhotoSharing,
  type SharedAlbum,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import type { Store } from '../../store/store';
import { activityOf } from './activity';
import type { AlbumSeen } from './seen';
import { partnerOf } from './partners';

export type ReadStore = Pick<
  Store,
  'context' | 'photoAlbumMembers' | 'photoAlbumActivity' | 'photoPartnerShares'
>;

const ALBUM_ROW = z.strictObject({
  id: z.string(),
  title: z.string(),
  cover_item_id: z.string().nullable(),
  owner_profile_id: z.string(),
  item_count: z.number(),
  updated_at: z.string(),
  role: z.enum(['owner', 'contributor', 'viewer']),
  joined: z.number(),
});

const UNREAD = z.strictObject({ total: z.number() });

const ACTIVITY_ID = z.strictObject({ id: z.string() });

export class SharingReader {
  constructor(
    private readonly store: ReadStore,
    private readonly seen: AlbumSeen,
  ) {}

  read(actor: DriveActor): PhotoSharing {
    const seen = this.seen.of(actor.profileId);
    const albums = this.albums(actor, seen);
    return PHOTO_SHARING.parse({
      albums,
      partners: this.partners(actor),
      activity: this.activity(actor),
      unread: albums.reduce((total, album) => total + album.unread, 0),
    });
  }

  unread(actor: DriveActor): number {
    const seen = this.seen.of(actor.profileId);
    return this.albums(actor, seen).reduce((total, album) => total + album.unread, 0);
  }

  private albums(
    actor: DriveActor,
    seen: Readonly<Record<string, string>>,
  ): readonly SharedAlbum[] {
    return this.store.context.sql
      .all(
        ALBUM_ROW,
        `select a.id, a.title, a.cover_item_id, a.owner_profile_id, a.item_count, a.updated_at,
            coalesce((select m.role from photo_album_members m
              where m.album_id = a.id and m.profile_id = $profile), 'owner') as role,
            coalesce((select m.joined_at is not null from photo_album_members m
              where m.album_id = a.id and m.profile_id = $profile), 1) as joined
          from drive_albums a
          where a.surface = 'photos' and a.kind = 'manual' and a.scope = 'person'
            and ((a.owner_profile_id = $profile
                and exists (select 1 from photo_album_members m where m.album_id = a.id))
              or exists (select 1 from photo_album_members m
                where m.album_id = a.id and m.profile_id = $profile))
          order by a.updated_at desc, a.id`,
        { profile: actor.profileId },
      )
      .map((row) =>
        SHARED_ALBUM.parse({
          albumId: row.id,
          title: row.title,
          coverItemId: row.cover_item_id,
          ownerProfileId: row.owner_profile_id,
          role: row.role,
          joined: row.joined === 1,
          members: this.store.photoAlbumMembers
            .forAlbum(row.id)
            .map((member) => ({ profileId: member.profileId, role: member.role })),
          itemCount: row.item_count,
          unread: this.unreadIn(actor, row.id, seen[row.id] ?? ''),
          updatedAt: row.updated_at,
        }),
      );
  }

  private unreadIn(actor: DriveActor, albumId: string, since: string): number {
    return (
      this.store.context.sql.get(
        UNREAD,
        `select count(*) as total from photo_album_activity
          where album_id = $albumId and profile_id <> $profile and created_at > $since`,
        { albumId, profile: actor.profileId, since },
      )?.total ?? 0
    );
  }

  private partners(actor: DriveActor): readonly ReturnType<typeof partnerOf>[] {
    return [
      ...this.store.photoPartnerShares.sharedBy(actor.profileId),
      ...this.store.photoPartnerShares.sharedWith(actor.profileId),
    ]
      .filter((share) => share.state !== 'stopped')
      .map(partnerOf);
  }

  private activity(actor: DriveActor): readonly ReturnType<typeof activityOf>[] {
    return this.store.context.sql
      .all(
        ACTIVITY_ID,
        `select act.id from photo_album_activity act
          join drive_albums a on a.id = act.album_id
          where a.owner_profile_id = $profile or exists (select 1 from photo_album_members m
            where m.album_id = a.id and m.profile_id = $profile)
          order by act.created_at desc, act.id desc limit $limit`,
        { profile: actor.profileId, limit: DRIVE_PAGE_SIZE },
      )
      .flatMap((row) => {
        const found = this.store.photoAlbumActivity.find(row.id);
        return found === undefined ? [] : [activityOf(found)];
      });
  }
}
