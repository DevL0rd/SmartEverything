import { randomUUID } from 'node:crypto';
import {
  ALBUM_MEMBER,
  ApiError,
  type AlbumActivityKind,
  type AlbumMember,
  type AlbumMembersSet,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import type { PhotoAlbumMemberRow } from '../../store/repositories/photo-album-members';
import type { HostStore } from '../../store/host/host-store';
import { requireAccess, requireOwner } from './access';
import type { AlbumSeen } from './seen';

export type MembersStore = Pick<
  HostStore,
  'context' | 'write' | 'driveAlbums' | 'photoAlbumMembers' | 'photoAlbumActivity' | 'profiles'
>;

const FOREIGN = z.strictObject({ total: z.number() });

export function memberOf(row: PhotoAlbumMemberRow): AlbumMember {
  return ALBUM_MEMBER.parse({
    albumId: row.albumId,
    profileId: row.profileId,
    role: row.role,
    addedBy: row.addedBy,
    joinedAt: row.joinedAt,
  });
}

export class SharedAlbumMembers {
  constructor(
    private readonly store: MembersStore,
    private readonly seen: AlbumSeen,
  ) {}

  set(actor: DriveActor, albumId: string, input: AlbumMembersSet): readonly AlbumMember[] {
    return this.store.write(() => {
      const album = requireOwner(this.store, actor, albumId);
      const people = new Set(this.store.profiles.list().map((profile) => profile.id));
      for (const { profileId } of input.members) {
        if (profileId === album.ownerProfileId) {
          throw new ApiError('invalid_request', 'The person who made the album is already in it.');
        }
        if (!people.has(profileId)) {
          throw new ApiError('not_found', 'There is no such person to add to the album.');
        }
      }
      this.refuseForeignPhotos(albumId);
      const known = new Set(this.store.photoAlbumMembers.forAlbum(albumId).map((m) => m.profileId));
      for (const { profileId, role } of input.members) {
        this.store.photoAlbumMembers.invite(albumId, profileId, role, actor.profileId);
      }
      this.store.context.notice({ type: 'photos_activity', albumId, kind: 'joined' });
      for (const { profileId } of input.members) {
        if (known.has(profileId)) continue;
        this.store.context.notice({ type: 'photos_activity', albumId, kind: 'invited', profileId });
      }
      return this.store.photoAlbumMembers.forAlbum(albumId).map(memberOf);
    });
  }

  remove(actor: DriveActor, albumId: string, profileId: string): void {
    this.store.write(() => {
      const album = requireOwner(this.store, actor, albumId);
      if (profileId === album.ownerProfileId) {
        throw new ApiError('invalid_request', 'The person who made the album stays in it.');
      }
      this.depart(albumId, profileId, null);
    });
  }

  join(actor: DriveActor, albumId: string): AlbumMember {
    return this.store.write(() => {
      const { role } = requireAccess(this.store, actor, albumId);
      if (role === 'owner') {
        throw new ApiError('invalid_request', 'The person who made the album is already in it.');
      }
      const before = this.store.photoAlbumMembers.find(albumId, actor.profileId);
      const member = this.store.photoAlbumMembers.join(albumId, actor.profileId);
      if (before?.joinedAt === null) this.record(albumId, actor.profileId, 'joined');
      return memberOf(member);
    });
  }

  leave(actor: DriveActor, albumId: string): void {
    this.store.write(() => {
      const { role } = requireAccess(this.store, actor, albumId);
      if (role === 'owner') {
        throw new ApiError(
          'invalid_request',
          'The person who made the album cannot leave it; delete the album instead.',
        );
      }
      this.depart(albumId, actor.profileId, 'left');
    });
  }

  private depart(albumId: string, profileId: string, record: AlbumActivityKind | null): void {
    this.store.driveAlbums.removeContributions(albumId, profileId);
    this.store.photoAlbumActivity.removeForProfile(albumId, profileId);
    this.store.photoAlbumMembers.remove(albumId, profileId);
    this.seen.forget(profileId, albumId);
    if (record === null) {
      this.store.context.notice({ type: 'photos_activity', albumId, kind: 'left' });
    } else {
      this.record(albumId, profileId, record);
    }
  }

  private record(albumId: string, profileId: string, kind: AlbumActivityKind): void {
    this.store.photoAlbumActivity.add({
      id: randomUUID(),
      albumId,
      itemId: null,
      profileId,
      kind,
      text: null,
    });
    this.store.context.notice({ type: 'photos_activity', albumId, kind });
  }

  private refuseForeignPhotos(albumId: string): void {
    const foreign =
      this.store.context.sql.get(
        FOREIGN,
        `select count(*) as total from drive_album_items ai
          join drive_items i on i.id = ai.item_id join drive_roots r on r.id = i.root_id
          where ai.album_id = $albumId and r.scope = 'person'
            and r.owner_profile_id is not ai.added_by`,
        { albumId },
      )?.total ?? 0;
    if (foreign > 0) {
      throw new ApiError(
        'invalid_request',
        'This album holds photos that belong to someone else, so it cannot be shared.',
      );
    }
  }
}
