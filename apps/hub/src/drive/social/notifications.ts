import type { DriveNotification, DriveNotificationsRead } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';
import { DRIVE_PAGE_SIZE } from '../page-size';

export interface NotificationPage {
  readonly items: readonly DriveNotification[];
  readonly next: string | null;
}

export class DriveInbox {
  constructor(private readonly store: Pick<Store, 'host'>) {}

  async list(actor: DriveActor, cursor: string | undefined): Promise<NotificationPage> {
    const { notifications, next } = await this.store.host.call(
      'driveNotifications',
      'list',
      actor.profileId,
      cursor ?? null,
      DRIVE_PAGE_SIZE,
    );
    return { items: notifications, next };
  }

  async markRead(actor: DriveActor, read: DriveNotificationsRead): Promise<void> {
    await this.store.host.call('driveNotifications', 'markRead', actor.profileId, read);
  }
}
