import { type LiveChange } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { driveAudience, drivePush, newDriveNotification } from '../../drive/social/notify-push';
import type { Store } from '../../store/store';
import type { PushNotification } from './fcm';
import type { Audience } from './reply-audience';

export interface DriveDelivery {
  readonly subject: Readonly<Record<string, string>>;
  readonly compose: () => Promise<PushNotification>;
  readonly audience: Audience;
}

export function driveDelivery(
  change: LiveChange,
  store: Pick<Store, 'host'>,
  log: Logger,
): DriveDelivery | null {
  const row = newDriveNotification(change);
  if (row === null) return null;
  return {
    subject: { kind: 'drive_notification', notificationId: row.id },
    compose: async () => drivePush(row, await store.host.read('pushDriveNames', row)),
    audience: (client) =>
      driveAudience(row, {
        profileOf: () => client.profileId,
        pushKindsOf: () => client.driveNotifications,
        log,
      })(client.clientId),
  };
}
