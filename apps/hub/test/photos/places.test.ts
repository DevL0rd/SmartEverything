import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { PLACE_CLUSTER, PLACE_COUNTRY } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DriveActor } from '../../src/drive/service-read';
import {
  PlaceIndex,
  PlacesDatasetError,
  PlacesService,
  parseDataset,
} from '../../src/photos/places';
import {
  PlaceQueries,
  geohashOf,
  geohashPrecision,
  visitsOf,
} from '../../src/photos/places-queries';
import {
  PHOTO_MAP_CLUSTERS,
  PHOTO_MAP_MONTHS,
  PHOTO_MAP_QUERY,
  PHOTO_PLACE_DETAIL,
  PHOTO_PLACE_LIST,
} from '../../src/photos/places-schema';
import { domainClusters, domainCountries } from '../../src/photos/places-routes';
import { StoreContext, StoreNotFoundError } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import {
  DrivePlacesRepository,
  type DrivePlaceRow,
} from '../../src/store/repositories/drive-places';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const ALICE_ROOT = '0f000000-0000-4000-8000-000000000002';
const HIDDEN_ROOT = '0f000000-0000-4000-8000-000000000003';

const CITIES = [
  ['1001', 'Lisbon', 'Lisboa', 'PT', '38.71667', '-9.13333'],
  ['1002', 'Porto', 'Porto', 'PT', '41.14961', '-8.61099'],
  ['1003', 'Madrid', 'Madrid', 'ES', '40.4165', '-3.70256'],
  ['1004', 'Suva', 'Central', 'FJ', '-18.14161', '178.44149'],
  ['1005', 'Apia', '', 'WS', '-13.82', '-171.76'],
] as const;

type Fields = Record<string, string | number | null>;

interface Seed {
  readonly n: number;
  readonly root?: string;
  readonly kind?: 'image' | 'video';
  readonly lat: number | null;
  readonly lon?: number | null;
  readonly takenAt: string | null;
  readonly starred?: boolean;
  readonly offset?: number | null;
}

let database: DatabaseSync;
let context: StoreContext;
let directory: string;
let alice: DriveActor;
let bob: DriveActor;
let owner: DriveActor;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'places-'));
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  const aliceId = profiles.create({ name: 'Alice' }).id;
  const bobId = profiles.create({ name: 'Bob' }).id;
  alice = { profileId: aliceId, owner: false };
  bob = { profileId: bobId, owner: false };
  owner = { profileId: aliceId, owner: true };
  insertRoot(HOME_ROOT, 'home', null, 1);
  insertRoot(ALICE_ROOT, 'person', aliceId, 1);
  insertRoot(HIDDEN_ROOT, 'home', null, 0);
});

afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function insertRoot(id: string, scope: string, ownerId: string | null, inPhotos: number): void {
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
    in_photos: inPhotos,
    skip_patterns: '[]',
    include_hidden: 0,
    created_at: NOW,
    updated_at: NOW,
  });
}

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function seed(item: Seed): string {
  const id = itemId(item.n);
  const kind = item.kind ?? 'image';
  insert('drive_items', {
    id,
    root_id: item.root ?? HOME_ROOT,
    rel_path: `${String(item.n)}.bin`,
    name: `${String(item.n)}.bin`,
    kind,
    mime: kind === 'image' ? 'image/jpeg' : 'video/mp4',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: item.starred === true ? 1 : 0,
    rev: 1,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: item.takenAt,
    place_lat: item.lat,
    place_lon: item.lat === null ? null : (item.lon ?? 0),
  });
  new DriveMediaRepository(context).save({
    item_id: id,
    time_source: 'metadata',
    tz_offset_min: item.offset ?? null,
    thumbhash: null,
    preview_state: 'none',
    preview_reason: null,
    poster_state: 'none',
    poster_reason: null,
    playable_state: 'none',
    playable_reason: null,
    motion_clip_id: null,
    live_id: null,
    burst_id: null,
    stem_key: null,
    stack_id: null,
    place_id: null,
  });
  return id;
}

function writeDataset(rows: readonly (readonly string[])[]): string {
  const path = join(directory, 'cities.tsv.gz');
  writeFileSync(path, gzipSync(Buffer.from(`${rows.map((row) => row.join('\t')).join('\n')}\n`)));
  return path;
}

function service(path: string): PlacesService {
  return new PlacesService({ context, datasetPath: path, log: testLogger() });
}

function assignAll(places: PlacesService, numbers: readonly number[]): void {
  for (const n of numbers) places.assign(itemId(n));
}

function placeOf(n: number): string | null {
  return new DriveMediaRepository(context).byId(itemId(n)).place_id;
}

async function loaded(): Promise<PlacesService> {
  const places = service(writeDataset(CITIES));
  await places.load();
  return places;
}

function seedTrip(): void {
  seed({ n: 1, lat: 38.72, lon: -9.1, takenAt: '2026-03-01T10:00:00.000Z', starred: true });
  seed({ n: 2, kind: 'video', lat: 38.73, lon: -9.12, takenAt: '2026-03-02T10:00:00.000Z' });
  seed({ n: 3, lat: 38.71, lon: -9.11, takenAt: '2026-03-05T10:00:00.000Z' });
  seed({ n: 4, lat: 41.15, lon: -8.61, takenAt: '2026-04-10T10:00:00.000Z' });
  seed({ n: 5, root: ALICE_ROOT, lat: 40.42, lon: -3.7, takenAt: '2026-05-01T10:00:00.000Z' });
  seed({ n: 6, root: HIDDEN_ROOT, lat: 40.42, lon: -3.7, takenAt: '2026-05-02T10:00:00.000Z' });
  seed({ n: 7, lat: null, takenAt: '2026-05-03T10:00:00.000Z' });
}

describe('the dataset', () => {
  it('parses the rows and turns an empty region into null', () => {
    const rows = parseDataset(gzipSync(Buffer.from('1\tApia\t\tWS\t-13.82\t-171.76\n')));
    expect(rows).toEqual([
      { id: '1', name: 'Apia', admin: null, country: 'WS', lat: -13.82, lon: -171.76 },
    ]);
  });

  it('names the line of an unreadable row', () => {
    const bytes = gzipSync(Buffer.from('1\tApia\t\tWS\t-13.82\t-171.76\n2\tBroken\t\tws\t1\t2\n'));
    expect(() => parseDataset(bytes)).toThrow(PlacesDatasetError);
    expect(() => parseDataset(bytes)).toThrow(/line 2/);
  });
});

describe('the nearest place', () => {
  function rows(): DrivePlaceRow[] {
    return CITIES.map(([id, name, admin, country, lat, lon]) => ({
      id,
      name,
      admin: admin === '' ? null : admin,
      country,
      lat: Number(lat),
      lon: Number(lon),
    }));
  }

  it('answers across the antimeridian from either side', () => {
    const index = new PlaceIndex();
    index.replace([
      { id: 'east', name: 'East', admin: null, country: 'FJ', lat: -17, lon: 179.9 },
      { id: 'west', name: 'West', admin: null, country: 'WS', lat: -17, lon: -179 },
    ]);
    expect(index.nearest(-17, -179.9)?.id).toBe('east');
    expect(index.nearest(-17, 179.5)?.id).toBe('east');
    expect(index.nearest(-17, -179.2)?.id).toBe('west');
  });

  it('names the nearest place for a point far out at sea and has none for an empty index', () => {
    const index = new PlaceIndex();
    index.replace(rows());
    expect(index.nearest(30, -40)?.id).toBe('1001');
    expect(index.nearest(-17.9, 178.9)?.name).toBe('Suva');
    index.replace([]);
    expect(index.nearest(0, 0)).toBeUndefined();
    expect(index.size).toBe(0);
  });
});

describe('loading the dataset', () => {
  it('fills the places once per dataset and records which one it loaded', async () => {
    const path = writeDataset(CITIES);
    const log = captureLogs();
    const first = service(path);
    expect(await first.load()).toEqual({ places: 5, replaced: true });
    expect(await service(path).load()).toEqual({ places: 5, replaced: false });
    expect(new DrivePlacesRepository(context).count()).toEqual(5);
    expect(log.events().filter((event) => event.endsWith('.succeeded'))).toHaveLength(2);
  });

  it('replaces the places and renames the items when the dataset changes', async () => {
    const places = service(writeDataset(CITIES));
    await places.load();
    seed({ n: 1, lat: 38.72, lon: -9.14, takenAt: '2026-03-01T10:00:00.000Z' });
    places.assign(itemId(1));
    expect(placeOf(1)).toBe('1001');
    const changed = service(
      writeDataset([
        ['2001', 'Lisboa', 'Lisboa', 'PT', '38.71667', '-9.13333'],
        ['1002', 'Porto', 'Porto', 'PT', '41.14961', '-8.61099'],
      ]),
    );
    expect(await changed.load()).toEqual({ places: 2, replaced: true });
    expect(placeOf(1)).toBe('2001');
    expect(new DrivePlacesRepository(context).count()).toEqual(2);
  });

  it('places the located items without a place on every start', async () => {
    seed({ n: 1, lat: 38.72, lon: -9.14, takenAt: '2026-03-01T10:00:00.000Z' });
    seed({ n: 2, lat: null, takenAt: '2026-03-01T10:00:00.000Z' });
    await loaded();
    expect(placeOf(1)).toBe('1001');
    expect(placeOf(2)).toBeNull();
  });
});

describe('the bundled dataset', () => {
  const bundled = fileURLToPath(new URL('../../assets/places/cities.tsv.gz', import.meta.url));

  it('loads every city and names the nearest one, also from the open sea and across the antimeridian', async () => {
    const places = service(bundled);
    expect(await places.load()).toEqual({ places: 171_800, replaced: true });
    const rows = new DrivePlacesRepository(context).inCountry('PT');
    expect(rows.length).toBe(962);
    seed({ n: 1, lat: 38.7223, lon: -9.1393, takenAt: '2026-03-01T10:00:00.000Z' });
    seed({ n: 2, lat: 0, lon: -30, takenAt: '2026-03-01T10:00:00.000Z' });
    seed({ n: 3, lat: -17.5, lon: -179.95, takenAt: '2026-03-01T10:00:00.000Z' });
    assignAll(places, [1, 2, 3]);
    const repository = new DrivePlacesRepository(context);
    const everyCity = parseDataset(readFileSync(bundled));
    const nearestTo = (lat: number, lon: number): string | undefined =>
      everyCity
        .map((city) => ({
          id: city.id,
          distance: Math.hypot(
            (((city.lon - lon + 540) % 360) - 180) *
              Math.max(Math.cos((lat * Math.PI) / 180), 0.05),
            city.lat - lat,
          ),
        }))
        .sort((a, b) => a.distance - b.distance)[0]?.id;
    expect(placeOf(1)).toBe(nearestTo(38.7223, -9.1393));
    expect(repository.byId(placeOf(1) ?? '').country).toBe('PT');
    expect(placeOf(2)).toBe(nearestTo(0, -30));
    expect(placeOf(3)).toBe(nearestTo(-17.5, -179.95));
    expect(await service(bundled).load()).toEqual({ places: 171_800, replaced: false });
  }, 120_000);
});

describe('assigning a place', () => {
  it('names the nearest place of a new location and clears it when the location goes', async () => {
    const places = await loaded();
    seed({ n: 1, lat: 41.2, lon: -8.6, takenAt: '2026-03-01T10:00:00.000Z' });
    expect(places.assign(itemId(1))).toBe('1002');
    expect(placeOf(1)).toBe('1002');
    database.exec(
      `update drive_items set place_lat = null, place_lon = null where id = '${itemId(1)}'`,
    );
    expect(places.assign(itemId(1))).toBeNull();
    expect(placeOf(1)).toBeNull();
  });

  it('refuses an item that does not exist', async () => {
    const places = await loaded();
    expect(() => places.assign(itemId(99))).toThrow(StoreNotFoundError);
  });

  it('clears the place of items that lost their location when it sweeps', async () => {
    const places = await loaded();
    seed({ n: 1, lat: 41.2, lon: -8.6, takenAt: '2026-03-01T10:00:00.000Z' });
    places.assign(itemId(1));
    database.exec(
      `update drive_items set place_lat = null, place_lon = null where id = '${itemId(1)}'`,
    );
    await places.assignPending(false);
    expect(placeOf(1)).toBeNull();
  });
});

describe('geohash clusters', () => {
  it('encodes the geohash of a known point', () => {
    const precision = 11;
    const lonCells = 2 ** Math.ceil((precision * 5) / 2);
    const latCells = 2 ** Math.floor((precision * 5) / 2);
    const x = Math.floor(((10.40744 + 180) / 360) * lonCells);
    const y = Math.floor(((57.64911 + 90) / 180) * latCells);
    expect(geohashOf(x, y, precision)).toBe('u4pruydqqvj');
  });

  it('refines the precision as the zoom grows without an upper limit on the zoom', () => {
    expect([0, 1, 2, 6, 22, 40].map(geohashPrecision)).toEqual([1, 1, 2, 4, 12, 12]);
  });

  it('groups items into cells that split as the map zooms in', async () => {
    const places = await loaded();
    seedTrip();
    assignAll(places, [1, 2, 3, 4, 5]);
    const world = new PlaceQueries(context).clusters(owner, PHOTO_MAP_QUERY.parse({ zoom: '0' }));
    expect(PHOTO_MAP_CLUSTERS.parse(world)).toEqual(world);
    expect(world.total).toBe(5);
    expect(world.clusters).toHaveLength(1);
    const near = new PlaceQueries(context).clusters(owner, PHOTO_MAP_QUERY.parse({ zoom: '6' }));
    expect(near.precision).toBe(4);
    expect(near.clusters.map((cluster) => cluster.count)).toEqual([3, 1, 1]);
    const lisbon = near.clusters[0];
    expect(lisbon?.key).toHaveLength(4);
    expect(lisbon?.placeName).toBe('Lisbon');
    expect(lisbon?.coverItemId).toBe(itemId(3));
    expect(lisbon?.first).toBe('2026-03-01T10:00:00.000Z');
    expect(lisbon?.latest).toBe('2026-03-05T10:00:00.000Z');
    expect(lisbon?.lat).toBeCloseTo(38.72, 2);
  });

  it('keeps only the items inside the time range', async () => {
    await loaded();
    seedTrip();
    const query = PHOTO_MAP_QUERY.parse({
      zoom: '6',
      from: '2026-03-02T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
    });
    const result = new PlaceQueries(context).clusters(owner, query);
    expect(result.total).toBe(3);
    expect(result.clusters.map((cluster) => cluster.count)).toEqual([2, 1]);
  });

  it('keeps only the items inside the viewport, also across the antimeridian', () => {
    seed({ n: 1, lat: -17, lon: 179.9, takenAt: '2026-03-01T10:00:00.000Z' });
    seed({ n: 2, lat: -17, lon: -179.9, takenAt: '2026-03-01T10:00:00.000Z' });
    seed({ n: 3, lat: -17, lon: 0, takenAt: '2026-03-01T10:00:00.000Z' });
    const queries = new PlaceQueries(context);
    const across = PHOTO_MAP_QUERY.parse({
      zoom: '0',
      south: '-30',
      north: '0',
      west: '170',
      east: '-170',
    });
    expect(queries.clusters(owner, across).total).toBe(2);
    const plain = PHOTO_MAP_QUERY.parse({
      zoom: '0',
      south: '-30',
      north: '0',
      west: '-10',
      east: '10',
    });
    expect(queries.clusters(owner, plain).total).toBe(1);
  });

  it('refuses an incomplete or inverted viewport', () => {
    expect(PHOTO_MAP_QUERY.safeParse({ zoom: '3', south: '0' }).success).toBe(false);
    expect(
      PHOTO_MAP_QUERY.safeParse({ zoom: '3', south: '10', north: '0', west: '0', east: '5' })
        .success,
    ).toBe(false);
  });

  it('shows a person their own folders, the home folders and nothing outside Photos', async () => {
    await loaded();
    seedTrip();
    const queries = new PlaceQueries(context);
    const zoom = PHOTO_MAP_QUERY.parse({ zoom: '6' });
    expect(queries.clusters(owner, zoom).total).toBe(5);
    expect(queries.clusters(alice, zoom).total).toBe(5);
    expect(queries.clusters(bob, zoom).total).toBe(4);
  });
});

describe('the map months', () => {
  it('counts located items per local month for what the person may see', () => {
    seedTrip();
    seed({ n: 8, lat: 38.7, lon: -9.1, takenAt: '2026-03-31T23:30:00.000Z', offset: 120 });
    const queries = new PlaceQueries(context);
    const months = queries.months(alice);
    expect(PHOTO_MAP_MONTHS.parse(months)).toEqual(months);
    expect(months.months).toEqual([
      { month: '2026-03', count: 3 },
      { month: '2026-04', count: 2 },
      { month: '2026-05', count: 1 },
    ]);
    expect(queries.months(bob).months.map((entry) => entry.month)).toEqual(['2026-03', '2026-04']);
  });
});

describe('the places list', () => {
  it('groups places by country with counts and the newest photo as cover', async () => {
    const places = await loaded();
    seedTrip();
    assignAll(places, [1, 2, 3, 4, 5]);
    const list = new PlaceQueries(context).list(owner);
    expect(PHOTO_PLACE_LIST.parse(list)).toEqual(list);
    expect(list.countries.map((country) => [country.country, country.name, country.count])).toEqual(
      [
        ['PT', 'Portugal', 4],
        ['ES', 'Spain', 1],
      ],
    );
    const portugal = list.countries[0];
    expect(portugal?.places.map((entry) => [entry.place.name, entry.count])).toEqual([
      ['Lisbon', 3],
      ['Porto', 1],
    ]);
    expect(portugal?.places[0]?.coverItemId).toBe(itemId(3));
    expect(portugal?.places[0]?.place.countryName).toBe('Portugal');
    expect(new PlaceQueries(context).list(bob).countries.map((country) => country.count)).toEqual([
      4,
    ]);
  });
});

describe('a place', () => {
  it('counts by kind and favourites and splits days into visits', async () => {
    const places = await loaded();
    seedTrip();
    seed({ n: 9, lat: 38.7, lon: -9.1, takenAt: '2026-03-01T23:30:00.000Z', offset: 60 });
    assignAll(places, [1, 2, 3, 4, 9]);
    const detail = new PlaceQueries(context).detail(owner, '1001');
    expect(PHOTO_PLACE_DETAIL.parse(detail)).toEqual(detail);
    expect(detail).toMatchObject({
      items: 4,
      images: 3,
      videos: 1,
      favourites: 1,
      days: 3,
      first: '2026-03-01T10:00:00.000Z',
      latest: '2026-03-05T10:00:00.000Z',
      coverItemId: itemId(3),
    });
    expect(detail.place).toMatchObject({
      name: 'Lisbon',
      admin: 'Lisboa',
      countryName: 'Portugal',
    });
    expect(detail.visits).toEqual([
      { from: '2026-03-01', to: '2026-03-02', days: 2, count: 3 },
      { from: '2026-03-05', to: '2026-03-05', days: 1, count: 1 },
    ]);
  });

  it('is empty for a person who cannot see its items and refuses an unknown place', async () => {
    const places = await loaded();
    seed({ n: 1, root: ALICE_ROOT, lat: 38.72, lon: -9.14, takenAt: '2026-03-01T10:00:00.000Z' });
    assignAll(places, [1]);
    const queries = new PlaceQueries(context);
    expect(queries.detail(alice, '1001').items).toBe(1);
    expect(queries.detail(bob, '1001')).toMatchObject({ items: 0, coverItemId: null, visits: [] });
    expect(() => queries.detail(bob, 'none')).toThrow(StoreNotFoundError);
  });

  it('joins only consecutive calendar days into one visit', () => {
    expect(
      visitsOf([
        { day: '2026-02-28', count: 1 },
        { day: '2026-03-01', count: 2 },
        { day: '2026-03-03', count: 1 },
      ]),
    ).toEqual([
      { from: '2026-02-28', to: '2026-03-01', days: 2, count: 3 },
      { from: '2026-03-03', to: '2026-03-03', days: 1, count: 1 },
    ]);
  });
});

describe('the domain answers', () => {
  it('turns the place list and the clusters into the Photos contract', async () => {
    const places = await loaded();
    seedTrip();
    assignAll(places, [1, 2, 3, 4, 5]);
    const queries = new PlaceQueries(context);
    const countries = z.array(PLACE_COUNTRY).parse(domainCountries(queries.list(owner)));
    expect(
      countries.map((country) => [country.countryCode, country.country, country.count]),
    ).toEqual([
      ['PT', 'Portugal', 4],
      ['ES', 'Spain', 1],
    ]);
    expect(countries[0]?.places[0]).toMatchObject({
      id: 1001,
      name: 'Lisbon',
      country: 'Portugal',
      countryCode: 'PT',
      count: 3,
      coverItemId: itemId(3),
    });
    expect(countries[0]?.coverItemId).toBe(itemId(3));
    const clusters = z
      .array(PLACE_CLUSTER)
      .parse(domainClusters(queries.clusters(owner, PHOTO_MAP_QUERY.parse({ zoom: '6' }))));
    expect(clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(5);
  });
});
