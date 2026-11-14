import { DatabaseSync } from 'node:sqlite';
import { ApiError, DUPLICATE_GROUP } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { DuplicatesService, bestFirst, type DuplicateChanges } from '../../src/photos/duplicates';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { insertDriveRow, recordLibraryRow } from './photo-rows';
import { DriveAlbumsRepository } from '../../src/store/repositories/drive-albums';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const ALICE_ROOT = '0f000000-0000-4000-8000-000000000002';
const BOB_ROOT = '0f000000-0000-4000-8000-000000000003';
const ALBUM = '0a000000-0000-4000-8000-000000000001';
const PRIVATE_ALBUM = '0a000000-0000-4000-8000-000000000002';

const sha = (digit: string): string => digit.repeat(64);

type Fields = Record<string, string | number | null>;

interface Seed {
  readonly n: number;
  readonly sha: string;
  readonly root?: string;
  readonly library?: boolean;
  readonly kind?: 'image' | 'video' | 'document';
  readonly bytes?: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly modifiedAt?: string;
  readonly starred?: boolean;
}

let database: DatabaseSync;
let context: StoreContext;
let alice: DriveActor;
let bob: DriveActor;
let trashed: string[][];
let starred: string[];
let service: DuplicatesService;
let albums: DriveAlbumsRepository;

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
  trashed = [];
  starred = [];
  const changes: DuplicateChanges = {
    trash: (itemIds) => {
      trashed.push([...itemIds]);
      return Promise.resolve();
    },
    star: (itemId) => {
      starred.push(itemId);
      return Promise.resolve();
    },
  };
  service = new DuplicatesService(context, changes);
  albums = new DriveAlbumsRepository(context);
  albums.insert({
    id: ALBUM,
    title: 'Home',
    kind: 'manual',
    surface: 'photos',
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
  });
  albums.insert({
    id: PRIVATE_ALBUM,
    title: 'Alice only',
    kind: 'manual',
    surface: 'photos',
    scope: 'person',
    ownerProfileId: aliceId,
    coverItemId: null,
  });
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

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-1${String(n).padStart(11, '0')}`;
}

function seed(item: Seed): string {
  const id = itemId(item.n);
  const kind = item.kind ?? 'image';
  const visual =
    kind === 'document' ? {} : { width: item.width ?? 100, height: item.height ?? 100 };
  insert('drive_items', {
    id,
    root_id: item.root ?? HOME_ROOT,
    rel_path: `${String(item.n)}.bin`,
    name: `${String(item.n)}.bin`,
    kind,
    mime: kind === 'image' ? 'image/jpeg' : 'application/octet-stream',
    bytes: item.bytes ?? 10,
    sha256: item.sha,
    integrity: 'ok',
    modified_at: item.modifiedAt ?? NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    ...visual,
  });
  recordLibraryRow(database, {
    id,
    rootId: item.root ?? HOME_ROOT,
    kind,
    starred: item.starred === true,
    inLibrary: item.library !== false,
  });
  return id;
}

function ids(...numbers: readonly number[]): string[] {
  return numbers.map(itemId);
}

describe('the suggested keeper', () => {
  const member = {
    id: 'b',
    bytes: 10,
    modifiedAt: NOW,
    starred: false,
    pixels: 100,
  };

  it('prefers the most pixels, then the most bytes, then the newest, then the lowest id', () => {
    const order = (...list: (typeof member)[]): string[] =>
      [...list].sort(bestFirst).map((one) => one.id);
    expect(order(member, { ...member, id: 'a', pixels: 400 })).toEqual(['a', 'b']);
    expect(order(member, { ...member, id: 'a', bytes: 20 })).toEqual(['a', 'b']);
    expect(order(member, { ...member, id: 'a', modifiedAt: '2026-11-08T00:00:00.000Z' })).toEqual([
      'a',
      'b',
    ]);
    expect(order({ ...member, id: 'z' }, member)).toEqual(['b', 'z']);
  });
});

describe('the groups', () => {
  it('lists exact copies with the keeper, the reclaimable bytes and groups the schema accepts', () => {
    seed({ n: 1, sha: sha('a'), bytes: 50, width: 10, height: 10 });
    seed({ n: 2, sha: sha('a'), bytes: 50, width: 200, height: 200 });
    seed({ n: 3, sha: sha('a'), root: ALICE_ROOT, bytes: 50, width: 10, height: 10 });
    seed({ n: 4, sha: sha('b'), bytes: 30 });
    const page = service.groups(alice, { media: true }, undefined);
    expect(page.groups).toHaveLength(1);
    const [group] = page.groups;
    expect(group?.keeperItemId).toBe(itemId(2));
    expect(group?.reclaimableBytes).toBe(100);
    expect(group?.items.map((item) => item.id)[0]).toBe(itemId(2));
    expect(DUPLICATE_GROUP.safeParse(group).success).toBe(true);
    expect(page.next).toBeNull();
  });

  it('finds duplicates for every person only among the photos they can open', () => {
    seed({ n: 1, sha: sha('a'), root: ALICE_ROOT });
    seed({ n: 2, sha: sha('a'), root: ALICE_ROOT });
    seed({ n: 3, sha: sha('b'), root: BOB_ROOT });
    seed({ n: 4, sha: sha('b'), root: HOME_ROOT });
    seed({ n: 5, sha: sha('b'), root: HOME_ROOT });
    expect(service.groups(alice, { media: true }, undefined).groups.map((g) => g.sha256)).toEqual([
      sha('a'),
      sha('b'),
    ]);
    expect(service.groups(bob, { media: true }, undefined).groups.map((g) => g.sha256)).toEqual([
      sha('b'),
    ]);
    expect(service.stats(bob, { media: true })).toMatchObject({ groups: 1, extraCopies: 2 });
  });

  it('puts the group that wins back most first and pages by that order', () => {
    seed({ n: 1, sha: sha('a'), bytes: 10 });
    seed({ n: 2, sha: sha('a'), bytes: 10 });
    seed({ n: 3, sha: sha('b'), bytes: 900 });
    seed({ n: 4, sha: sha('b'), bytes: 900 });
    expect(service.groups(alice, { media: true }, undefined).groups.map((g) => g.sha256)).toEqual([
      sha('b'),
      sha('a'),
    ]);
    expect(() => service.groups(alice, { media: true }, 'garbage')).toThrow(ApiError);
  });

  it('counts only what the viewer may see and what the photos library shows', () => {
    seed({ n: 1, sha: sha('a'), root: ALICE_ROOT });
    seed({ n: 2, sha: sha('a'), root: ALICE_ROOT });
    seed({ n: 3, sha: sha('b'), library: false });
    seed({ n: 4, sha: sha('b'), library: false });
    seed({ n: 5, sha: sha('c'), kind: 'document' });
    seed({ n: 6, sha: sha('c'), kind: 'document' });
    expect(service.groups(alice, { media: true }, undefined).groups).toHaveLength(1);
    expect(service.groups(bob, { media: true }, undefined).groups).toHaveLength(0);
    expect(service.groups(alice, { media: true }, undefined).groups).toHaveLength(1);
  });

  it('serves the Drive view over every file kind and folder, optionally in one root', () => {
    seed({ n: 1, sha: sha('c'), kind: 'document', root: ALICE_ROOT });
    seed({ n: 2, sha: sha('c'), kind: 'document', root: ALICE_ROOT });
    seed({ n: 3, sha: sha('d'), root: HOME_ROOT });
    seed({ n: 4, sha: sha('d'), root: ALICE_ROOT });
    expect(service.groups(alice, { media: false }, undefined).groups).toHaveLength(2);
    expect(
      service.groups(alice, { media: false, rootId: ALICE_ROOT }, undefined).groups,
    ).toHaveLength(1);
  });
});

describe('not duplicates', () => {
  it('hides the group for that person for good and leaves others alone', () => {
    seed({ n: 1, sha: sha('a') });
    seed({ n: 2, sha: sha('a') });
    service.markNotDuplicates(alice, [sha('a')]);
    service.markNotDuplicates(alice, [sha('b')]);
    expect(service.groups(alice, { media: true }, undefined).groups).toHaveLength(0);
    expect(service.stats(alice, { media: true }).groups).toBe(0);
    expect(service.groups(bob, { media: true }, undefined).groups).toHaveLength(1);
    const again = new DuplicatesService(context, {
      trash: (): Promise<void> => Promise.resolve(),
      star: (): Promise<void> => Promise.resolve(),
    });
    expect(again.groups(alice, { media: true }, undefined).groups).toHaveLength(0);
  });
});

describe('the stats', () => {
  it('counts groups, extra copies, the bytes to win back and the sources', () => {
    seed({ n: 1, sha: sha('a'), bytes: 100 });
    seed({ n: 2, sha: sha('a'), bytes: 100, root: ALICE_ROOT });
    seed({ n: 3, sha: sha('a'), bytes: 100, root: ALICE_ROOT });
    seed({ n: 4, sha: sha('b'), bytes: 40 });
    seed({ n: 5, sha: sha('b'), bytes: 40 });
    seed({ n: 6, sha: sha('c'), bytes: 7 });
    const stats = service.stats(alice, { media: true });
    expect(stats.groups).toBe(2);
    expect(stats.extraCopies).toBe(3);
    expect(stats.bytesBack).toBe(240);
    expect(stats.sources).toEqual([
      { rootId: ALICE_ROOT, copies: 2, bytes: 200 },
      { rootId: HOME_ROOT, copies: 3, bytes: 180 },
    ]);
  });

  it('is empty without duplicates', () => {
    expect(service.stats(alice, { media: true })).toEqual({
      groups: 0,
      extraCopies: 0,
      bytesBack: 0,
      sources: [],
    });
  });
});

describe('keep best', () => {
  it('trashes the losers, never the keeper, and reports the space', async () => {
    seed({ n: 1, sha: sha('a'), bytes: 50, width: 10, height: 10 });
    seed({ n: 2, sha: sha('a'), bytes: 50, width: 200, height: 200 });
    seed({ n: 3, sha: sha('a'), bytes: 50, width: 10, height: 10 });
    const result = await service.keepBest(alice, { scope: 'groups', sha256s: [sha('a')] });
    expect(result).toEqual({ groups: 1, trashed: 2, reclaimedBytes: 100 });
    expect(trashed).toEqual([ids(1, 3)]);
  });

  it('merges albums and the star into the survivor', async () => {
    const keeper = seed({ n: 2, sha: sha('a'), width: 200, height: 200 });
    const loser = seed({ n: 1, sha: sha('a'), starred: true });
    albums.addItems(ALBUM, [loser]);
    albums.addItems(PRIVATE_ALBUM, [loser]);
    await service.keepBest(bob, { scope: 'all' });
    expect(albums.albumsOf(keeper)).toEqual([ALBUM]);
    expect(starred).toEqual([keeper]);
    expect(trashed).toEqual([[loser]]);
  });

  it('adds the survivor to private albums for their owner', async () => {
    const keeper = seed({ n: 2, sha: sha('a'), width: 200, height: 200 });
    const loser = seed({ n: 1, sha: sha('a') });
    albums.addItems(PRIVATE_ALBUM, [loser]);
    await service.keepBest(alice, { scope: 'all' });
    expect(albums.albumsOf(keeper)).toEqual([PRIVATE_ALBUM]);
  });

  it('does not star a survivor that is already starred or when no copy was starred', async () => {
    seed({ n: 2, sha: sha('a'), width: 200, height: 200, starred: true });
    seed({ n: 1, sha: sha('a'), starred: true });
    seed({ n: 4, sha: sha('b'), width: 200, height: 200 });
    seed({ n: 3, sha: sha('b') });
    await service.keepBest(alice, { scope: 'all' });
    expect(starred).toEqual([]);
  });

  it('never groups, names or trashes the copies in another person drive', async () => {
    seed({ n: 1, sha: sha('a'), width: 200, height: 200 });
    seed({ n: 2, sha: sha('a'), root: BOB_ROOT });
    seed({ n: 3, sha: sha('a'), root: BOB_ROOT });
    seed({ n: 4, sha: sha('b'), root: BOB_ROOT });
    seed({ n: 5, sha: sha('b'), root: BOB_ROOT });
    expect(service.groups(alice, { media: true }, undefined).groups).toEqual([]);
    expect(service.stats(alice, { media: true }).groups).toBe(0);
    const result = await service.keepBest(alice, { scope: 'all' });
    expect(result).toEqual({ groups: 0, trashed: 0, reclaimedBytes: 0 });
    expect(trashed).toEqual([]);
    expect(service.groups(bob, { media: true }, undefined).groups).toHaveLength(2);
  });

  it('collapses every group when asked for all', async () => {
    for (let group = 0; group < 3; group += 1) {
      const digest = (group + 1).toString(16).repeat(64);
      seed({ n: group * 2 + 1, sha: digest });
      seed({ n: group * 2 + 2, sha: digest });
    }
    const result = await service.keepBest(alice, { scope: 'all' });
    expect(result.groups).toBe(3);
    expect(trashed).toHaveLength(3);
  });

  it('skips a group that is no longer a duplicate and one hidden as not duplicates', async () => {
    seed({ n: 1, sha: sha('a') });
    seed({ n: 2, sha: sha('b') });
    seed({ n: 3, sha: sha('b') });
    service.markNotDuplicates(alice, [sha('b')]);
    const result = await service.keepBest(alice, {
      scope: 'groups',
      sha256s: [sha('a'), sha('b'), sha('c')],
    });
    expect(result).toEqual({ groups: 0, trashed: 0, reclaimedBytes: 0 });
    expect(trashed).toEqual([]);
  });

  it('leaves what the viewer cannot see alone', async () => {
    seed({ n: 1, sha: sha('a'), root: ALICE_ROOT });
    seed({ n: 2, sha: sha('a'), root: ALICE_ROOT });
    const result = await service.keepBest(bob, { scope: 'groups', sha256s: [sha('a')] });
    expect(result.trashed).toBe(0);
  });
});
