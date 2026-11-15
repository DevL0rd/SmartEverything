import {
  appendTo,
  CLIENT_PREFS,
  type AlbumActivityKind,
  type ClientPrefRead,
  type PhotosPref,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ActivityTail } from '../../photos/sharing/tail';
import type { PhotoAlbumActivityRow } from '../../store/repositories/photo-album-activity';
import type { Store } from '../../store/store';
import type { PushNotification } from './fcm';
import type { Audience } from './reply-audience';

export type AlbumPushStore = Pick<
  Store,
  'driveAlbums' | 'photoAlbumMembers' | 'profiles' | 'personal'
>;

export interface AlbumPush {
  readonly subject: Readonly<Record<string, string>>;
  readonly notification: PushNotification;
  readonly recipients: ReadonlySet<string>;
}

const PUSHED: ReadonlySet<AlbumActivityKind> = new Set(['added', 'comment', 'like', 'joined']);

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function bodyOf(
  kind: AlbumActivityKind,
  rows: readonly PhotoAlbumActivityRow[],
  names: { readonly actor: string; readonly album: string },
): string {
  const { actor, album } = names;
  switch (kind) {
    case 'added':
      return `${actor} added ${String(rows.length)} ${plural(rows.length, 'photo', 'photos')} to ${album}`;
    case 'comment':
      return `${actor} commented on ${album}: ${rows.at(-1)?.text ?? ''}`;
    case 'like':
      return `${actor} liked ${rows.length === 1 ? 'a photo in' : 'photos in'} ${album}`;
    case 'joined':
      return `${actor} joined ${album}`;
    case 'left':
      return `${actor} left ${album}`;
  }
}

function groups(rows: readonly PhotoAlbumActivityRow[]): PhotoAlbumActivityRow[][] {
  const grouped = new Map<string, PhotoAlbumActivityRow[]>();
  for (const row of rows) {
    if (!PUSHED.has(row.kind)) continue;
    appendTo(grouped, `${row.albumId}|${row.profileId}|${row.kind}`, row);
  }
  return [...grouped.values()];
}

export function albumPushes(
  store: AlbumPushStore,
  rows: readonly PhotoAlbumActivityRow[],
): readonly AlbumPush[] {
  return groups(rows).flatMap((group): AlbumPush[] => {
    const [first] = group;
    const album = first === undefined ? undefined : store.driveAlbums.find(first.albumId);
    if (first === undefined || album === undefined) return [];
    const recipients = new Set(
      [
        ...(album.ownerProfileId === null ? [] : [album.ownerProfileId]),
        ...store.photoAlbumMembers
          .forAlbum(album.id)
          .filter((member) => member.joinedAt !== null)
          .map((member) => member.profileId),
      ].filter((profileId) => profileId !== first.profileId),
    );
    return [
      {
        subject: { kind: 'photos_activity', albumId: album.id, activityKind: first.kind },
        notification: {
          title: 'Shared album',
          body: bodyOf(first.kind, group, {
            actor: store.profiles.byId(first.profileId).name,
            album: album.title,
          }),
          data: {
            kind: 'photos_activity',
            albumId: album.id,
            activityKind: first.kind,
          },
          tag: `photos-album-${album.id}`,
        },
        recipients,
      },
    ];
  });
}

export function invitePush(
  store: AlbumPushStore,
  albumId: string,
  profileId: string,
): AlbumPush | null {
  const album = store.driveAlbums.find(albumId);
  const member = store.photoAlbumMembers.find(albumId, profileId);
  if (album === undefined || member === undefined) return null;
  const inviter = store.profiles.byId(member.addedBy).name;
  return {
    subject: { kind: 'photos_activity', albumId, activityKind: 'invited', profileId },
    notification: {
      title: 'Shared album',
      body: `${inviter} invited you to ${album.title}`,
      data: { kind: 'photos_activity', albumId, activityKind: 'invited' },
      tag: `photos-album-${albumId}`,
    },
    recipients: new Set([profileId]),
  };
}

export function albumAudience(
  store: AlbumPushStore,
  recipients: ReadonlySet<string>,
  log: Logger,
): Audience {
  return (clientId) => {
    const profileId = store.profiles.activeOf(clientId).id;
    if (!recipients.has(profileId)) return false;
    const read: ClientPrefRead<PhotosPref> = store.personal.pref(CLIENT_PREFS.photos, {
      clientId,
      profileId,
    });
    if (read.status === 'invalid') {
      log.warn('photos.album_activity_pref_unreadable', { clientId, reason: read.reason });
      return true;
    }
    return read.value.albumActivity;
  };
}

export type AlbumDelivery = (push: AlbumPush, accept: Audience) => void;

export function watchAlbumActivity(
  store: AlbumPushStore & Pick<Store, 'context' | 'feed' | 'photoAlbumActivity'>,
  log: Logger,
  deliver: AlbumDelivery,
): () => void {
  const tail = new ActivityTail(store);
  return store.feed.subscribeNotices((notice) => {
    if (notice.type !== 'photos_activity') return;
    if (notice.kind === 'invited' && notice.profileId !== undefined) {
      const push = invitePush(store, notice.albumId, notice.profileId);
      if (push !== null) deliver(push, albumAudience(store, push.recipients, log));
    }
    for (const push of albumPushes(store, tail.drain())) {
      deliver(push, albumAudience(store, push.recipients, log));
    }
  });
}
