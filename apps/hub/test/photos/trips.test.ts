import { DatabaseSync } from 'node:sqlite';
import { TRIP } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { localDay } from '../../src/server/handlers/photos';
import { AWAY_KM, TripsReader, distanceKm, tripDrafts, type DayStat } from '../../src/photos/trips';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { insertDriveRow, recordLibraryRow } from './photo-rows';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const BOB_ROOT = '0f000000-0000-4000-8000-000000000003';
const LISBON = { latitude: 38.7167, longitude: -9.1333 } as const;
const BERLIN = { latitude: 52.52, longitude: 13.405 } as const;
const EVERYTHING = { fromDay: null, toDay: null } as const;

let database: DatabaseSync;
let trips: TripsReader;
let alice: DriveActor;
let bob: DriveActor;

function insert(table: string, fields: Record<string, string | number | null>): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function seed(n: number, takenAt: string, root = HOME_ROOT): void {
  const id = itemId(n);
  insert('drive_items', {
    id,
    root_id: root,
    rel_path: `${String(n)}.jpg`,
    name: `${String(n)}.jpg`,
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${String(n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: takenAt,
    width: 400,
    height: 300,
    place_lat: LISBON.latitude,
    place_lon: LISBON.longitude,
  });
  insert('drive_media', {
    item_id: id,
    time_source: 'metadata',
    preview_state: 'ready',
    poster_state: 'none',
    playable_state: 'none',
    place_id: '1001',
  });
  recordLibraryRow(database, { id, rootId: root, kind: 'image', starred: false, inLibrary: true });
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  const aliceId = profiles.create({ name: 'Alice' }).id;
  const bobId = profiles.create({ name: 'Bob' }).id;
  alice = { profileId: aliceId };
  bob = { profileId: bobId };
  insertDriveRow(database, { id: HOME_ROOT, scope: 'home', ownerId: null });
  insertDriveRow(database, { id: BOB_ROOT, scope: 'person', ownerId: bobId });
  insert('drive_places', {
    id: '1001',
    name: 'Lisbon',
    admin: null,
    country: 'PT',
    lat: LISBON.latitude,
    lon: LISBON.longitude,
  });
  for (const n of [1, 2, 3]) {
    seed(n, `2026-08-0${String(n)}T10:00:00.000Z`);
  }
  seed(4, '2026-08-05T10:00:00.000Z');
  seed(5, '2026-08-09T10:00:00.000Z');
  seed(6, '2026-09-10T10:00:00.000Z');
  trips = new TripsReader(context);
});

afterEach(() => {
  database.close();
});

describe('trips', () => {
  it('forms a trip across a one day gap, ignores a lone day and parses as the contract', () => {
    const found = trips.list(alice, BERLIN, EVERYTHING);
    expect(found).toHaveLength(1);
    const trip = TRIP.parse(found[0]);
    expect(trip).toMatchObject({
      id: 'trip:2026-08-01',
      from: '2026-08-01',
      to: '2026-08-05',
      count: 4,
      placeId: 1001,
      placeName: 'Lisbon',
      places: 1,
    });
    expect(trip.perDay.map((day) => day.day)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
    expect(trip.perDay.reduce((sum, day) => sum + day.count, 0)).toBe(4);
    expect(trip.distanceFromHomeKm).toBeGreaterThan(2000);
  });

  it('reports no distance when the home has no location', () => {
    expect(trips.list(alice, null, EVERYTHING)[0]?.distanceFromHomeKm).toBeNull();
  });

  it('drops a cluster that is near the home', () => {
    expect(trips.list(alice, LISBON, EVERYTHING)).toEqual([]);
  });

  it('lists only the trips of photos the person can see', () => {
    expect(trips.list(bob, null, EVERYTHING)).toHaveLength(1);
    seed(50, '2026-03-01T10:00:00.000Z', BOB_ROOT);
    seed(51, '2026-03-02T10:00:00.000Z', BOB_ROOT);
    expect(trips.list(bob, null, EVERYTHING).map((trip) => trip.from)).toContain('2026-03-01');
    expect(trips.list(alice, null, EVERYTHING).map((trip) => trip.from)).not.toContain(
      '2026-03-01',
    );
  });
});

describe('trip rules', () => {
  const day = (when: string, located = 1): DayStat => ({
    day: when,
    count: 2,
    located,
    lat: 38.7,
    lon: -9.1,
    coverItemId: itemId(1),
  });

  it('splits at a gap of more than one empty day', () => {
    const drafts = tripDrafts(
      [day('2026-01-01'), day('2026-01-02'), day('2026-01-05'), day('2026-01-06')],
      null,
    );
    expect(drafts.map((draft) => [draft.from, draft.to])).toEqual([
      ['2026-01-01', '2026-01-02'],
      ['2026-01-05', '2026-01-06'],
    ]);
  });

  it('needs two days with places', () => {
    expect(tripDrafts([day('2026-01-01')], null)).toEqual([]);
    expect(tripDrafts([day('2026-01-01'), day('2026-01-02', 0)], null)).toEqual([]);
  });

  it('measures the great circle distance', () => {
    expect(distanceKm(LISBON, BERLIN)).toBeGreaterThan(2300);
    expect(distanceKm(LISBON, BERLIN)).toBeLessThan(2330);
    expect(AWAY_KM).toBeGreaterThan(0);
  });

  it('uses the home time zone for today', () => {
    expect(localDay(new Date('2026-11-07T23:30:00.000Z'), 'Asia/Bangkok')).toBe('2026-11-08');
    expect(localDay(new Date('2026-11-07T23:30:00.000Z'), 'UTC')).toBe('2026-11-07');
  });
});
