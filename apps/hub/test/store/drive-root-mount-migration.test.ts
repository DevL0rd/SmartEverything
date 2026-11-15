import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_ROOT_MOUNT_MIGRATION } from '../../src/store/migrations/drive-root-mount';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-15T00:00:00.000Z';

const id = (group: string, index: number): string =>
  `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const SHARED = id('0a', 1);
const MY_DRIVE = id('0a', 2);
const LAPTOP = id('0d', 1);
const DESK = id('0d', 2);
const LOOSE = id('0d', 3);
const FOLDER_MOUNT = id('0e', 1);
const SHARED_MOUNT = id('0e', 2);
const SYNCED = id('0e', 3);
const DESK_MOUNT = id('0e', 4);
const LOOSE_MOUNT = id('0e', 5);

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let owner: string;

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function computer(deviceId: string, name: string, person: string | null): void {
  insert('devices', {
    id: deviceId,
    provider: 'local',
    external_id: `computer:${name}`,
    kind: 'computer',
    name,
    model: 'm',
    manufacturer: 'v',
    created_at: NOW,
    updated_at: NOW,
  });
  if (person === null) return;
  insert('computer_nodes', {
    device_id: deviceId,
    machine_id: `machine-${name}`,
    token_hash: `token-${name}`,
    hub_url: 'https://hub.test',
    paired_at: NOW,
    profile_id: person,
  });
}

function mount(placementId: string, deviceId: string, fields: Fields): void {
  insert('drive_placements', {
    id: placementId,
    device_id: deviceId,
    root_id: SHARED,
    mode: 'mounted',
    mount_name: 'Trip',
    enabled: 1,
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
    mount_point: '/home/robin/Network/Trip',
    reported_at: NOW,
    ...fields,
  });
}

const ROW = z.object({
  id: z.string(),
  device_id: z.string(),
  root_id: z.string(),
  folder_item_id: z.string().nullable(),
  mode: z.string(),
  mount_name: z.string().nullable(),
  enabled: z.number(),
});

function rows(): readonly z.infer<typeof ROW>[] {
  return z
    .array(ROW)
    .parse(
      database
        .prepare(
          'select id, device_id, root_id, folder_item_id, mode, mount_name, enabled from drive_placements order by device_id, mode',
        )
        .all(),
    );
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  const log = testLogger();
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_ROOT_MOUNT_MIGRATION.version),
    NOW,
    log,
  );
  const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
  owner = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  const roots = new DriveRootsRepository(context, drivePathOf);
  roots.insert(sharedDriveRoot(SHARED));
  roots.insert(personalDriveRoot(MY_DRIVE, owner));
  computer(LAPTOP, 'laptop', owner);
  computer(DESK, 'desk', owner);
  computer(LOOSE, 'loose', null);
  mount(FOLDER_MOUNT, LAPTOP, { folder_item_id: id('0b', 1), enabled: 1 });
  mount(SHARED_MOUNT, LAPTOP, { enabled: 0 });
  insert('drive_placements', {
    id: SYNCED,
    device_id: LAPTOP,
    root_id: MY_DRIVE,
    mode: 'synced',
    local_path: '/home/robin/Drive',
    enabled: 1,
    created_by: owner,
    created_at: NOW,
    excluded: '[]',
    ignore_patterns: '[]',
    conflict_copies: 1,
    state: 'up_to_date',
    read_only: 0,
    cache_bytes: 0,
    pinned_bytes: 0,
    open_files: 0,
    pending_uploads: 0,
    need_bytes: 0,
    errors: '[]',
    reported_at: NOW,
  });
  mount(DESK_MOUNT, DESK, { root_id: MY_DRIVE, mount_name: 'Drive', enabled: 0 });
  mount(LOOSE_MOUNT, LOOSE, {});
  migrate(sql, MIGRATIONS, NOW, log);
});

afterEach(() => {
  database.close();
});

describe('collapsing the mounts of each computer into one root mount', () => {
  it('turns every computer that mounted anything into one mount of its person’s My Drive', () => {
    const laptop = rows().filter((row) => row.device_id === LAPTOP);
    expect(laptop.map((row) => row.mode)).toEqual(['mounted', 'synced']);
    expect(laptop[0]).toMatchObject({
      root_id: MY_DRIVE,
      folder_item_id: null,
      mount_name: 'My Drive',
      enabled: 1,
    });
    expect([FOLDER_MOUNT, SHARED_MOUNT]).not.toContain(laptop[0]?.id);
    expect(laptop[1]?.id).toBe(SYNCED);
  });

  it('keeps an existing root mount and leaves it off when it was off', () => {
    expect(rows().filter((row) => row.device_id === DESK)).toEqual([
      {
        id: DESK_MOUNT,
        device_id: DESK,
        root_id: MY_DRIVE,
        folder_item_id: null,
        mode: 'mounted',
        mount_name: 'My Drive',
        enabled: 0,
      },
    ]);
  });

  it('drops the mounts of a computer that belongs to nobody', () => {
    expect(rows().filter((row) => row.device_id === LOOSE)).toEqual([]);
  });

  it('allows a whole-drive sync beside the whole-drive mount but no second mount', () => {
    expect(() => {
      mount(id('0e', 9), DESK, { root_id: MY_DRIVE });
    }).toThrow(/UNIQUE/);
  });
});
