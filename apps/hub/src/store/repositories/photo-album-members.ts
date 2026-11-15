import { ALBUM_MEMBER_ROLES, type AlbumMemberRole } from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';

const COLUMNS = 'album_id, profile_id, role, added_by, joined_at';

const MEMBER_COLUMNS = z.strictObject({
  album_id: z.string(),
  profile_id: z.string(),
  role: z.enum(ALBUM_MEMBER_ROLES),
  added_by: z.string(),
  joined_at: z.string().nullable(),
});

export interface PhotoAlbumMemberRow {
  readonly albumId: string;
  readonly profileId: string;
  readonly role: AlbumMemberRole;
  readonly addedBy: string;
  readonly joinedAt: string | null;
}

const STORED_MEMBER = MEMBER_COLUMNS.transform((row): PhotoAlbumMemberRow => ({
  albumId: row.album_id,
  profileId: row.profile_id,
  role: row.role,
  addedBy: row.added_by,
  joinedAt: row.joined_at,
}));

export class PhotoAlbumMembersRepository {
  constructor(private readonly context: StoreContext) {}

  find(albumId: string, profileId: string): PhotoAlbumMemberRow | undefined {
    return this.context.sql.get(
      STORED_MEMBER,
      `select ${COLUMNS} from photo_album_members
        where album_id = $albumId and profile_id = $profileId`,
      { albumId, profileId },
    );
  }

  forAlbum(albumId: string): PhotoAlbumMemberRow[] {
    return this.context.sql.all(
      STORED_MEMBER,
      `select ${COLUMNS} from photo_album_members where album_id = $albumId order by profile_id`,
      { albumId },
    );
  }

  forProfile(profileId: string): PhotoAlbumMemberRow[] {
    return this.context.sql.all(
      STORED_MEMBER,
      `select ${COLUMNS} from photo_album_members where profile_id = $profileId order by album_id`,
      { profileId },
    );
  }

  invite(albumId: string, profileId: string, role: AlbumMemberRole, addedBy: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'invite the person to the album',
        `insert into photo_album_members (${COLUMNS})
          values ($albumId, $profileId, $role, $addedBy, null)
          on conflict (album_id, profile_id) do update set role = excluded.role`,
        { albumId, profileId, role, addedBy },
      );
    });
  }

  join(albumId: string, profileId: string): PhotoAlbumMemberRow {
    return this.context.write(() => {
      this.context.sql.run(
        'join the album',
        `update photo_album_members set joined_at = coalesce(joined_at, $now)
          where album_id = $albumId and profile_id = $profileId`,
        { albumId, profileId, now: this.context.now() },
      );
      return found(this.find(albumId, profileId), 'album member', profileId);
    });
  }

  remove(albumId: string, profileId: string): boolean {
    return this.context.write(
      () =>
        this.context.sql.run(
          'remove the person from the album',
          'delete from photo_album_members where album_id = $albumId and profile_id = $profileId',
          { albumId, profileId },
        ) > 0,
    );
  }
}
