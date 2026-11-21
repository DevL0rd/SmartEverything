import { z } from 'zod';
import {
  ALBUM_ACTIVITY,
  PHOTO_SHARING,
  type AlbumActivity,
  type DriveAlbum,
  type PhotoSharing,
  type SharedAlbum,
  type SharedAlbumMember,
} from '@smarteverything/domain';
import { shownTarget, type ShownTarget } from '../../../queries/shown-query';
import { photoKeys } from '../data/keys';

const ACTIVITY_PAGES = z
  .strictObject({
    pages: z.array(
      z.strictObject({ items: z.array(ALBUM_ACTIVITY).readonly(), next: z.string().nullable() }),
    ),
    pageParams: z.array(z.unknown()),
  })
  .readonly();

type ActivityPages = z.infer<typeof ACTIVITY_PAGES>;

function freshShare(album: DriveAlbum, now: string): SharedAlbum | null {
  if (album.ownerProfileId === null) return null;
  return {
    albumId: album.id,
    title: album.title,
    coverItemId: album.coverItemId,
    ownerProfileId: album.ownerProfileId,
    role: 'owner',
    members: [],
    joined: true,
    itemCount: album.itemCount,
    unread: 0,
    updatedAt: now,
  };
}

function withMembers(
  share: SharedAlbum,
  members: readonly SharedAlbumMember[],
  now: string,
): SharedAlbum {
  const named = new Map(members.map((member) => [member.profileId, member]));
  const kept = share.members.map((member) => named.get(member.profileId) ?? member);
  const known = new Set(share.members.map((member) => member.profileId));
  const added = members.filter((member) => !known.has(member.profileId));
  return { ...share, members: [...kept, ...added], updatedAt: now };
}

export function sharingWithMembers(
  sharing: PhotoSharing,
  album: DriveAlbum,
  members: readonly SharedAlbumMember[],
  now: string,
): PhotoSharing {
  const listed = sharing.albums.some((share) => share.albumId === album.id);
  if (listed) {
    return {
      ...sharing,
      albums: sharing.albums.map((share) =>
        share.albumId === album.id ? withMembers(share, members, now) : share,
      ),
    };
  }
  const fresh = freshShare(album, now);
  if (fresh === null) return sharing;
  return { ...sharing, albums: [withMembers(fresh, members, now), ...sharing.albums] };
}

export function sharingWithout(
  sharing: PhotoSharing,
  albumId: string,
  profileId: string,
): PhotoSharing {
  return {
    ...sharing,
    albums: sharing.albums.map((share) =>
      share.albumId === albumId
        ? { ...share, members: share.members.filter((member) => member.profileId !== profileId) }
        : share,
    ),
  };
}

export function membersTargets(
  album: DriveAlbum,
  members: readonly SharedAlbumMember[],
): readonly ShownTarget[] {
  const now = new Date().toISOString();
  return [
    shownTarget(photoKeys.sharing(), PHOTO_SHARING, (sharing) =>
      sharingWithMembers(sharing, album, members, now),
    ),
  ];
}

export function memberRemovedTargets(albumId: string, profileId: string): readonly ShownTarget[] {
  return [
    shownTarget(photoKeys.sharing(), PHOTO_SHARING, (sharing) =>
      sharingWithout(sharing, albumId, profileId),
    ),
  ];
}

export function activityAdded(pages: ActivityPages, entry: AlbumActivity): ActivityPages {
  const [first, ...rest] = pages.pages;
  if (first === undefined) return { ...pages, pages: [{ items: [entry], next: null }] };
  return { ...pages, pages: [{ ...first, items: [entry, ...first.items] }, ...rest] };
}

export function activityWithout(pages: ActivityPages, activityId: string): ActivityPages {
  if (!pages.pages.some((page) => page.items.some((entry) => entry.id === activityId))) {
    return pages;
  }
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.filter((entry) => entry.id !== activityId),
    })),
  };
}

export function activityReplaced(
  pages: ActivityPages,
  shownId: string,
  saved: AlbumActivity,
): ActivityPages {
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((entry) => (entry.id === shownId ? saved : entry)),
    })),
  };
}

export function addedTargets(entry: AlbumActivity): readonly ShownTarget[] {
  return [
    shownTarget(photoKeys.albumActivity(entry.albumId), ACTIVITY_PAGES, (pages) =>
      activityAdded(pages, entry),
    ),
  ];
}

export function removedTargets(albumId: string, activityId: string): readonly ShownTarget[] {
  return [
    shownTarget(photoKeys.albumActivity(albumId), ACTIVITY_PAGES, (pages) =>
      activityWithout(pages, activityId),
    ),
  ];
}

export function savedTarget(shownId: string, saved: AlbumActivity): ShownTarget {
  return shownTarget(photoKeys.albumActivity(saved.albumId), ACTIVITY_PAGES, (pages) =>
    activityReplaced(pages, shownId, saved),
  );
}
