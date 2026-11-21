import {
  type ClientPrefRead,
  type DriveNotification,
  type DriveNotificationKind,
  type LiveChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HostStore } from '../../store/host/host-store';
import {
  NOTIFICATION_TARGET,
  notificationText,
  type NotificationNames,
} from './notification-wording';

export interface PushKindsPref {
  readonly pushKinds: readonly DriveNotificationKind[];
}

export type DriveAudience = (clientId: string) => boolean;

export interface DrivePush {
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface DriveAudienceDeps {
  readonly profileOf: (clientId: string) => string;
  readonly pushKindsOf: (clientId: string) => ClientPrefRead<PushKindsPref>;
  readonly log: Logger;
}

export function newDriveNotification(change: LiveChange): DriveNotification | null {
  if (
    change.table !== 'drive_notifications' ||
    change.operation !== 'INSERT' ||
    change.record === null
  ) {
    return null;
  }
  return change.record;
}

export function driveAudience(
  notification: DriveNotification,
  deps: DriveAudienceDeps,
): DriveAudience {
  return (clientId) => {
    if (deps.profileOf(clientId) !== notification.profileId) return false;
    const read = deps.pushKindsOf(clientId);
    if (read.status === 'invalid') {
      deps.log.warn('drive.push_kinds_unreadable', {
        clientId,
        kind: notification.kind,
        reason: read.reason,
      });
      return true;
    }
    return read.value.pushKinds.includes(notification.kind);
  };
}

export function driveNotificationNames(
  store: Pick<HostStore, 'driveItems' | 'profiles'>,
  notification: DriveNotification,
): NotificationNames {
  const item = store.driveItems.find(notification.itemId, notification.profileId);
  const actor =
    notification.actorProfileId === null
      ? notification.actorName
      : store.profiles.byId(notification.actorProfileId).name;
  return { actor: actor ?? 'Someone', item: item?.name ?? 'a file' };
}

export function drivePush(notification: DriveNotification, names: NotificationNames): DrivePush {
  const { title, body } = notificationText(notification.kind, names);
  return {
    title,
    body,
    data: {
      kind: 'drive_notification',
      notificationId: notification.id,
      notificationKind: notification.kind,
      target: NOTIFICATION_TARGET[notification.kind],
      itemId: notification.itemId,
      ...(notification.refId === null ? {} : { refId: notification.refId }),
    },
  };
}
