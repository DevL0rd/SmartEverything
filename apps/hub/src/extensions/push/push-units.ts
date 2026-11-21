import {
  appendTo,
  CLIENT_PREFS,
  type AlbumActivityKind,
  type CameraNotificationsPref,
  type ClientPrefRead,
  type DeviceAlertsPref,
  type DriveNotification,
  type DriveNotificationsPref,
  type PhotosPref,
  type PushTargetRow,
  type Role,
} from '@smarteverything/domain';
import { driveNotificationNames } from '../../drive/social/notify-push';
import { drainActivity, type ActivityCursor } from '../../photos/sharing/tail';
import { effectiveClientById } from '../../server/person-access';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import type { PhotoAlbumActivityRow } from '../../store/repositories/photo-album-activity';
import type { PushNotification } from './fcm';

export interface PushClient {
  readonly clientId: string;
  readonly profileId: string;
  readonly role: Role;
  readonly deviceAlerts: ClientPrefRead<DeviceAlertsPref>;
  readonly cameraNotifications: ClientPrefRead<CameraNotificationsPref>;
  readonly driveNotifications: ClientPrefRead<DriveNotificationsPref>;
  readonly photos: ClientPrefRead<PhotosPref>;
}

export interface PushAudienceFacts {
  readonly targets: PushTargetRow[];
  readonly clients: PushClient[];
}

export function pushClientOf(store: Store, clientId: string): PushClient {
  const owner = { clientId, profileId: store.profiles.activeOf(clientId).id };
  return {
    clientId,
    profileId: owner.profileId,
    role: effectiveClientById(store, clientId).role,
    deviceAlerts: store.personal.pref(CLIENT_PREFS.device_alerts, owner),
    cameraNotifications: store.personal.pref(CLIENT_PREFS.camera_notifications, owner),
    driveNotifications: store.personal.pref(CLIENT_PREFS.drive_notifications, owner),
    photos: store.personal.pref(CLIENT_PREFS.photos, owner),
  };
}

export const PUSH_AUDIENCE_UNIT = storeUnit(
  (store, liveClients: readonly string[]): PushAudienceFacts => {
    const targets = store.personal.pushTargets();
    const clientIds = new Set([...targets.map((target) => target.client_id), ...liveClients]);
    return { targets, clients: [...clientIds].map((clientId) => pushClientOf(store, clientId)) };
  },
);

export const PUSH_DRIVE_NAMES_UNIT = storeUnit((store, row: DriveNotification) =>
  driveNotificationNames(store, row),
);

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

export interface AlbumActivityRequest {
  readonly cursor: ActivityCursor;
  readonly invite: { readonly albumId: string; readonly profileId: string } | null;
}

export interface AlbumActivityFound {
  readonly cursor: ActivityCursor;
  readonly pushes: AlbumPush[];
}

export const PUSH_ALBUM_ACTIVITY_UNIT = storeUnit(
  (store, { cursor, invite }: AlbumActivityRequest): AlbumActivityFound => {
    const invited = invite === null ? null : invitePush(store, invite.albumId, invite.profileId);
    const drained = drainActivity(store, cursor);
    return {
      cursor: drained.cursor,
      pushes: [...(invited === null ? [] : [invited]), ...albumPushes(store, drained.rows)],
    };
  },
);
