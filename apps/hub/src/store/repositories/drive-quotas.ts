import {
  DRIVE_QUOTA,
  DRIVE_USAGE,
  type DriveQuota,
  type DriveUsage,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

const QUOTA_COLUMNS = z
  .strictObject({ profile_id: z.string(), bytes: z.number() })
  .transform((row): DriveQuota =>
    DRIVE_QUOTA.parse({ profileId: row.profile_id, bytes: row.bytes }),
  );

const USAGE_COLUMNS = z
  .strictObject({
    profile_id: z.string().nullable(),
    items: z.number(),
    folders: z.number(),
    live: z.number(),
    versions: z.number(),
    trash: z.number(),
  })
  .transform((row): DriveUsage =>
    DRIVE_USAGE.parse({
      profileId: row.profile_id,
      items: row.items,
      folders: row.folders,
      live: row.live,
      versions: row.versions,
      trash: row.trash,
    }),
  );

const USAGE = `select profile_id, items, folders, live, versions, trash from drive_usage_totals
  where entries > 0`;

const ALL_USAGE = `${USAGE} order by profile_id`;
const ONE_USAGE = `${USAGE} and profile_id is $profileId`;

export interface DriveQuotaStatus {
  readonly quota: number | null;
  readonly usage: DriveUsage;
}

export class DriveQuotasRepository {
  constructor(private readonly context: StoreContext) {}

  find(profileId: string): DriveQuota | undefined {
    return this.context.sql.get(
      QUOTA_COLUMNS,
      'select profile_id, bytes from drive_quotas where profile_id = $profileId',
      { profileId },
    );
  }

  all(): DriveQuota[] {
    return this.context.sql.all(
      QUOTA_COLUMNS,
      'select profile_id, bytes from drive_quotas order by profile_id',
    );
  }

  set(profileId: string, bytes: number | null): DriveQuota | null {
    return this.context.write(() => {
      if (bytes === null) {
        this.context.sql.run(
          'clear the drive quota',
          'delete from drive_quotas where profile_id = $profileId',
          { profileId },
        );
        return null;
      }
      this.context.sql.run(
        'set the drive quota',
        `insert into drive_quotas (profile_id, bytes) values ($profileId, $bytes)
          on conflict (profile_id) do update set bytes = excluded.bytes`,
        { profileId, bytes },
      );
      return this.find(profileId) ?? null;
    });
  }

  usage(profileId: string | null): DriveUsage {
    return (
      this.context.sql.get(USAGE_COLUMNS, ONE_USAGE, { profileId }) ??
      DRIVE_USAGE.parse({ profileId, items: 0, folders: 0, live: 0, versions: 0, trash: 0 })
    );
  }

  usageByProfile(): DriveUsage[] {
    return this.context.sql.all(USAGE_COLUMNS, ALL_USAGE);
  }

  status(profileId: string): DriveQuotaStatus {
    const quota = this.find(profileId)?.bytes ?? null;
    const usage = (): DriveUsage => this.usage(profileId);
    return {
      quota,
      get usage(): DriveUsage {
        return usage();
      },
    };
  }
}
