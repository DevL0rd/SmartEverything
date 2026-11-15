import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LogPayload } from '@smarteverything/logging';
import type { Migration } from './migration';
import type { Sql } from '../sql';

const MOUNT_NAME = 'My Drive';

const COMPUTER = z.strictObject({
  device_id: z.string(),
  turned_on: z.int(),
  profile_id: z.string().nullable(),
  root_id: z.string().nullable(),
});

type Computer = z.infer<typeof COMPUTER>;

const KEPT = z.strictObject({ id: z.string() });

function mountedComputers(sql: Sql): readonly Computer[] {
  return sql.all(
    COMPUTER,
    `select p.device_id, max(p.enabled) as turned_on, n.profile_id, r.id as root_id
     from drive_placements p
     left join computer_nodes n on n.device_id = p.device_id and n.revoked_at is null
     left join drive_roots r on r.scope = 'person' and r.owner_profile_id = n.profile_id
     where p.mode = 'mounted'
     group by p.device_id`,
  );
}

function dropOtherMounts(sql: Sql, deviceId: string, keep: string | null): number {
  return sql.run(
    'drop the mounts of a computer that are not its root mount',
    `delete from drive_placements
     where device_id = $deviceId and mode = 'mounted' and ($keep is null or id <> $keep)`,
    { deviceId, keep },
  );
}

function keptMount(sql: Sql, deviceId: string, rootId: string): string | null {
  return (
    sql.get(
      KEPT,
      `select id from drive_placements
       where device_id = $deviceId and mode = 'mounted' and root_id = $rootId
         and folder_item_id is null`,
      { deviceId, rootId },
    )?.id ?? null
  );
}

function turnKept(sql: Sql, id: string, enabled: number): void {
  sql.run(
    'turn the root mount of a computer on or off',
    `update drive_placements set enabled = $enabled, mount_name = $name, hold = null
     where id = $id`,
    { id, enabled, name: MOUNT_NAME },
  );
}

function insertRootMount(
  sql: Sql,
  computer: Computer & { readonly profile_id: string; readonly root_id: string },
  now: string,
): void {
  sql.run(
    'mount the whole drive of the computer’s person',
    `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, local_path,
       mount_name, enabled, hold, created_by, created_at, state, read_only, cache_bytes,
       pinned_bytes, open_files, pending_uploads, need_bytes, errors, reported_at)
     values ($id, $deviceId, $rootId, null, 'mounted', null, $name, $enabled, null, $profileId,
       $now, 'starting', 0, 0, 0, 0, 0, 0, '[]', $now)`,
    {
      id: randomUUID(),
      deviceId: computer.device_id,
      rootId: computer.root_id,
      name: MOUNT_NAME,
      enabled: computer.turned_on,
      profileId: computer.profile_id,
      now,
    },
  );
}

function collapseMounts(sql: Sql, now: string): LogPayload {
  let computers = 0;
  let dropped = 0;
  let unowned = 0;
  for (const computer of mountedComputers(sql)) {
    const { profile_id: profileId, root_id: rootId } = computer;
    if (profileId === null || rootId === null) {
      unowned += 1;
      dropped += dropOtherMounts(sql, computer.device_id, null);
      continue;
    }
    computers += 1;
    const kept = keptMount(sql, computer.device_id, rootId);
    dropped += dropOtherMounts(sql, computer.device_id, kept);
    if (kept === null) {
      insertRootMount(sql, { ...computer, profile_id: profileId, root_id: rootId }, now);
    } else {
      turnKept(sql, kept, computer.turned_on);
    }
  }
  return { computers, dropped, unowned };
}

export const DRIVE_ROOT_MOUNT_MIGRATION: Migration = {
  version: 224,
  name: 'drive-root-mount',
  statements: [
    'drop index drive_placements_whole_root',
    `create unique index drive_placements_whole_root
      on drive_placements (device_id, root_id) where folder_item_id is null and mode = 'synced'`,
    `create unique index drive_placements_whole_mount
      on drive_placements (device_id, root_id) where folder_item_id is null and mode = 'mounted'`,
  ],
  backfill: collapseMounts,
};
