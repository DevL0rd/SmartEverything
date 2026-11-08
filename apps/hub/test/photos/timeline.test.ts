import { DatabaseSync } from 'node:sqlite';
import {
  ApiError,
  PHOTO_FLAGS,
  TIMELINE_BUCKET,
  TIMELINE_PAGE,
  hasPhotoFlag,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/service-read';
import {
  FLAGS_SQL,
  TIMELINE_PAGE_SIZE,
  TimelineReader,
  aspectOf,
  bucketsStatement,
  decodeCursor,
  encodeCursor,
  pageStatement,
} from '../../src/photos/timeline';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, type SqlParameters } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const ALICE_ROOT = '0f000000-0000-4000-8000-000000000002';
const BOB_ROOT = '0f000000-0000-4000-8000-000000000003';
const HIDDEN_ROOT = '0f000000-0000-4000-8000-000000000004';
const STACK = '0e000000-0000-4000-8000-000000000001';

type Fields = Record<string, string | number | Uint8Array | null>;

interface Seed {
  readonly n: number;
  readonly root?: string;
  readonly kind?: 'image' | 'video';
  readonly takenAt: string;
  readonly offset?: number | null;
  readonly starred?: boolean;
  readonly name?: string;
  readonly relPath?: string;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly orientation?: number | null;
  readonly durationMs?: number;
  readonly thumbhash?: Uint8Array | null;
  readonly stackId?: string | null;
  readonly motionClipId?: string | null;
  readonly liveId?: string | null;
  readonly placeId?: string | null;
  readonly preview?: 'none' | 'ready' | 'failed';
}

let database: DatabaseSync;
let context: StoreContext;
let reader: TimelineReader;
let alice: DriveActor;
let bob: DriveActor;
let owner: DriveActor;

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
  owner = { profileId: aliceId, owner: true };
  insertRoot(HOME_ROOT, 'home', null, 1);
  insertRoot(ALICE_ROOT, 'person', aliceId, 1);
  insertRoot(BOB_ROOT, 'person', bobId, 1);
  insertRoot(HIDDEN_ROOT, 'home', null, 0);
  reader = new TimelineReader(context);
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

const DEFAULTS: Omit<Required<Seed>, 'n' | 'takenAt'> = {
  root: HOME_ROOT,
  kind: 'image',
  offset: null,
  starred: false,
  name: '',
  relPath: '',
  width: 400,
  height: 300,
  orientation: null,
  durationMs: 1000,
  thumbhash: null,
  stackId: null,
  motionClipId: null,
  liveId: null,
  placeId: null,
  preview: 'ready',
};

function itemFields(input: Seed, id: string): Fields {
  const item = { ...DEFAULTS, ...input };
  const name = item.name === '' ? `${String(item.n)}.bin` : item.name;
  return {
    id,
    root_id: item.root,
    rel_path: item.relPath === '' ? name : item.relPath,
    name,
    kind: item.kind,
    mime: item.kind === 'image' ? 'image/jpeg' : 'video/mp4',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: item.starred ? 1 : 0,
    rev: 3,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: item.takenAt,
    width: item.width,
    height: item.height,
    orientation: item.orientation,
    duration_ms: item.kind === 'video' ? item.durationMs : null,
  };
}

function mediaFields(input: Seed, id: string): Fields {
  const item = { ...DEFAULTS, ...input };
  return {
    item_id: id,
    time_source: 'metadata',
    tz_offset_min: item.offset,
    thumbhash: item.thumbhash,
    preview_state: item.preview,
    preview_reason: item.preview === 'failed' ? 'decode failed' : null,
    poster_state: 'ready',
    playable_state: 'ready',
    motion_clip_id: item.motionClipId,
    live_id: item.liveId,
    stack_id: item.stackId,
    place_id: item.placeId,
  };
}

function seed(item: Seed): string {
  const id = itemId(item.n);
  insert('drive_items', itemFields(item, id));
  insert('drive_media', mediaFields(item, id));
  return id;
}

function stack(id: string, cover: string | null): void {
  insert('drive_stacks', { id, kind: 'burst', cover_item_id: null });
  if (cover !== null) {
    database.prepare('update drive_stacks set cover_item_id = ? where id = ?').run(cover, id);
  }
}

describe('month buckets', () => {
  it('counts photos and videos by the month they were taken in, newest first', () => {
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z' });
    seed({ n: 2, takenAt: '2026-03-11T10:00:00.000Z', kind: 'video' });
    seed({ n: 3, takenAt: '2025-12-31T10:00:00.000Z' });
    const buckets = reader.buckets(owner, { filter: 'all' });
    expect(buckets).toEqual([
      { month: '2026-03', count: 2 },
      { month: '2025-12', count: 1 },
    ]);
    for (const bucket of buckets) {
      TIMELINE_BUCKET.parse(bucket);
    }
  });

  it('puts a photo in the month of its own clock, not in UTC', () => {
    seed({ n: 1, takenAt: '2026-03-01T00:30:00.000Z', offset: -60 });
    seed({ n: 2, takenAt: '2026-02-28T23:30:00.000Z', offset: 60 });
    expect(reader.buckets(owner, { filter: 'all' })).toEqual([
      { month: '2026-03', count: 1 },
      { month: '2026-02', count: 1 },
    ]);
  });

  it('counts per filter', () => {
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', starred: true });
    seed({ n: 2, takenAt: '2026-03-10T11:00:00.000Z', kind: 'video' });
    seed({ n: 3, takenAt: '2026-03-10T12:00:00.000Z', name: 'Screenshot_2026.png' });
    seed({
      n: 4,
      takenAt: '2026-03-10T13:00:00.000Z',
      name: 'a.png',
      relPath: 'Pictures/Screenshots/a.png',
    });
    const count = (filter: 'all' | 'favourites' | 'videos' | 'screenshots'): number =>
      reader.buckets(owner, { filter }).reduce((sum, bucket) => sum + bucket.count, 0);
    expect([count('all'), count('favourites'), count('videos'), count('screenshots')]).toEqual([
      4, 1, 1, 2,
    ]);
  });

  it('keeps one tile per stack and hides motion clips of live photos', () => {
    const cover = seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', stackId: null });
    stack(STACK, cover);
    database.prepare('update drive_media set stack_id = ? where item_id = ?').run(STACK, cover);
    seed({ n: 2, takenAt: '2026-03-10T10:00:01.000Z', stackId: STACK });
    seed({ n: 3, takenAt: '2026-03-10T10:00:02.000Z', stackId: STACK });
    const clip = seed({ n: 5, takenAt: '2026-03-10T11:00:00.000Z', kind: 'video' });
    seed({ n: 4, takenAt: '2026-03-10T11:00:00.000Z', motionClipId: clip, liveId: 'live-1' });
    const page = reader.page(owner, '2026-03', { filter: 'all' });
    expect(page.ids).toEqual([itemId(4), itemId(1)]);
    expect(reader.buckets(owner, { filter: 'all' })).toEqual([{ month: '2026-03', count: 2 }]);
  });

  it('shows the lowest id of a stack whose cover is gone', () => {
    stack(STACK, null);
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', stackId: STACK });
    seed({ n: 2, takenAt: '2026-03-10T10:00:01.000Z', stackId: STACK });
    expect(reader.page(owner, '2026-03', { filter: 'all' }).ids).toEqual([itemId(1)]);
  });

  it('scopes the buckets to a place', () => {
    insert('drive_places', {
      id: '1001',
      name: 'Lisbon',
      admin: null,
      country: 'PT',
      lat: 38.7,
      lon: -9.1,
    });
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', placeId: '1001' });
    seed({ n: 2, takenAt: '2026-03-10T11:00:00.000Z' });
    expect(reader.buckets(owner, { filter: 'all', placeId: 1001 })).toEqual([
      { month: '2026-03', count: 1 },
    ]);
  });
});

describe('member scope', () => {
  beforeEach(() => {
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', root: HOME_ROOT });
    seed({ n: 2, takenAt: '2026-03-10T11:00:00.000Z', root: ALICE_ROOT });
    seed({ n: 3, takenAt: '2026-03-10T12:00:00.000Z', root: BOB_ROOT });
    seed({ n: 4, takenAt: '2026-03-10T13:00:00.000Z', root: HIDDEN_ROOT });
  });

  it('shows a member the home and their own folders that are in Photos', () => {
    expect(reader.page(alice, '2026-03', { filter: 'all' }).ids).toEqual([itemId(2), itemId(1)]);
    expect(reader.page(bob, '2026-03', { filter: 'all' }).ids).toEqual([itemId(3), itemId(1)]);
  });

  it('shows the owner every folder that is in Photos', () => {
    expect(reader.page(owner, '2026-03', { filter: 'all' }).ids).toEqual([
      itemId(3),
      itemId(2),
      itemId(1),
    ]);
    expect(reader.buckets(bob, { filter: 'all' })).toEqual([{ month: '2026-03', count: 2 }]);
  });
});

describe('month page columns', () => {
  it('lays one month out as parallel columns that satisfy the contract', () => {
    seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      offset: 120,
      starred: true,
      thumbhash: Uint8Array.from([1, 2, 3, 4]),
    });
    seed({
      n: 2,
      takenAt: '2026-03-10T11:00:00.000Z',
      kind: 'video',
      durationMs: 5000,
      liveId: 'x',
      preview: 'failed',
    });
    seed({ n: 3, takenAt: '2026-04-01T11:00:00.000Z' });
    const page = TIMELINE_PAGE.parse(reader.page(owner, '2026-03', { filter: 'all' }));
    expect(page.ids).toEqual([itemId(2), itemId(1)]);
    expect(page.revs).toEqual([3, 3]);
    expect(page.takenAt).toEqual([
      Date.parse('2026-03-10T11:00:00.000Z'),
      Date.parse('2026-03-10T10:00:00.000Z'),
    ]);
    expect(page.offsetMin).toEqual([null, 120]);
    expect(page.durationMs).toEqual([5000, null]);
    expect(page.thumbhash).toEqual([null, 'AQIDBA==']);
    expect(page.next).toBeNull();
    const [video, photo] = page.flags;
    expect(hasPhotoFlag(video ?? 0, 'video')).toBe(true);
    expect(hasPhotoFlag(video ?? 0, 'live')).toBe(true);
    expect(hasPhotoFlag(video ?? 0, 'unreadable')).toBe(false);
    expect(hasPhotoFlag(photo ?? 0, 'favourite')).toBe(true);
    expect(hasPhotoFlag(photo ?? 0, 'processing')).toBe(false);
  });

  it('flags an image whose preview failed as unreadable and one not yet processed as processing', () => {
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', preview: 'failed' });
    seed({ n: 2, takenAt: '2026-03-10T11:00:00.000Z', preview: 'none' });
    const [pending, failed] = reader.page(owner, '2026-03', { filter: 'all' }).flags;
    expect(hasPhotoFlag(failed ?? 0, 'unreadable')).toBe(true);
    expect(hasPhotoFlag(pending ?? 0, 'processing')).toBe(true);
  });

  it('shows every flag bit in the SQL', () => {
    const bits = Object.values(PHOTO_FLAGS).map((bit) => `then ${String(bit)} else`);
    for (const bit of bits) {
      expect(FLAGS_SQL).toContain(bit);
    }
  });

  it('swaps the shape of sideways photos and gives unknown sizes a square', () => {
    expect(aspectOf({ width: 400, height: 300, orientation: null })).toBeCloseTo(4 / 3);
    expect(aspectOf({ width: 400, height: 300, orientation: 6 })).toBeCloseTo(3 / 4);
    expect(aspectOf({ width: null, height: null, orientation: null })).toBe(1);
  });

  it('returns only the asked month with its own clock', () => {
    seed({ n: 1, takenAt: '2026-03-01T00:30:00.000Z', offset: -60 });
    seed({ n: 2, takenAt: '2026-03-01T01:30:00.000Z' });
    expect(reader.page(owner, '2026-03', { filter: 'all' }).ids).toEqual([itemId(2)]);
    expect(reader.page(owner, '2026-02', { filter: 'all' }).ids).toEqual([itemId(1)]);
  });
});

describe('paging', () => {
  function bulk(count: number): void {
    const statements = [
      database.prepare(
        `insert into drive_items (id, root_id, rel_path, name, kind, mime, bytes, integrity, modified_at,
           added_at, starred, rev, etag, outside, thumb_state, taken_at, width, height)
         values (?, ?, ?, ?, 'image', 'image/jpeg', 1, 'unknown', ?, ?, 0, 1, 'e', 0, 'none', ?, 4, 3)`,
      ),
      database.prepare(
        `insert into drive_media (item_id, time_source, preview_state, poster_state, playable_state)
         values (?, 'metadata', 'ready', 'none', 'none')`,
      ),
    ] as const;
    database.exec('begin');
    for (let n = 1; n <= count; n += 1) {
      const id = itemId(n);
      const takenAt = new Date(Date.UTC(2026, 2, 1) + n * 1000).toISOString();
      statements[0].run(id, HOME_ROOT, `${String(n)}.jpg`, `${String(n)}.jpg`, NOW, NOW, takenAt);
      statements[1].run(id);
    }
    database.exec('commit');
  }

  it('pages a long month with a cursor and no repeats', () => {
    bulk(TIMELINE_PAGE_SIZE + 5);
    const first = reader.page(owner, '2026-03', { filter: 'all' });
    expect(first.ids).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(first.next).not.toBeNull();
    const second = reader.page(owner, '2026-03', { filter: 'all', cursor: first.next ?? '' });
    expect(second.ids).toHaveLength(5);
    expect(second.next).toBeNull();
    expect(new Set([...first.ids, ...second.ids]).size).toBe(TIMELINE_PAGE_SIZE + 5);
    expect(first.ids[0]).toBe(itemId(TIMELINE_PAGE_SIZE + 5));
  });

  it('keeps a full page under one megabyte so a phone loads it in one response', () => {
    bulk(TIMELINE_PAGE_SIZE);
    const page = reader.page(owner, '2026-03', { filter: 'all' });
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024 * 1024);
  });

  it('refuses a cursor it did not give out', () => {
    expect(() => reader.page(owner, '2026-03', { filter: 'all', cursor: 'abc' })).toThrow(ApiError);
    expect(() => decodeCursor(encodeCursor('not a time', itemId(1)))).toThrow(ApiError);
    expect(decodeCursor(encodeCursor('2026-03-01T00:00:00.000Z', itemId(1)))).toEqual({
      takenAt: '2026-03-01T00:00:00.000Z',
      id: itemId(1),
    });
  });
});

describe('query plans on a 100k library', () => {
  const ROWS = 100_000;

  function plan(text: string, parameters: SqlParameters): string {
    return database
      .prepare(`explain query plan ${text}`)
      .all(parameters)
      .map((row) => String(row['detail']))
      .join('\n');
  }

  it('reads a month through the capture-time index and counts months in one pass with keyed lookups', () => {
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
    for (let n = 1; n <= ROWS; n += 1) {
      const id = itemId(n);
      const takenAt = new Date(Date.UTC(2016, 0, 1) + n * 3_000_000).toISOString();
      insertItem.run(id, HOME_ROOT, `${String(n)}.jpg`, `${String(n)}.jpg`, NOW, NOW, takenAt);
      insertMedia.run(id);
    }
    database.exec('commit');
    database.exec('analyze');
    const page = pageStatement(owner, '2024-05', { filter: 'all' });
    const buckets = bucketsStatement(owner, { filter: 'all' });
    const pagePlan = plan(page.text, { ...page.parameters });
    expect(pagePlan).toContain('drive_items_by_taken');
    expect(pagePlan).not.toMatch(/SCAN i\b/);
    const bucketsPlan = plan(buckets.text, { ...buckets.parameters });
    expect(bucketsPlan.match(/\bSCAN\b/g)).toHaveLength(1);
    expect(bucketsPlan).toMatch(/SCAN i/);
    expect(bucketsPlan).toContain('drive_media_by_clip');
    expect(reader.page(owner, '2024-05', { filter: 'all' }).ids.length).toBeGreaterThan(0);
  }, 120_000);
});
