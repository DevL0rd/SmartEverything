import { DatabaseSync } from 'node:sqlite';
import { ApiError, DRIVE_ITEM, type Memory } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRIVE_PAGE_SIZE, type DriveActor } from '../../src/drive/service-read';
import { MEMORY_WINDOW_DAYS, MemoriesReader } from '../../src/photos/memories';
import { localDay } from '../../src/server/handlers/photos';
import {
  AWAY_KM,
  TripsReader,
  cameraName,
  daysStatement,
  distanceKm,
  longestDayOut,
  mostFavouritedMonth,
  perMonth,
  sameDayYearsAgo,
  shiftDay,
  tripDrafts,
  type DayStat,
} from '../../src/photos/trips';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const TODAY = '2026-11-07';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const BOB_ROOT = '0f000000-0000-4000-8000-000000000003';
const BURST = '0e000000-0000-4000-8000-000000000001';
const AT = { today: TODAY, home: null } as const;
const LISBON = { latitude: 38.7167, longitude: -9.1333 } as const;
const BERLIN = { latitude: 52.52, longitude: 13.405 } as const;
const AT_BERLIN = { today: TODAY, home: BERLIN } as const;

type Fields = Record<string, string | number | null>;

interface Seed {
  readonly n: number;
  readonly root?: string;
  readonly takenAt: string;
  readonly starred?: boolean;
  readonly located?: boolean;
  readonly placeId?: string | null;
  readonly camera?: readonly [string | null, string | null];
  readonly stackId?: string | null;
}

let database: DatabaseSync;
let context: StoreContext;
let reader: MemoriesReader;
let trips: TripsReader;
let alice: DriveActor;
let bob: DriveActor;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  const aliceId = profiles.create({ name: 'Alice' }).id;
  const bobId = profiles.create({ name: 'Bob' }).id;
  alice = { profileId: aliceId, owner: false };
  bob = { profileId: bobId, owner: false };
  insertRoot(HOME_ROOT, 'home', null);
  insertRoot(BOB_ROOT, 'person', bobId);
  insert('drive_places', {
    id: '1001',
    name: 'Lisbon',
    admin: null,
    country: 'PT',
    lat: LISBON.latitude,
    lon: LISBON.longitude,
  });
  reader = new MemoriesReader(context);
  trips = new TripsReader(context);
});

afterEach(() => {
  database.close();
});

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function insertRoot(id: string, scope: string, ownerId: string | null): void {
  insert('drive_roots', {
    id,
    kind: 'folder',
    label: `Root ${id.slice(-1)}`,
    scope,
    owner_profile_id: ownerId,
    path: `/srv/${id}`,
    read_only: 0,
    versions: 1,
    synced: 0,
    index_id: 'index-1',
    state: 'ready',
    items: 0,
    folders: 0,
    bytes: 0,
    hashed_share: 0,
    verified_share: 0,
    corrupt: 0,
    in_photos: 1,
    skip_patterns: '[]',
    include_hidden: 0,
    created_at: NOW,
    updated_at: NOW,
  });
}

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const DEFAULTS = {
  root: HOME_ROOT,
  starred: false,
  located: false,
  placeId: null,
  camera: [null, null],
  stackId: null,
} as const;

function itemFields(input: Seed, id: string): Fields {
  const item = { ...DEFAULTS, ...input };
  const located = item.located || item.placeId !== null;
  return {
    id,
    root_id: item.root,
    rel_path: `${String(item.n)}.jpg`,
    name: `${String(item.n)}.jpg`,
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: item.starred ? 1 : 0,
    rev: 1,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: item.takenAt,
    width: 400,
    height: 300,
    camera_make: item.camera[0],
    camera_model: item.camera[1],
    place_lat: located ? LISBON.latitude : null,
    place_lon: located ? LISBON.longitude : null,
  };
}

function seed(item: Seed): string {
  const id = itemId(item.n);
  insert('drive_items', itemFields(item, id));
  insert('drive_media', {
    item_id: id,
    time_source: 'metadata',
    preview_state: 'ready',
    poster_state: 'none',
    playable_state: 'none',
    stack_id: item.stackId ?? null,
    place_id: item.placeId ?? null,
  });
  return id;
}

function seedLibrary(): void {
  seed({ n: 1, takenAt: '2025-11-07T09:00:00.000Z', starred: true });
  seed({ n: 2, takenAt: '2025-11-07T10:00:00.000Z' });
  seed({ n: 3, takenAt: '2025-11-05T10:00:00.000Z' });
  seed({ n: 4, takenAt: '2024-11-07T10:00:00.000Z' });
  seed({
    n: 5,
    takenAt: '2025-06-15T08:00:00.000Z',
    starred: true,
    placeId: '1001',
    camera: ['Canon', 'EOS R'],
  });
  seed({ n: 6, takenAt: '2025-06-15T18:00:00.000Z', placeId: '1001' });
  seed({ n: 7, takenAt: '2025-06-20T12:00:00.000Z', camera: ['Canon', 'EOS R'] });
  [10, 11, 12].forEach((n) =>
    seed({ n, takenAt: `2026-08-0${String(n - 9)}T10:00:00.000Z`, placeId: '1001' }),
  );
  seed({ n: 13, takenAt: '2026-08-05T10:00:00.000Z', placeId: '1001' });
  seed({ n: 14, takenAt: '2026-08-09T10:00:00.000Z', placeId: '1001' });
  [15, 16, 17].forEach((n) =>
    seed({ n, takenAt: `2026-09-10T1${String(n - 15)}:00:00.000Z`, placeId: '1001' }),
  );
  insert('drive_stacks', { id: BURST, kind: 'burst', cover_item_id: null });
  [20, 21, 22].forEach((n) =>
    seed({ n, takenAt: `2026-10-01T10:00:0${String(n - 20)}.000Z`, stackId: BURST }),
  );
  database.prepare('update drive_stacks set cover_item_id = ? where id = ?').run(itemId(20), BURST);
  seed({ n: 30, takenAt: '2026-10-20T10:00:00.000Z' });
}

function byId(memories: readonly Memory[], id: string): Memory {
  const found = memories.find((memory) => memory.id === id);
  if (found === undefined) {
    throw new Error(`no memory ${id} in ${memories.map((memory) => memory.id).join(', ')}`);
  }
  return found;
}

describe('on this day and this week', () => {
  beforeEach(seedLibrary);

  it('lists the same day in earlier years with how many years ago', () => {
    const memories = reader.list(alice, AT);
    expect(byId(memories, 'on_this_day:1')).toMatchObject({
      kind: 'on_this_day',
      yearsAgo: 1,
      from: '2025-11-07',
      to: '2025-11-07',
      count: 2,
      coverItemId: itemId(1),
    });
    expect(byId(memories, 'on_this_day:2')).toMatchObject({ yearsAgo: 2, count: 1 });
  });

  it('lists the days around today in earlier years', () => {
    const memories = reader.list(alice, AT);
    expect(byId(memories, 'this_week:1')).toMatchObject({
      kind: 'this_week',
      from: '2025-11-04',
      to: '2025-11-10',
      count: 3,
    });
  });

  it('knows a leap day only exists in leap years', () => {
    expect(sameDayYearsAgo('2028-02-29', 4)).toBe('2024-02-29');
    expect(sameDayYearsAgo('2028-02-29', 1)).toBeNull();
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is empty for a library with no dated photos', () => {
    database.exec('delete from drive_items');
    expect(reader.list(alice, AT)).toEqual([]);
  });
});

describe('days out, bursts and trips of the past year', () => {
  beforeEach(seedLibrary);

  it('finds a day out above the average day, away from trips', () => {
    const memories = reader.list(alice, AT);
    expect(byId(memories, 'day_out:2026-09-10')).toMatchObject({
      kind: 'day_out',
      count: 3,
      placeId: 1001,
      placeName: 'Lisbon',
    });
    expect(memories.some((memory) => memory.id === 'day_out:2026-08-09')).toBe(false);
    expect(memories.some((memory) => memory.id === 'day_out:2026-08-02')).toBe(false);
  });

  it('shows a burst once with every shot counted and its cover', () => {
    expect(byId(reader.list(alice, AT), `burst:${BURST}`)).toMatchObject({
      kind: 'burst',
      stackId: BURST,
      count: 3,
      from: '2026-10-01',
      coverItemId: itemId(20),
    });
  });

  it('forms a trip across a one day gap and ignores a lone day', () => {
    const memories = reader.list(alice, AT_BERLIN);
    const trip = byId(memories, 'trip:2026-08-01');
    expect(trip).toMatchObject({
      kind: 'trip',
      from: '2026-08-01',
      to: '2026-08-05',
      count: 4,
      placeId: 1001,
      placeName: 'Lisbon',
      places: 1,
    });
    expect(trip.kind === 'trip' ? trip.perDay.map((day) => day.day) : []).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
    expect(trip.kind === 'trip' ? trip.perDay.reduce((sum, day) => sum + day.count, 0) : 0).toBe(4);
    expect(trip.kind === 'trip' ? trip.perDay.some((day) => day.count === 0) : false).toBe(true);
    expect(trip.kind === 'trip' ? trip.distanceFromHomeKm : 0).toBeGreaterThan(2000);
    expect(memories.filter((memory) => memory.kind === 'trip')).toHaveLength(1);
  });

  it('reports no distance when the home has no location', () => {
    const trip = byId(reader.list(alice, AT), 'trip:2026-08-01');
    expect(trip.kind === 'trip' ? trip.distanceFromHomeKm : 0).toBeNull();
  });

  it('drops a cluster that is near the home', () => {
    expect(trips.list(alice, LISBON, { fromDay: null, toDay: null })).toEqual([]);
    expect(trips.list(alice, BERLIN, { fromDay: null, toDay: null })).toHaveLength(1);
  });

  it('keeps only the past year for days out, bursts and trips', () => {
    seed({ n: 40, takenAt: '2024-03-01T10:00:00.000Z', placeId: '1001' });
    seed({ n: 41, takenAt: '2024-03-02T10:00:00.000Z', placeId: '1001' });
    const ids = reader.list(alice, AT).map((memory) => memory.id);
    expect(ids).not.toContain('trip:2024-03-01');
    expect(shiftDay(TODAY, 1 - MEMORY_WINDOW_DAYS)).toBe('2025-11-08');
    expect(
      trips.list(alice, null, { fromDay: null, toDay: null }).map((trip) => trip.id),
    ).toContain('trip:2024-03-01');
  });
});

describe('year in review', () => {
  beforeEach(seedLibrary);

  it('reviews each closed year and never the current one', () => {
    const memories = reader.list(alice, AT);
    expect(memories.filter((memory) => memory.kind === 'year').map((memory) => memory.id)).toEqual([
      'year:2025',
      'year:2024',
    ]);
  });

  it('fills the review from the year', () => {
    const year = byId(reader.list(alice, AT), 'year:2025');
    expect(year.kind === 'year' ? year.review : null).toEqual({
      year: 2025,
      perMonth: Array.from({ length: 12 }, (_, index) => {
        const month = `2025-${String(index + 1).padStart(2, '0')}`;
        return { month, count: month === '2025-06' || month === '2025-11' ? 3 : 0 };
      }),
      topPlaces: [{ placeId: 1001, name: 'Lisbon', count: 2 }],
      topCameras: [{ name: 'Canon EOS R', count: 2 }],
      mostFavouritedMonth: '2025-06',
      longestDayOut: { day: '2025-06-15', count: 2 },
    });
    expect(year).toMatchObject({ from: '2025-01-01', to: '2025-12-31', count: 6 });
  });

  it('has twelve months, no favourite month when nothing is starred, and no day out without places', () => {
    const days: DayStat[] = [
      {
        day: '2025-02-01',
        count: 2,
        located: 0,
        lat: null,
        lon: null,
        favourites: 0,
        firstSeconds: 0,
        lastSeconds: 10,
        coverItemId: itemId(1),
      },
    ];
    expect(perMonth(2025, days)).toHaveLength(12);
    expect(mostFavouritedMonth(2025, days)).toBeNull();
    expect(longestDayOut(days)).toBeNull();
  });

  it('names a camera once whether or not the model repeats the make', () => {
    expect(cameraName('Canon', 'EOS R')).toBe('Canon EOS R');
    expect(cameraName('Apple', 'Apple iPhone 14')).toBe('Apple iPhone 14');
    expect(cameraName('Apple', null)).toBe('Apple');
    expect(cameraName(null, 'iPhone')).toBe('iPhone');
    expect(cameraName(null, null)).toBeNull();
  });
});

describe('member scope', () => {
  beforeEach(() => {
    seedLibrary();
    seed({ n: 50, root: BOB_ROOT, takenAt: '2025-11-07T12:00:00.000Z' });
  });

  it('adds only the folders the person can see', () => {
    expect(byId(reader.list(alice, AT), 'on_this_day:1')).toMatchObject({ count: 2 });
    expect(byId(reader.list(bob, AT), 'on_this_day:1')).toMatchObject({ count: 3 });
  });

  it('lists only visible photos of a memory', () => {
    expect(reader.memoryItems(alice, 'on_this_day:1', AT, undefined).items).toHaveLength(2);
    expect(reader.memoryItems(bob, 'on_this_day:1', AT, undefined).items).toHaveLength(3);
  });
});

describe('the photos of a memory', () => {
  beforeEach(seedLibrary);

  it('lists a day oldest first as complete items', () => {
    const page = reader.memoryItems(alice, 'on_this_day:1', AT, undefined);
    expect(page.items.map((item) => item.id)).toEqual([itemId(1), itemId(2)]);
    page.items.forEach((item) => DRIVE_ITEM.parse(item));
    expect(page.next).toBeNull();
  });

  it('lists every shot of a burst and every day of a trip', () => {
    expect(
      reader.memoryItems(alice, `burst:${BURST}`, AT, undefined).items.map((item) => item.id),
    ).toEqual([itemId(20), itemId(21), itemId(22)]);
    expect(
      reader
        .memoryItems(alice, 'trip:2026-08-01', AT_BERLIN, undefined)
        .items.map((item) => item.id),
    ).toEqual([itemId(10), itemId(11), itemId(12), itemId(13)]);
  });

  it('lists a year and a week', () => {
    expect(reader.memoryItems(alice, 'year:2024', AT, undefined).items).toHaveLength(1);
    expect(reader.memoryItems(alice, 'this_week:1', AT, undefined).items).toHaveLength(3);
  });

  it('refuses a memory that does not exist', () => {
    for (const id of [
      'bogus:1',
      'day_out:nope',
      'year:20x5',
      'burst:nope',
      'trip:2020-01-01',
      'on_this_day:0',
      'on_this_day:x',
      'plain',
    ]) {
      expect(() => reader.memoryItems(alice, id, AT, undefined)).toThrow(ApiError);
    }
  });

  it('pages a long day with a cursor and no repeats', () => {
    const insertItem = database.prepare(
      `insert into drive_items (id, root_id, rel_path, name, kind, mime, bytes, integrity, modified_at,
         added_at, starred, rev, etag, outside, thumb_state, taken_at, width, height)
       values (?, ?, ?, ?, 'image', 'image/jpeg', 1, 'unknown', ?, ?, 0, 1, 'e', 0, 'none', ?, 4, 3)`,
    );
    for (let n = 1; n <= DRIVE_PAGE_SIZE + 3; n += 1) {
      const id = itemId(1000 + n);
      const takenAt = new Date(Date.UTC(2023, 4, 5, 8) + n * 1000).toISOString();
      insertItem.run(
        id,
        HOME_ROOT,
        `long-${String(n)}.jpg`,
        `long-${String(n)}.jpg`,
        NOW,
        NOW,
        takenAt,
      );
    }
    const first = reader.memoryItems(alice, 'day_out:2023-05-05', AT, undefined);
    expect(first.items).toHaveLength(DRIVE_PAGE_SIZE);
    const second = reader.memoryItems(alice, 'day_out:2023-05-05', AT, first.next ?? '');
    expect(second.items).toHaveLength(3);
    expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(
      DRIVE_PAGE_SIZE + 3,
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
    favourites: 0,
    firstSeconds: 0,
    lastSeconds: 1,
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

describe('query plans on a 100k library', () => {
  it('reads one day or one year through the capture-time index', () => {
    const insertItem = database.prepare(
      `insert into drive_items (id, root_id, rel_path, name, kind, mime, bytes, integrity, modified_at,
         added_at, starred, rev, etag, outside, thumb_state, taken_at, width, height)
       values (?, ?, ?, ?, 'image', 'image/jpeg', 1, 'unknown', ?, ?, 0, 1, 'e', 0, 'none', ?, 4, 3)`,
    );
    const insertMedia = database.prepare(
      `insert into drive_media (item_id, time_source, preview_state, poster_state, playable_state)
       values (?, 'metadata', 'ready', 'none', 'none')`,
    );
    database.exec('begin');
    for (let n = 1; n <= 100_000; n += 1) {
      const id = itemId(n);
      const takenAt = new Date(Date.UTC(2016, 0, 1) + n * 3_000_000).toISOString();
      insertItem.run(id, HOME_ROOT, `${String(n)}.jpg`, `${String(n)}.jpg`, NOW, NOW, takenAt);
      insertMedia.run(id);
    }
    database.exec('commit');
    database.exec('analyze');
    for (const range of [
      { fromDay: '2022-05-05', toDay: '2022-05-05' },
      { fromDay: '2022-01-01', toDay: '2022-12-31' },
    ]) {
      const statement = daysStatement(alice, range);
      const plan = database
        .prepare(`explain query plan ${statement.text}`)
        .all({ ...statement.parameters })
        .map((row) => String(row['detail']))
        .join('\n');
      expect(plan).toContain('drive_items_by_taken');
      expect(plan).not.toMatch(/SCAN i\b/);
    }
    expect(reader.list(alice, AT).length).toBeGreaterThan(0);
  }, 120_000);
});
