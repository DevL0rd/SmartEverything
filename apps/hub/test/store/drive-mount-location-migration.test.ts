import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_MOUNT_LOCATION_MIGRATION } from '../../src/store/migrations/drive-mount-location';
import { DRIVE_ROOT_MOUNT_MIGRATION } from '../../src/store/migrations/drive-root-mount';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-14T00:00:00.000Z';

const id = (group: string, index: number): string =>
  `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const ROOT = id('0a', 1);
const DEVICE = id('0d', 1);
const MOUNTED = id('0e', 1);
const MOUNTED_WINDOWS = id('0e', 2);
const SYNCED = id('0e', 3);
const SYNC_OP = id('0f', 1);

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let sql: Sql;
let owner: string;

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function placement(placementId: string, fields: Fields): void {
  insert('drive_placements', {
    id: placementId,
    device_id: DEVICE,
    root_id: ROOT,
    mode: 'mounted',
    enabled: 1,
    hold: null,
    created_by: owner,
    created_at: NOW,
    state: 'mounted',
    read_only: 0,
    cache_bytes: 0,
    pinned_bytes: 0,
    open_files: 0,
    pending_uploads: 0,
    need_bytes: 0,
    errors: '[]',
    reported_at: NOW,
    ...fields,
  });
}

const ROW = z.object({
  id: z.string(),
  mode: z.string(),
  local_path: z.string().nullable(),
  mount_name: z.string().nullable(),
  mount_point: z.string().nullable(),
  excluded: z.string().nullable(),
  state: z.string(),
});

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  const log = testLogger();
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_MOUNT_LOCATION_MIGRATION.version),
    NOW,
    log,
  );
  const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
  owner = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  new DriveRootsRepository(context, drivePathOf).insert(sharedDriveRoot(ROOT));
  insert('devices', {
    id: DEVICE,
    provider: 'local',
    external_id: 'computer:laptop',
    kind: 'computer',
    name: 'Laptop',
    model: 'm',
    manufacturer: 'v',
    created_at: NOW,
    updated_at: NOW,
  });
  placement(MOUNTED, { local_path: '/home/robin/Mounts/My Drive' });
  placement(MOUNTED_WINDOWS, {
    folder_item_id: id('0b', 1),
    local_path: 'C:\\Users\\robin\\Trip',
  });
  placement(SYNCED, {
    folder_item_id: id('0b', 2),
    mode: 'synced',
    local_path: '/home/robin/Docs',
    excluded: '["Old"]',
    ignore_patterns: '[]',
    conflict_copies: 1,
    state: 'up_to_date',
  });
  insert('drive_sync_ops', {
    placement_id: SYNCED,
    op_id: SYNC_OP,
    result: '{}',
    at: NOW,
  });
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_ROOT_MOUNT_MIGRATION.version),
    NOW,
    log,
  );
});

afterEach(() => {
  database.close();
});

describe('migrating mounted placements to the standard mount place', () => {
  it('drops the chosen folder of a mount and keeps its last name as the mount name', () => {
    const rows = z
      .array(ROW)
      .parse(
        database
          .prepare(
            'select id, mode, local_path, mount_name, mount_point, excluded, state from drive_placements order by id',
          )
          .all(),
      );
    expect(rows).toEqual([
      {
        id: MOUNTED,
        mode: 'mounted',
        local_path: null,
        mount_name: 'My Drive',
        mount_point: null,
        excluded: null,
        state: 'mounted',
      },
      {
        id: MOUNTED_WINDOWS,
        mode: 'mounted',
        local_path: null,
        mount_name: 'Trip',
        mount_point: null,
        excluded: null,
        state: 'mounted',
      },
      {
        id: SYNCED,
        mode: 'synced',
        local_path: '/home/robin/Docs',
        mount_name: null,
        mount_point: null,
        excluded: '["Old"]',
        state: 'up_to_date',
      },
    ]);
  });

  it('keeps the rows that point at a placement', () => {
    expect(
      database
        .prepare('select placement_id from drive_sync_ops')
        .all()
        .map((row) => row['placement_id']),
    ).toEqual([SYNCED]);
  });

  it('refuses a mount with a chosen folder and a synced folder without one', () => {
    expect(() => {
      placement(id('0e', 9), { local_path: '/x', mount_name: 'x' });
    }).toThrow(/CHECK/);
    expect(() => {
      placement(id('0e', 9), {});
    }).toThrow(/CHECK/);
    expect(() => {
      placement(id('0e', 9), {
        mode: 'synced',
        mount_name: null,
        excluded: '[]',
        ignore_patterns: '[]',
        conflict_copies: 1,
      });
    }).toThrow(/CHECK/);
  });
});
