import { DatabaseSync } from 'node:sqlite';
import {
  ApiError,
  PHOTO_FLAGS,
  LIBRARY_BUCKET,
  LIBRARY_PAGE,
  hasPhotoFlag,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import {
  FLAGS_SQL,
  LIBRARY_PAGE_SIZE,
  LibraryReader,
  aspectOf,
  bucketsStatement,
  decodeCursor,
  encodeCursor,
  pageStatement,
} from '../../src/photos/library';
import { AlbumScopes } from '../../src/photos/library-scope';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { insertDriveRow, recordLibraryRow } from './photo-rows';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, type SqlParameters } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const ALICE_ROOT = '0f000000-0000-4000-8000-000000000002';
const BOB_ROOT = '0f000000-0000-4000-8000-000000000003';
const HIDDEN_ROOT = '0f000000-0000-4000-8000-000000000004';
const STACK = '0e000000-0000-4000-8000-000000000001';
const ALBUM = '0d000000-0000-4000-8000-000000000001';
const SMART = '0d000000-0000-4000-8000-000000000002';

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
  readonly explicit?: boolean;
  readonly camera?: readonly [string | null, string | null];
}

let database: DatabaseSync;
let context: StoreContext;
let reader: LibraryReader;
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
  alice = { profileId: aliceId };
  bob = { profileId: bobId };
  insertRoot(HOME_ROOT, 'home', null);
  insertRoot(ALICE_ROOT, 'person', aliceId);
  insertRoot(BOB_ROOT, 'person', bobId);
  reader = new LibraryReader(context, () => 'UTC');
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
  insertDriveRow(database, { id, scope, ownerId });
}

function placed(root: string | undefined): {
  readonly rootId: string;
  readonly inLibrary: boolean;
} {
  return root === HIDDEN_ROOT
    ? { rootId: HOME_ROOT, inLibrary: false }
    : { rootId: root ?? HOME_ROOT, inLibrary: true };
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
  explicit: true,
  camera: [null, null],
};

function itemFields(input: Seed, id: string): Fields {
  const item = { ...DEFAULTS, ...input };
  const name = item.name === '' ? `${String(item.n)}.bin` : item.name;
  return {
    id,
    root_id: placed(item.root).rootId,
    rel_path: item.relPath === '' ? name : item.relPath,
    name,
    kind: item.kind,
    mime: item.kind === 'image' ? 'image/jpeg' : 'video/mp4',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 3,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: item.takenAt,
    width: item.width,
    height: item.height,
    orientation: item.orientation,
    duration_ms: item.kind === 'video' ? item.durationMs : null,
    camera_make: item.camera[0],
    camera_model: item.camera[1],
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
  recordLibraryRow(database, {
    id,
    rootId: placed(item.root).rootId,
    kind: item.kind ?? 'image',
    starred: item.starred === true,
    inLibrary: placed(item.root).inLibrary && item.explicit !== false,
  });
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
    const buckets = reader.buckets(alice, { filter: 'all' });
    expect(buckets).toEqual([
      { month: '2026-03', count: 2 },
      { month: '2025-12', count: 1 },
    ]);
    for (const bucket of buckets) {
      LIBRARY_BUCKET.parse(bucket);
    }
  });

  it('puts a photo in the month of its own clock, not in UTC', () => {
    seed({ n: 1, takenAt: '2026-03-01T00:30:00.000Z', offset: -60 });
    seed({ n: 2, takenAt: '2026-02-28T23:30:00.000Z', offset: 60 });
    expect(reader.buckets(alice, { filter: 'all' })).toEqual([
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
      reader.buckets(alice, { filter }).reduce((sum, bucket) => sum + bucket.count, 0);
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
    const page = reader.page(alice, '2026-03', { filter: 'all' });
    expect(page.ids).toEqual([itemId(4), itemId(1)]);
    expect(reader.buckets(alice, { filter: 'all' })).toEqual([{ month: '2026-03', count: 2 }]);
  });

  it('shows the lowest id of a stack whose cover is gone', () => {
    stack(STACK, null);
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', stackId: STACK });
    seed({ n: 2, takenAt: '2026-03-10T10:00:01.000Z', stackId: STACK });
    expect(reader.page(alice, '2026-03', { filter: 'all' }).ids).toEqual([itemId(1)]);
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
    expect(reader.buckets(alice, { filter: 'all', placeId: 1001 })).toEqual([
      { month: '2026-03', count: 1 },
    ]);
  });
});

describe('who sees which photos', () => {
  const ids = (actor: DriveActor): readonly string[] =>
    reader.page(actor, '2026-03', { filter: 'all' }).ids;

  it('shows the Shared Drive members to everyone and each person only their own drive', () => {
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', root: HOME_ROOT });
    seed({ n: 2, takenAt: '2026-03-10T11:00:00.000Z', root: ALICE_ROOT });
    seed({ n: 3, takenAt: '2026-03-10T12:00:00.000Z', root: BOB_ROOT });
    seed({ n: 4, takenAt: '2026-03-10T13:00:00.000Z', root: HIDDEN_ROOT });
    expect(ids(alice)).toEqual([itemId(2), itemId(1)]);
    expect(ids(bob)).toEqual([itemId(3), itemId(1)]);
    expect(reader.buckets(bob, { filter: 'all' })).toEqual([{ month: '2026-03', count: 2 }]);
  });

  it('shows a manual upload under Photos of a personal drive without any explicit row', () => {
    const upload = seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      root: ALICE_ROOT,
      relPath: 'Photos/2026/upload.jpg',
      explicit: false,
    });
    expect(ids(alice)).toEqual([upload]);
  });

  it('drops a file moved out of Photos unless it has an explicit row', () => {
    seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      root: ALICE_ROOT,
      relPath: 'Documents/moved.jpg',
      explicit: false,
    });
    const kept = seed({
      n: 2,
      takenAt: '2026-03-10T11:00:00.000Z',
      root: ALICE_ROOT,
      relPath: 'Documents/kept.jpg',
    });
    expect(ids(alice)).toEqual([kept]);
  });

  it('keeps Photos of one person from every other person, the Hub owner included', () => {
    const own = seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      root: ALICE_ROOT,
      relPath: 'Photos/a.jpg',
      explicit: false,
    });
    expect(ids(alice)).toEqual([own]);
    expect(ids(bob)).toEqual([]);
    expect(reader.buckets(bob, { filter: 'all' })).toEqual([]);
  });

  it('does not count a Photos folder of the Shared Drive as members', () => {
    seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      root: HOME_ROOT,
      relPath: 'Photos/a.jpg',
      explicit: false,
    });
    expect(ids(alice)).toEqual([]);
    expect(ids(bob)).toEqual([]);
  });

  it('lets a grant show a shared photo to the grantee only', () => {
    const shared = seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      root: ALICE_ROOT,
      relPath: 'Photos/shared.jpg',
      explicit: false,
    });
    seed({
      n: 2,
      takenAt: '2026-03-10T11:00:00.000Z',
      root: ALICE_ROOT,
      relPath: 'Photos/private.jpg',
      explicit: false,
    });
    insert('drive_grants', {
      id: itemId(900),
      item_id: shared,
      profile_id: bob.profileId,
      role: 'view',
      granted_by: alice.profileId,
      created_at: NOW,
    });
    expect(ids(bob)).toEqual([shared]);
    expect(ids(alice)).toEqual([itemId(2), shared]);
  });

  it('makes favourites personal', () => {
    seed({ n: 1, takenAt: '2026-03-10T10:00:00.000Z', root: HOME_ROOT });
    insert('drive_stars', { profile_id: alice.profileId, item_id: itemId(1) });
    const favourites = (actor: DriveActor): number =>
      reader
        .buckets(actor, { filter: 'favourites' })
        .reduce((sum, bucket) => sum + bucket.count, 0);
    expect(favourites(alice)).toBe(1);
    expect(favourites(bob)).toBe(0);
  });
});

describe('library scopes', () => {
  const total = (scope: Parameters<LibraryReader['buckets']>[1]): number =>
    reader.buckets(alice, scope).reduce((sum, bucket) => sum + bucket.count, 0);

  function index(n: number, words: string): void {
    insert('drive_items_search', {
      item_id: itemId(n),
      name: words,
      path: words,
      camera: '',
      albums: '',
      dates: '',
    });
  }

  beforeEach(() => {
    insert('drive_places', {
      id: '1001',
      name: 'Lisbon',
      admin: null,
      country: 'PT',
      lat: 38.7,
      lon: -9.1,
    });
    seed({
      n: 1,
      takenAt: '2026-03-10T10:00:00.000Z',
      placeId: '1001',
      camera: ['Google', 'Pixel 9'],
    });
    seed({ n: 2, takenAt: '2026-04-11T10:00:00.000Z', camera: ['Canon', 'EOS R'] });
    seed({ n: 3, takenAt: '2026-05-12T10:00:00.000Z' });
    index(1, 'beach sunset');
    index(2, 'family dinner');
    index(3, 'beach walk');
  });

  it('narrows the buckets and the page by text through the search index', () => {
    expect(total({ filter: 'all', text: 'beach' })).toBe(2);
    expect(total({ filter: 'all', text: 'dinn' })).toBe(1);
    expect(total({ filter: 'all', text: '!!!' })).toBe(0);
    expect(reader.page(alice, '2026-03', { filter: 'all', text: 'beach' }).ids).toEqual([
      itemId(1),
    ]);
    expect(reader.page(alice, '2026-03', { filter: 'all', text: 'dinner' }).ids).toEqual([]);
  });

  it('narrows by country, camera and place', () => {
    expect(total({ filter: 'all', countryCode: 'pt' })).toBe(1);
    expect(total({ filter: 'all', countryCode: 'JP' })).toBe(0);
    expect(total({ filter: 'all', camera: 'google pixel 9' })).toBe(1);
    expect(total({ filter: 'all', camera: 'Canon' })).toBe(0);
    expect(total({ filter: 'all', placeId: 1001 })).toBe(1);
  });

  it('narrows videos by a duration bucket', () => {
    seed({ n: 4, kind: 'video', takenAt: '2026-05-13T10:00:00.000Z', durationMs: 30_000 });
    seed({ n: 5, kind: 'video', takenAt: '2026-05-14T10:00:00.000Z', durationMs: 120_000 });
    seed({ n: 6, kind: 'video', takenAt: '2026-05-15T10:00:00.000Z', durationMs: 7_200_000 });
    expect(total({ filter: 'videos' })).toBe(3);
    expect(total({ filter: 'videos', duration: 'under_1m' })).toBe(1);
    expect(total({ filter: 'videos', duration: '1_to_10m' })).toBe(1);
    expect(total({ filter: 'videos', duration: '10_to_60m' })).toBe(0);
    expect(total({ filter: 'videos', duration: 'over_60m' })).toBe(1);
  });

  it('narrows by a range of days inclusive of both ends', () => {
    expect(total({ filter: 'all', from: '2026-04-11', to: '2026-05-12' })).toBe(2);
    expect(total({ filter: 'all', from: '2026-04-12' })).toBe(1);
    expect(total({ filter: 'all', to: '2026-03-10' })).toBe(1);
  });

  it('narrows by a manual album and by a smart album', () => {
    insert('drive_albums', {
      id: ALBUM,
      title: 'Trip',
      kind: 'manual',
      surface: 'photos',
      scope: 'person',
      owner_profile_id: alice.profileId,
      item_count: 1,
      created_at: NOW,
      updated_at: NOW,
    });
    insert('drive_album_items', {
      album_id: ALBUM,
      item_id: itemId(2),
      position: 1,
      added_at: NOW,
    });
    expect(reader.page(alice, '2026-04', { filter: 'all', albumId: ALBUM }).ids).toEqual([
      itemId(2),
    ]);
    expect(total({ filter: 'all', albumId: ALBUM })).toBe(1);
    insert('drive_albums', {
      id: SMART,
      title: 'Canon',
      kind: 'smart',
      rule: JSON.stringify({
        match: 'all',
        rules: [{ kind: 'text', field: 'camera', contains: 'canon' }],
      }),
      surface: 'photos',
      scope: 'person',
      owner_profile_id: alice.profileId,
      item_count: 1,
      created_at: NOW,
      updated_at: NOW,
    });
    expect(total({ filter: 'all', albumId: SMART })).toBe(1);
  });

  it('refuses an album that is not the person to see', () => {
    insert('drive_albums', {
      id: ALBUM,
      title: 'Bob',
      kind: 'manual',
      surface: 'photos',
      scope: 'person',
      owner_profile_id: bob.profileId,
      item_count: 0,
      created_at: NOW,
      updated_at: NOW,
    });
    expect(() => reader.buckets(alice, { filter: 'all', albumId: ALBUM })).toThrow(ApiError);
  });

  it('composes the tab filter with every narrowing', () => {
    insert('drive_stars', { profile_id: alice.profileId, item_id: itemId(3) });
    expect(total({ filter: 'favourites', text: 'beach' })).toBe(1);
    expect(total({ filter: 'favourites', text: 'dinner' })).toBe(0);
    expect(total({ filter: 'videos', text: 'beach' })).toBe(0);
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
    const page = LIBRARY_PAGE.parse(reader.page(alice, '2026-03', { filter: 'all' }));
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
    const [pending, failed] = reader.page(alice, '2026-03', { filter: 'all' }).flags;
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
    expect(reader.page(alice, '2026-03', { filter: 'all' }).ids).toEqual([itemId(2)]);
    expect(reader.page(alice, '2026-02', { filter: 'all' }).ids).toEqual([itemId(1)]);
  });
});

describe('paging', () => {
  function bulk(count: number): void {
    const statements = [
      database.prepare(
        `insert into drive_items (id, root_id, rel_path, name, kind, mime, bytes, integrity, modified_at,
           added_at, rev, etag, outside, thumb_state, taken_at, width, height)
         values (?, ?, ?, ?, 'image', 'image/jpeg', 1, 'unknown', ?, ?, 1, 'e', 0, 'none', ?, 4, 3)`,
      ),
      database.prepare(
        `insert into drive_media (item_id, time_source, preview_state, poster_state, playable_state)
         values (?, 'metadata', 'ready', 'none', 'none')`,
      ),
      database.prepare('insert into drive_photo_library (item_id, root_id) values (?, ?)'),
    ] as const;
    database.exec('begin');
    for (let n = 1; n <= count; n += 1) {
      const id = itemId(n);
      const takenAt = new Date(Date.UTC(2026, 2, 1) + n * 1000).toISOString();
      statements[0].run(id, HOME_ROOT, `${String(n)}.jpg`, `${String(n)}.jpg`, NOW, NOW, takenAt);
      statements[1].run(id);
      statements[2].run(id, HOME_ROOT);
    }
    database.exec('commit');
  }

  it('pages a long month with a cursor and no repeats', () => {
    bulk(LIBRARY_PAGE_SIZE + 5);
    const first = reader.page(alice, '2026-03', { filter: 'all' });
    expect(first.ids).toHaveLength(LIBRARY_PAGE_SIZE);
    expect(first.next).not.toBeNull();
    const second = reader.page(alice, '2026-03', { filter: 'all', cursor: first.next ?? '' });
    expect(second.ids).toHaveLength(5);
    expect(second.next).toBeNull();
    expect(new Set([...first.ids, ...second.ids]).size).toBe(LIBRARY_PAGE_SIZE + 5);
    expect(first.ids[0]).toBe(itemId(LIBRARY_PAGE_SIZE + 5));
  });

  it('keeps a full page under one megabyte so a phone loads it in one response', () => {
    bulk(LIBRARY_PAGE_SIZE);
    const page = reader.page(alice, '2026-03', { filter: 'all' });
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024 * 1024);
  });

  it('refuses a cursor it did not give out', () => {
    expect(() => reader.page(alice, '2026-03', { filter: 'all', cursor: 'abc' })).toThrow(ApiError);
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
         added_at, rev, etag, outside, thumb_state, taken_at, width, height)
       values (?, ?, ?, ?, 'image', 'image/jpeg', 1, 'unknown', ?, ?, 1, 'e', 0, 'none', ?, 4, 3)`,
    );
    const insertMedia = database.prepare(
      `insert into drive_media (item_id, time_source, preview_state, poster_state, playable_state)
       values (?, 'metadata', 'ready', 'none', 'none')`,
    );
    const insertLibrary = database.prepare(
      'insert into drive_photo_library (item_id, root_id) values (?, ?)',
    );
    database.exec('begin');
    for (let n = 1; n <= ROWS; n += 1) {
      const id = itemId(n);
      const takenAt = new Date(Date.UTC(2016, 0, 1) + n * 3_000_000).toISOString();
      insertItem.run(id, HOME_ROOT, `${String(n)}.jpg`, `${String(n)}.jpg`, NOW, NOW, takenAt);
      insertMedia.run(id);
      insertLibrary.run(id, HOME_ROOT);
    }
    database.exec('commit');
    database.exec('analyze');
    const albums = new AlbumScopes(context, () => 'UTC');
    const page = pageStatement(alice, '2024-05', { filter: 'all' }, albums);
    const buckets = bucketsStatement(alice, { filter: 'all' }, albums);
    const pagePlan = plan(page.text, { ...page.parameters });
    expect(pagePlan).toContain('drive_items_by_taken');
    expect(pagePlan).not.toMatch(/SCAN i\b/);
    const bucketsPlan = plan(buckets.text, { ...buckets.parameters });
    expect(bucketsPlan.match(/\bSCAN\b/g)).toHaveLength(1);
    expect(bucketsPlan).toMatch(/SCAN i/);
    expect(bucketsPlan).toContain('drive_media_by_clip');
    const scoped = pageStatement(alice, '2024-05', { filter: 'all', text: 'jpg' }, albums);
    expect(plan(scoped.text, { ...scoped.parameters })).toContain('drive_items_search');
    expect(reader.page(alice, '2024-05', { filter: 'all' }).ids.length).toBeGreaterThan(0);
  }, 120_000);
});
