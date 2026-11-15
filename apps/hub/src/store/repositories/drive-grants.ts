import {
  DRIVE_GRANT,
  DRIVE_GRANT_ROLE,
  type DriveGrant,
  type DriveGrantSet,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { driveRootRow } from './drive-roots';

const COLUMNS = 'id, item_id, profile_id, role, granted_by, created_at, expires_at';

const ROOT_OF = z.strictObject({ root_id: z.string() });

const SOONEST = z.strictObject({ expires_at: z.string().nullable() });

const GRANT_COLUMNS = z.strictObject({
  id: z.string(),
  item_id: z.string(),
  profile_id: z.string(),
  role: DRIVE_GRANT_ROLE,
  granted_by: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
});

const STORED_GRANT = storedRow(
  GRANT_COLUMNS.transform((row): DriveGrant =>
    DRIVE_GRANT.parse({
      id: row.id,
      itemId: row.item_id,
      profileId: row.profile_id,
      role: row.role,
      grantedBy: row.granted_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }),
  ),
  {},
);

export class DriveGrantsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveGrant | undefined {
    return this.context.sql.get(
      STORED_GRANT,
      `select ${COLUMNS} from drive_grants where id = $id`,
      {
        id,
      },
    );
  }

  byId(id: string): DriveGrant {
    return found(this.find(id), 'drive grant', id);
  }

  forPerson(itemId: string, profileId: string): DriveGrant | undefined {
    return this.context.sql.get(
      STORED_GRANT,
      `select ${COLUMNS} from drive_grants where item_id = $itemId and profile_id = $profileId`,
      { itemId, profileId },
    );
  }

  forItem(itemId: string): DriveGrant[] {
    return this.context.sql.all(
      STORED_GRANT,
      `select ${COLUMNS} from drive_grants where item_id = $itemId order by created_at, id`,
      { itemId },
    );
  }

  receivedBy(profileId: string): DriveGrant[] {
    return this.context.sql.all(
      STORED_GRANT,
      `select ${COLUMNS} from drive_grants where profile_id = $profileId order by created_at, id`,
      { profileId },
    );
  }

  madeBy(profileId: string): DriveGrant[] {
    return this.context.sql.all(
      STORED_GRANT,
      `select ${COLUMNS} from drive_grants where granted_by = $profileId order by created_at, id`,
      { profileId },
    );
  }

  set(request: DriveGrantSet, grantedBy: string): DriveGrant {
    const input = {
      ...request,
      expiresAt: request.expiresAt === null ? null : new Date(request.expiresAt).toISOString(),
    };
    return this.context.write(() => {
      const before = this.forPerson(input.itemId, input.profileId);
      if (before === undefined) {
        this.context.sql.run(
          'create the drive grant',
          `insert into drive_grants (${COLUMNS})
            values ($id, $itemId, $profileId, $role, $grantedBy, $now, $expiresAt)`,
          {
            id: this.context.newId(),
            itemId: input.itemId,
            profileId: input.profileId,
            role: input.role,
            grantedBy,
            now: this.context.now(),
            expiresAt: input.expiresAt,
          },
        );
      } else if (before.role !== input.role || before.expiresAt !== input.expiresAt) {
        this.context.sql.run(
          'change the drive grant',
          'update drive_grants set role = $role, expires_at = $expiresAt where id = $id',
          { id: before.id, role: input.role, expiresAt: input.expiresAt },
        );
      }
      const row = found(
        this.forPerson(input.itemId, input.profileId),
        'drive grant',
        `${input.itemId}/${input.profileId}`,
      );
      if (before === undefined) {
        this.context.changed('drive_grants', 'INSERT', row, null);
        this.announceRoot(row.itemId);
      } else if (before.role !== row.role || before.expiresAt !== row.expiresAt) {
        this.context.changed('drive_grants', 'UPDATE', row, before);
      }
      return row;
    });
  }

  private announceRoot(itemId: string): void {
    const item = found(
      this.context.sql.get(ROOT_OF, 'select root_id from drive_items where id = $itemId', {
        itemId,
      }),
      'drive item',
      itemId,
    );
    const root = driveRootRow(this.context, item.root_id);
    this.context.changed('drive_roots', 'UPDATE', root, root);
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the drive grant', 'delete from drive_grants where id = $id', {
        id,
      });
      this.context.changed('drive_grants', 'DELETE', null, before);
    });
  }

  nextExpiry(): string | null {
    return (
      this.context.sql.get(
        SOONEST,
        'select min(expires_at) as expires_at from drive_grants where expires_at is not null',
      )?.expires_at ?? null
    );
  }

  removeExpired(now: string): DriveGrant[] {
    return this.context.write(() => {
      const expired = this.context.sql.all(
        STORED_GRANT,
        `select ${COLUMNS} from drive_grants
          where expires_at is not null and expires_at <= $now order by expires_at, id`,
        { now },
      );
      for (const grant of expired) {
        this.context.sql.run(
          'remove the expired drive grant',
          'delete from drive_grants where id = $id',
          { id: grant.id },
        );
        this.context.changed('drive_grants', 'DELETE', null, grant);
      }
      return expired;
    });
  }

  sweepOrphans(): void {
    this.context.write(() => {
      const orphans = this.context.sql.all(
        STORED_GRANT,
        `select ${COLUMNS} from drive_grants
          where item_id not in (select id from drive_items)
            and item_id not in (select item_id from drive_trash)`,
        {},
      );
      for (const grant of orphans) {
        this.context.sql.run(
          'remove the orphaned drive grant',
          'delete from drive_grants where id = $id',
          {
            id: grant.id,
          },
        );
        this.context.changed('drive_grants', 'DELETE', null, grant);
      }
    });
  }
}
