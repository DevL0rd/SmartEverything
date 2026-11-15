import {
  CLIENT_PREFS,
  type ClientPrefRead,
  type DriveNotificationsPref,
  type LiveChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  driveAudience,
  driveNotificationNames,
  drivePush,
  newDriveNotification,
} from '../../drive/social/notify-push';
import type { Store } from '../../store/store';
import type { PushNotification } from './fcm';
import type { Audience } from './reply-audience';

export interface DriveDelivery {
  readonly subject: Readonly<Record<string, string>>;
  readonly compose: () => PushNotification;
  readonly audience: Audience;
}

type DriveDeliveryStore = Pick<Store, 'profiles' | 'personal' | 'driveItems'>;

export function driveDelivery(
  change: LiveChange,
  store: DriveDeliveryStore,
  log: Logger,
): DriveDelivery | null {
  const row = newDriveNotification(change);
  if (row === null) return null;
  return {
    subject: { kind: 'drive_notification', notificationId: row.id },
    compose: () => drivePush(row, driveNotificationNames(store, row)),
    audience: driveAudience(row, {
      profileOf: (clientId) => store.profiles.activeOf(clientId).id,
      pushKindsOf: (clientId): ClientPrefRead<DriveNotificationsPref> =>
        store.personal.pref(CLIENT_PREFS.drive_notifications, {
          clientId,
          profileId: store.profiles.activeOf(clientId).id,
        }),
      log,
    }),
  };
}
