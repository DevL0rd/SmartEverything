import type { DriveNotification, DriveNotificationsRead } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';
import { DRIVE_PAGE_SIZE } from '../service-read';

export interface NotificationPage {
  readonly items: readonly DriveNotification[];
  readonly next: string | null;
}

export class DriveInbox {
  constructor(private readonly store: Pick<Store, 'driveNotifications'>) {}

  list(actor: DriveActor, cursor: string | undefined): NotificationPage {
    const { notifications, next } = this.store.driveNotifications.list(
      actor.profileId,
      cursor ?? null,
      DRIVE_PAGE_SIZE,
    );
    return { items: notifications, next };
  }

  markRead(actor: DriveActor, read: DriveNotificationsRead): void {
    this.store.driveNotifications.markRead(actor.profileId, read);
  }
}
