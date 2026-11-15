import {
  DRIVE_NOTIFICATION,
  DRIVE_NOTIFICATION_KIND,
  type DriveNotification,
  type DriveNotificationKind,
  type DriveNotificationsRead,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { inList } from '../sql';

const COLUMNS = `id, profile_id, kind, item_id, actor_profile_id, actor_name, ref_id, count,
  created_at, updated_at, read_at`;

const NOTIFICATION_COLUMNS = z.strictObject({
  id: z.string(),
  profile_id: z.string(),
  kind: DRIVE_NOTIFICATION_KIND,
  item_id: z.string(),
  actor_profile_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  ref_id: z.string().nullable(),
  count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  read_at: z.string().nullable(),
});

const STORED_NOTIFICATION = storedRow(
  NOTIFICATION_COLUMNS.transform((row): DriveNotification =>
    DRIVE_NOTIFICATION.parse({
      id: row.id,
      profileId: row.profile_id,
      kind: row.kind,
      itemId: row.item_id,
      actorProfileId: row.actor_profile_id,
      actorName: row.actor_name,
      refId: row.ref_id,
      count: row.count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      readAt: row.read_at,
    }),
  ),
  {},
);

const UNREAD = z.strictObject({ unread: z.number() });

export interface DriveNotificationInput {
  readonly profileId: string;
  readonly kind: DriveNotificationKind;
  readonly itemId: string;
  readonly actorProfileId: string | null;
  readonly actorName: string | null;
  readonly refId: string | null;
}

export interface DriveNotificationAdded {
  readonly notification: DriveNotification;
  readonly created: boolean;
}

export interface DriveNotificationWindow {
  readonly notifications: readonly DriveNotification[];
  readonly next: string | null;
}

const SAME_UNREAD = `profile_id = $profileId and kind = $kind and item_id = $itemId
  and actor_profile_id is $actorProfileId and actor_name is $actorName and read_at is null
  and (kind <> 'file_request_upload' or ref_id = $refId)`;

export class DriveNotificationsRepository {
  constructor(private readonly context: StoreContext) {}

  find(profileId: string, id: string): DriveNotification | undefined {
    return this.context.sql.get(
      STORED_NOTIFICATION,
      `select ${COLUMNS} from drive_notifications where id = $id and profile_id = $profileId`,
      { id, profileId },
    );
  }

  byId(profileId: string, id: string): DriveNotification {
    return found(this.find(profileId, id), 'drive notification', id);
  }

  add(input: DriveNotificationInput): DriveNotificationAdded {
    return this.context.write(() => {
      const now = this.context.now();
      const key = {
        profileId: input.profileId,
        kind: input.kind,
        itemId: input.itemId,
        actorProfileId: input.actorProfileId,
        actorName: input.actorName,
        refId: input.refId,
      };
      const unread = this.context.sql.get(
        STORED_NOTIFICATION,
        `select ${COLUMNS} from drive_notifications where ${SAME_UNREAD}`,
        key,
      );
      const result =
        unread === undefined ? this.insert(input, now) : this.coalesce(unread, input.refId, now);
      this.context.notice({ type: 'drive_notification', profileId: input.profileId });
      return result;
    });
  }

  list(profileId: string, after: string | null, limit: number): DriveNotificationWindow {
    const rows = this.context.sql.all(
      STORED_NOTIFICATION,
      `select ${COLUMNS} from drive_notifications where profile_id = $profileId
        ${after === null ? '' : 'and (updated_at, id) < (select updated_at, id from drive_notifications where id = $after and profile_id = $profileId)'}
        order by updated_at desc, id desc limit $limit`,
      after === null ? { profileId, limit } : { profileId, after, limit },
    );
    const last = rows.at(-1);
    return {
      notifications: rows,
      next: rows.length === limit && last !== undefined ? last.id : null,
    };
  }

  unreadCount(profileId: string): number {
    return (
      this.context.sql.get(
        UNREAD,
        'select count(*) as unread from drive_notifications where profile_id = $profileId and read_at is null',
        { profileId },
      )?.unread ?? 0
    );
  }

  markRead(profileId: string, read: DriveNotificationsRead): DriveNotification[] {
    return this.context.write(() => {
      const now = this.context.now();
      const pick = 'all' in read ? { text: 'true', parameters: {} } : inList('id', 'ids', read.ids);
      const before = this.context.sql.all(
        STORED_NOTIFICATION,
        `select ${COLUMNS} from drive_notifications
          where profile_id = $profileId and read_at is null and ${pick.text} order by updated_at, id`,
        { profileId, ...pick.parameters },
      );
      const changed: DriveNotification[] = [];
      for (const row of before) {
        this.context.sql.run(
          'mark the drive notification read',
          'update drive_notifications set read_at = $now where id = $id',
          { id: row.id, now },
        );
        const after = this.byId(profileId, row.id);
        this.context.changed('drive_notifications', 'UPDATE', after, row);
        changed.push(after);
      }
      if (changed.length > 0) {
        this.context.notice({ type: 'drive_notification', profileId });
      }
      return changed;
    });
  }

  private insert(input: DriveNotificationInput, now: string): DriveNotificationAdded {
    const id = this.context.newId();
    this.context.sql.run(
      'add the drive notification',
      `insert into drive_notifications (${COLUMNS}) values ($id, $profileId, $kind, $itemId,
        $actorProfileId, $actorName, $refId, 1, $now, $now, null)`,
      {
        id,
        profileId: input.profileId,
        kind: input.kind,
        itemId: input.itemId,
        actorProfileId: input.actorProfileId,
        actorName: input.actorName,
        refId: input.refId,
        now,
      },
    );
    const notification = this.byId(input.profileId, id);
    this.context.changed('drive_notifications', 'INSERT', notification, null);
    return { notification, created: true };
  }

  private coalesce(
    before: DriveNotification,
    refId: string | null,
    now: string,
  ): DriveNotificationAdded {
    this.context.sql.run(
      'coalesce the unread drive notification',
      'update drive_notifications set count = count + 1, updated_at = $now, ref_id = $refId where id = $id',
      { id: before.id, now, refId },
    );
    const notification = this.byId(before.profileId, before.id);
    this.context.changed('drive_notifications', 'UPDATE', notification, before);
    return { notification, created: false };
  }
}
