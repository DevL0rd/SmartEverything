import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PHOTO_INSIGHTS, type PhotoInsights } from '@smarteverything/domain';
import type { DriveActor } from '../../src/drive/access';
import { insertDriveRow, recordLibraryRow } from './photo-rows';
import { InsightsReader } from '../../src/photos/insights';
import { RailCountsReader } from '../../src/photos/insights-rail';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

export const NOW = '2026-11-07T00:00:00.000Z';
export const AT = { today: '2026-11-07', home: null } as const;
export const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
export const BOB_ROOT = '0f000000-0000-4000-8000-000000000003';

export type Fields = Record<string, string | number | null>;

export interface Seed {
  readonly n: number;
  readonly takenAt: string;
  readonly root?: string;
  readonly name?: string;
  readonly kind?: 'image' | 'video';
  readonly bytes?: number;
  readonly durationMs?: number;
  readonly make?: string;
  readonly model?: string;
  readonly lens?: string;
  readonly placeId?: string;
  readonly offset?: number;
  readonly sha?: string;
  readonly starred?: boolean;
}

export let database: DatabaseSync;
export let context: StoreContext;
export let reader: InsightsReader;
export let rail: RailCountsReader;
export let alice: DriveActor;
export let bob: DriveActor;

export function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

export function insertRoot(id: string, scope: string, ownerId: string | null): void {
  insertDriveRow(database, { id, scope, ownerId });
}

export function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const DEFAULTS = {
  root: HOME_ROOT,
  kind: 'image',
  bytes: 10,
  sha: null,
  durationMs: 1000,
  make: null,
  model: null,
  lens: null,
  starred: false,
} as const;

function itemFields(input: Seed, id: string): Fields {
  const item = { ...DEFAULTS, ...input };
  const video = item.kind === 'video';
  const name = item.name ?? `${String(item.n)}.${video ? 'mp4' : 'jpg'}`;
  return {
    id,
    root_id: item.root,
    rel_path: name,
    name,
    kind: item.kind,
    mime: video ? 'video/mp4' : 'image/jpeg',
    bytes: item.bytes,
    sha256: item.sha,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: item.takenAt,
    width: 400,
    height: 300,
    duration_ms: video ? item.durationMs : null,
    camera_make: item.make,
    camera_model: item.model,
    camera_lens: item.lens,
  };
}

export function seed(input: Seed): string {
  const id = itemId(input.n);
  insert('drive_items', itemFields(input, id));
  recordLibraryRow(database, {
    id,
    rootId: input.root ?? HOME_ROOT,
    kind: input.kind ?? 'image',
    starred: input.starred === true,
    inLibrary: true,
  });
  insert('drive_media', {
    item_id: id,
    time_source: 'metadata',
    tz_offset_min: input.offset ?? null,
    preview_state: 'ready',
    poster_state: 'none',
    playable_state: 'none',
    place_id: input.placeId ?? null,
  });
  return id;
}

export function insertPhone(profileId: string, name: string, states: readonly string[]): string {
  const deviceId = randomUUID();
  const phoneId = randomUUID();
  insert('devices', {
    id: deviceId,
    provider: 'local',
    external_id: deviceId,
    kind: 'phone',
    name,
    model: 'phone',
    manufacturer: 'test',
    capabilities: '[]',
    details: '{}',
    created_at: NOW,
    updated_at: NOW,
  });
  insert('drive_backup_devices', {
    id: phoneId,
    profile_id: profileId,
    device_id: deviceId,
    name,
    platform: 'android',
    settings: '{}',
  });
  states.forEach((state, index) => {
    insert('drive_backup_assets', {
      backup_device_id: phoneId,
      local_id: `asset-${String(index)}`,
      item_id: state === 'uploading' || state === 'failed' ? null : itemId(900 + index),
      sha256: String(index).padStart(2, '0').repeat(32),
      state,
      at: NOW,
    });
  });
  return phoneId;
}

export function read(
  range: 'this_year' | 'last_12_months' | 'all_time',
  actor = alice,
): PhotoInsights {
  return PHOTO_INSIGHTS.parse(reader.read(actor, range, AT));
}

export function setup(): void {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  const aliceId = profiles.create({ name: 'Alice' }).id;
  const bobId = profiles.create({ name: 'Bob' }).id;
  alice = { profileId: aliceId };
  bob = { profileId: bobId };
  insertRoot(HOME_ROOT, 'home', null);
  insertRoot(BOB_ROOT, 'person', bobId);
  insert('drive_places', {
    id: '1001',
    name: 'Lisbon',
    admin: null,
    country: 'PT',
    lat: 38.7,
    lon: -9.1,
  });
  insert('drive_places', {
    id: '1002',
    name: 'Porto',
    admin: null,
    country: 'PT',
    lat: 41.1,
    lon: -8.6,
  });
  insert('drive_places', {
    id: '1003',
    name: 'Tokyo',
    admin: null,
    country: 'JP',
    lat: 35.6,
    lon: 139.7,
  });
  reader = new InsightsReader(context);
  rail = new RailCountsReader(context);
}

export function teardown(): void {
  database.close();
}
