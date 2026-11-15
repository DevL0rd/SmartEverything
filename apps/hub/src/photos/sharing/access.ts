import { ApiError, type AlbumMemberRole, type DriveAlbum } from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import type { Store } from '../../store/store';

export type AlbumRole = AlbumMemberRole | 'owner';

export type AccessStore = Pick<Store, 'driveAlbums' | 'photoAlbumMembers'>;

export interface AlbumAccess {
  readonly album: DriveAlbum;
  readonly role: AlbumRole;
}

function sharable(album: DriveAlbum | undefined): DriveAlbum | undefined {
  return album?.surface === 'photos' && album.kind === 'manual' && album.scope === 'person'
    ? album
    : undefined;
}

export function albumAccess(
  store: AccessStore,
  actor: DriveActor,
  albumId: string,
): AlbumAccess | undefined {
  const album = sharable(store.driveAlbums.find(albumId));
  if (album === undefined) return undefined;
  if (album.ownerProfileId === actor.profileId) return { album, role: 'owner' };
  const member = store.photoAlbumMembers.find(albumId, actor.profileId);
  return member === undefined ? undefined : { album, role: member.role };
}

export function requireAccess(store: AccessStore, actor: DriveActor, albumId: string): AlbumAccess {
  const access = albumAccess(store, actor, albumId);
  if (access === undefined) {
    throw new ApiError('not_found', 'There is no such shared album for this person.');
  }
  return access;
}

export function requireOwner(store: AccessStore, actor: DriveActor, albumId: string): DriveAlbum {
  const access = requireAccess(store, actor, albumId);
  if (access.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the person who made the album can change who is in it.');
  }
  return access.album;
}
