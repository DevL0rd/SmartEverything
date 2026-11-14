import {
  driveDurationBucket,
  DRIVE_DURATION_BUCKETS,
  type DriveItem,
  type DriveQuery,
  type DriveRecentFilter,
  type DriveRecentPage,
} from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { driveHits } from '../../src/drive/search-provider';
import {
  DriveCursorError,
  DriveFolderRequiredError,
  DriveSearch,
  driveMatchOf,
  driveSearchDocument,
  driveSearchStatement,
} from '../../src/drive/search';
import { DriveRecentReader } from '../../src/drive/recent';
import { DriveStatsReader, fullInMonths, paceBytesPerMonth } from '../../src/drive/stats';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveDaysRepository, type DriveDay } from '../../src/store/repositories/drive-days';
import { DriveFeedRepository } from '../../src/store/repositories/drive-feed';
import {
  DriveItemsRepository,
  type DriveItemDraft,
} from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveGrantsRepository } from '../../src/store/repositories/drive-grants';
import { DriveStarsRepository } from '../../src/store/repositories/drive-stars';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME = '0d000000-0000-4000-8000-000000000001';
const ROBIN_ROOT = '0d000000-0000-4000-8000-000000000002';
const SAM_ROOT = '0d000000-0000-4000-8000-000000000003';
const DEVICE = '0d000000-0000-4000-8000-0000000000d1';
const SHA = 'b'.repeat(64);
const SHA_TWO = 'c'.repeat(64);

let database: DatabaseSync;
let context: StoreContext;
let clock: Date;
let items: DriveItemsRepository;
let feed: DriveFeedRepository;
let days: DriveDaysRepository;
let roots: DriveRootsRepository;
let stars: DriveStarsRepository;
let search: DriveSearch;
let robin: string;
let sam: string;
let grants: DriveGrantsRepository;

let owner: DriveActor;
let member: DriveActor;

function id(index: number): string {
  return `0e000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

type Draft<K extends DriveItem['kind']> = Extract<DriveItemDraft, { readonly kind: K }>;

interface Common {
  readonly id: string;
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly starred: boolean;
  readonly shared: boolean;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly remoteId: string | null;
  readonly remoteRev: string | null;
}

function common(
  index: number,
  name: string,
  fields: { rootId?: string; relPath?: string },
): Common {
  return {
    id: id(index),
    rootId: fields.rootId ?? HOME,
    parentId: null,
    relPath: fields.relPath ?? name,
    name,
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

function document(
  index: number,
  name: string,
  fields: Partial<Draft<'document'>> = {},
): DriveItemDraft {
  return {
    ...common(index, name, fields),
    kind: 'document',
    mime: 'text/plain',
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    ...fields,
  };
}

function photo(index: number, name: string, fields: Partial<Draft<'image'>> = {}): DriveItemDraft {
  return {
    ...common(index, name, fields),
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 100,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    takenAt: '2026-07-14T10:00:00.000Z',
    width: 400,
    height: 300,
    orientation: 1,
    camera: { make: 'Google', model: 'Pixel 9', lens: null },
    exposure: null,
    place: null,
    ...fields,
  };
}

function video(
  index: number,
  name: string,
  durationMs: number,
  fields: Partial<Draft<'video'>> = {},
): DriveItemDraft {
  return {
    ...common(index, name, fields),
    kind: 'video',
    mime: 'video/mp4',
    bytes: 1000,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    takenAt: null,
    width: 1920,
    height: 1080,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
    durationMs,
    ...fields,
  };
}

function folder(
  index: number,
  name: string,
  fields: Partial<Draft<'folder'>> = {},
): DriveItemDraft {
  return { ...common(index, name, fields), kind: 'folder', childCount: 0, bytes: 0, ...fields };
}

function put(draft: DriveItemDraft, albumTitles: readonly string[] = []): DriveItem {
  const { item } = items.write({ item: draft, identity: { dev: '1', ino: draft.id } });
  const document_ = driveSearchDocument(item, albumTitles);
  database
    .prepare(
      'insert into drive_items_search (item_id, name, path, camera, albums, dates) values (?, ?, ?, ?, ?, ?)',
    )
    .run(
      document_.itemId,
      document_.name,
      document_.path,
      document_.camera,
      document_.albums,
      document_.dates,
    );
  return item;
}

function query(fields: Partial<DriveQuery> = {}): DriveQuery {
  return {
    text: null,
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'name', direction: 'asc' },
    cursor: null,
    ...fields,
  };
}

function names(viewer: DriveActor, fields: Partial<DriveQuery> = {}): string[] {
  return search.search(viewer, query(fields), 100).items.map((item) => item.name);
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  clock = new Date(NOW);
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => clock);
  migrate(new Sql(database), MIGRATIONS, NOW, log);
  items = new DriveItemsRepository(context);
  feed = new DriveFeedRepository(context);
  days = new DriveDaysRepository(context);
  roots = new DriveRootsRepository(context, drivePathOf);
  stars = new DriveStarsRepository(context);
  grants = new DriveGrantsRepository(context);
  search = new DriveSearch(context);
  const profiles = new ProfilesRepository(context);
  robin = profiles.create({ name: 'Robin' }).id;
  sam = profiles.create({ name: 'Sam' }).id;
  owner = { profileId: robin };
  member = { profileId: sam };
  roots.insert(sharedDriveRoot(HOME));
  roots.insert(personalDriveRoot(ROBIN_ROOT, robin));
  roots.insert(personalDriveRoot(SAM_ROOT, sam));
});

afterEach(() => {
  database.close();
});

describe('search words', () => {
  it('turns user text into quoted prefix terms and refuses text with no words', () => {
    expect(driveMatchOf('Beach, sum')).toBe('"Beach"* "sum"*');
    expect(driveMatchOf('a" OR b')).toBe('"a"* "OR"* "b"*');
    expect(driveMatchOf(' - ')).toBeNull();
  });

  it('finds items by name, path, camera, album and date words', () => {
    put(photo(1, 'beach.jpg', { relPath: 'holidays/summer/beach.jpg' }), ['Greece']);
    put(document(2, 'notes.txt', { modifiedAt: '2025-03-02T00:00:00.000Z' }));
    const found = (text: string): string[] => names(owner, { text });
    expect(found('beach')).toEqual(['beach.jpg']);
    expect(found('sum')).toEqual(['beach.jpg']);
    expect(found('pixel 9')).toEqual(['beach.jpg']);
    expect(found('greece')).toEqual(['beach.jpg']);
    expect(found('july 2026')).toEqual(['beach.jpg']);
    expect(found('march')).toEqual(['notes.txt']);
    expect(found('beach march')).toEqual([]);
    expect(found('***')).toEqual([]);
  });

  it('ignores search rows whose item is gone', () => {
    const item = put(document(1, 'ghost.txt'));
    items.remove(item.id);
    expect(names(owner, { text: 'ghost' })).toEqual([]);
  });
});

describe('search scope', () => {
  beforeEach(() => {
    put(document(1, 'shared plan.txt'));
    put(document(2, 'robin plan.txt', { rootId: ROBIN_ROOT }));
    put(document(3, 'sam plan.txt', { rootId: SAM_ROOT }));
  });

  it('shows the hub owner only their own drive and the Shared Drive', () => {
    expect(names(owner, { text: 'plan' })).toEqual(['robin plan.txt', 'shared plan.txt']);
  });

  it('shows each person their own drive and the Shared Drive only', () => {
    expect(names(member, { text: 'plan' })).toEqual(['sam plan.txt', 'shared plan.txt']);
  });

  it('keeps the scope when the query names another person drive', () => {
    expect(names(owner, { rootId: SAM_ROOT })).toEqual([]);
  });

  it('finds an item shared with the person and what is inside a shared folder only', () => {
    const folderItem = put(folder(20, 'trip', { rootId: SAM_ROOT }));
    put(document(21, 'trip plan.txt', { rootId: SAM_ROOT, relPath: 'trip/trip plan.txt' }));
    put(document(22, 'tripod plan.txt', { rootId: SAM_ROOT, relPath: 'tripod/tripod plan.txt' }));
    grants.set({ itemId: folderItem.id, profileId: robin, role: 'view' }, sam);
    expect(names(owner, { text: 'plan' })).toEqual([
      'robin plan.txt',
      'shared plan.txt',
      'trip plan.txt',
    ]);
  });
});

describe('search filters', () => {
  it('filters by kind, star, root and taken day range', () => {
    put(photo(1, 'a.jpg'));
    stars.star(robin, id(1));
    put(photo(2, 'b.jpg', { takenAt: '2026-08-01T00:00:00.000Z' }));
    put(document(3, 'c.txt', { rootId: ROBIN_ROOT }));
    expect(names(owner, { kinds: ['image'] })).toEqual(['a.jpg', 'b.jpg']);
    expect(names(owner, { starred: true })).toEqual(['a.jpg']);
    expect(names(owner, { starred: false })).toEqual(['b.jpg', 'c.txt']);
    expect(names(owner, { rootId: ROBIN_ROOT })).toEqual(['c.txt']);
    expect(names(owner, { taken: { from: '2026-07-14', to: '2026-07-14' } })).toEqual(['a.jpg']);
    expect(names(owner, { taken: { from: '2026-07-15', to: null } })).toEqual(['b.jpg']);
    expect(names(owner, { taken: { from: null, to: '2026-07-31' } })).toEqual(['a.jpg']);
  });

  it('buckets durations on the same boundaries as the domain rule', () => {
    const lengths = [0, 59_999, 60_000, 599_999, 600_000, 3_599_999, 3_600_000];
    for (const [index, length] of lengths.entries()) {
      put(video(index + 1, `clip-${String(length)}.mp4`, length));
    }
    put(document(50, 'no-duration.txt'));
    for (const bucket of DRIVE_DURATION_BUCKETS) {
      expect(names(owner, { duration: bucket }).sort()).toEqual(
        lengths
          .filter((length) => driveDurationBucket(length) === bucket)
          .map((length) => `clip-${String(length)}.mp4`)
          .sort(),
      );
    }
  });

  it('limits a search to the descendants of a folder, not to a sibling with the same prefix', () => {
    const trips = put(folder(1, 'trips'));
    put(folder(2, 'trips2'));
    put(document(3, 'inside.txt', { relPath: 'trips/inside.txt', parentId: trips.id }));
    put(document(4, 'deep.txt', { relPath: 'trips/2026/deep.txt' }));
    put(document(5, 'sibling.txt', { relPath: 'trips2/sibling.txt' }));
    expect(names(owner, { folderId: trips.id })).toEqual(['deep.txt', 'inside.txt']);
    const file = put(document(6, 'plain.txt'));
    expect(() => search.search(owner, query({ folderId: file.id }), 10)).toThrow(
      DriveFolderRequiredError,
    );
  });
});

describe('search order and paging', () => {
  beforeEach(() => {
    put(document(1, 'c.txt', { bytes: 30, addedAt: '2026-01-03T00:00:00.000Z' }));
    put(document(2, 'a.txt', { bytes: 30, addedAt: '2026-01-01T00:00:00.000Z' }));
    put(document(3, 'b.txt', { bytes: 10, addedAt: '2026-01-02T00:00:00.000Z' }));
    put(document(4, 'd.txt', { bytes: 20, addedAt: '2026-01-04T00:00:00.000Z' }));
    put(document(5, 'e.txt', { bytes: 20, addedAt: '2026-01-05T00:00:00.000Z' }));
  });

  function pages(fields: Partial<DriveQuery>, limit: number): string[][] {
    const out: string[][] = [];
    let cursor: string | null = null;
    do {
      const page = search.search(owner, query({ ...fields, cursor }), limit);
      out.push(page.items.map((item) => item.name));
      cursor = page.next;
    } while (cursor !== null);
    return out;
  }

  it('walks every item once in each direction and field', () => {
    expect(pages({}, 2)).toEqual([['a.txt', 'b.txt'], ['c.txt', 'd.txt'], ['e.txt']]);
    expect(pages({ sort: { field: 'name', direction: 'desc' } }, 2)).toEqual([
      ['e.txt', 'd.txt'],
      ['c.txt', 'b.txt'],
      ['a.txt'],
    ]);
    expect(pages({ sort: { field: 'addedAt', direction: 'desc' } }, 3)).toEqual([
      ['e.txt', 'd.txt', 'c.txt'],
      ['b.txt', 'a.txt'],
    ]);
  });

  it('breaks ties on equal sort values by id and never repeats or skips', () => {
    const walked = pages({ sort: { field: 'bytes', direction: 'asc' } }, 2).flat();
    expect(walked).toHaveLength(5);
    expect(new Set(walked).size).toBe(5);
    expect(walked[0]).toBe('b.txt');
    expect(walked.slice(1, 3).sort()).toEqual(['d.txt', 'e.txt']);
  });

  it('ends the list exactly at the last page', () => {
    expect(search.search(owner, query(), 5).next).toBeNull();
    expect(search.search(owner, query(), 4).next).not.toBeNull();
  });

  it('refuses a cursor that was not issued or belongs to another sort', () => {
    expect(() => search.search(owner, query({ cursor: 'nonsense' }), 2)).toThrow(DriveCursorError);
    const cursor = search.search(owner, query(), 2).next;
    expect(() =>
      search.search(owner, query({ cursor, sort: { field: 'bytes', direction: 'asc' } }), 2),
    ).toThrow(DriveCursorError);
  });

  it('reads the added-at window through its index', () => {
    const statement = driveSearchStatement(
      owner,
      query({ sort: { field: 'addedAt', direction: 'desc' } }),
      null,
      10,
    );
    const plan = database
      .prepare(`explain query plan ${statement?.text ?? ''}`)
      .all(statement?.parameters ?? {})
      .map((row) => String(row['detail']))
      .join('\n');
    expect(plan).toContain('drive_items_by_added');
  });
});

describe('drive hits for home_search', () => {
  it('returns the tool hit shape with a target that opens the folder of a file or the folder itself', () => {
    const trips = put(folder(1, 'trips'));
    put(photo(2, 'beach.jpg', { relPath: 'trips/beach.jpg', parentId: trips.id }));
    put(document(3, 'top beach notes.txt'));
    const hits = driveHits(search, owner, { query: 'beach', limit: 10 });
    expect(hits.map((hit) => hit.name).sort()).toEqual(['beach.jpg', 'top beach notes.txt']);
    const beach = hits.find((hit) => hit.name === 'beach.jpg');
    expect(beach).toEqual({
      id: id(2),
      name: 'beach.jpg',
      kind: 'image',
      rootId: HOME,
      path: 'trips/beach.jpg',
      target: { kind: 'drive', rootId: HOME, path: '/trips', itemId: id(2), focus: null },
    });
    const top = hits.find((hit) => hit.name === 'top beach notes.txt');
    expect(top?.target).toEqual({
      kind: 'drive',
      rootId: HOME,
      path: '/',
      itemId: id(3),
      focus: null,
    });
    const named = driveHits(search, owner, { query: 'trips', limit: 10 }).find(
      (hit) => hit.kind === 'folder',
    );
    expect(named?.target).toEqual({
      kind: 'drive',
      rootId: HOME,
      path: '/trips',
      itemId: null,
      focus: null,
    });
  });

  it('honours the limit and the viewer scope', () => {
    for (let index = 1; index <= 4; index += 1) put(document(index, `note ${String(index)}.txt`));
    put(document(9, 'note private.txt', { rootId: SAM_ROOT }));
    expect(driveHits(search, owner, { query: 'note', limit: 3 })).toHaveLength(3);
    expect(driveHits(search, owner, { query: 'private', limit: 10 })).toEqual([]);
  });

  it('finds what a person shared with the searcher and nothing else of theirs', () => {
    const shared = put(folder(30, 'shared trip', { rootId: SAM_ROOT }));
    put(
      document(31, 'shared trip map.txt', {
        rootId: SAM_ROOT,
        relPath: 'shared trip/shared trip map.txt',
        parentId: shared.id,
      }),
    );
    put(document(32, 'shared secret.txt', { rootId: SAM_ROOT }));
    expect(driveHits(search, owner, { query: 'shared', limit: 10 })).toEqual([]);
    grants.set({ itemId: shared.id, profileId: robin, role: 'view' }, sam);
    expect(
      driveHits(search, owner, { query: 'shared', limit: 10 })
        .map((hit) => hit.name)
        .sort(),
    ).toEqual(['shared trip', 'shared trip map.txt']);
  });
});

describe('recent', () => {
  const reader = (): DriveRecentReader => new DriveRecentReader(context);

  function append(
    itemId: string,
    op: Parameters<DriveFeedRepository['append']>[0]['op'],
    fields: Partial<Parameters<DriveFeedRepository['append']>[0]> = {},
  ): void {
    clock = new Date(clock.getTime() + 1000);
    feed.append({
      rootId: HOME,
      itemId,
      op,
      rev: 1,
      actorProfileId: null,
      via: 'scan',
      deviceId: null,
      ...fields,
    });
  }

  function read(
    filter: DriveRecentFilter,
    viewer: DriveActor = owner,
    cursor: string | null = null,
  ): DriveRecentPage {
    return reader().read(viewer, { filter, cursor }, 50);
  }

  it('lists opened files newest first and skips never-opened ones', () => {
    put(document(1, 'old.txt'));
    put(document(2, 'new.txt'));
    put(document(3, 'never.txt'));
    items.markOpened(id(1), '2026-11-01T00:00:00.000Z');
    items.markOpened(id(2), '2026-11-02T00:00:00.000Z');
    const page = read('opened');
    expect(page.entries.map((entry) => [entry.kind, entry.item.name])).toEqual([
      ['opened', 'new.txt'],
      ['opened', 'old.txt'],
    ]);
  });

  it('lists added files from create rows with the person, route and device', () => {
    put(document(1, 'made.txt'));
    put(document(2, 'mounted.txt'));
    append(id(1), 'create', { actorProfileId: robin, via: 'app' });
    append(id(2), 'create', { via: 'mount', deviceId: DEVICE });
    const entries = read('added').entries;
    expect(entries.map((entry) => entry.item.name)).toEqual(['mounted.txt', 'made.txt']);
    expect(entries[0]).toMatchObject({ kind: 'added', via: 'mount', deviceId: DEVICE });
    expect(entries[1]).toMatchObject({ kind: 'added', via: 'app', actorProfileId: robin });
  });

  it('lists a changed file once with its latest change and ignores stars and trashing', () => {
    put(document(1, 'edited.txt'));
    put(document(2, 'starred.txt'));
    append(id(1), 'create');
    append(id(1), 'update', { rev: 2, via: 'ai', actorProfileId: robin });
    append(id(1), 'rename', { rev: 3, via: 'app', actorProfileId: robin });
    append(id(2), 'star', { rev: 2 });
    append(id(2), 'trash', { rev: 3 });
    const entries = read('changed').entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'changed', via: 'app', actorProfileId: robin });
    expect(entries[0]?.item.name).toBe('edited.txt');
  });

  it('merges all three kinds by time and pages through them without gaps', () => {
    put(document(1, 'one.txt'));
    put(document(2, 'two.txt'));
    append(id(1), 'create');
    items.markOpened(id(1), '2026-11-07T00:00:10.000Z');
    append(id(2), 'create');
    append(id(1), 'update', { rev: 2 });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = reader().read(owner, { filter: 'everything', cursor }, 2);
      seen.push(...page.entries.map((entry) => `${entry.kind}:${entry.item.name}`));
      cursor = page.next;
    } while (cursor !== null);
    expect(seen).toHaveLength(4);
    expect(new Set(seen)).toEqual(
      new Set(['added:one.txt', 'added:two.txt', 'changed:one.txt', 'opened:one.txt']),
    );
    expect(seen[0]).toBe('opened:one.txt');
  });

  it('drops entries whose item is gone and entries in drives the person cannot open', () => {
    put(document(1, 'gone.txt'));
    put(document(2, 'sam.txt', { rootId: SAM_ROOT }));
    put(document(3, 'robin.txt', { rootId: ROBIN_ROOT }));
    append(id(1), 'create');
    append(id(2), 'create', { rootId: SAM_ROOT });
    append(id(3), 'create', { rootId: ROBIN_ROOT });
    items.remove(id(1));
    expect(read('added').entries.map((entry) => entry.item.name)).toEqual(['robin.txt']);
    expect(read('added', member).entries.map((entry) => entry.item.name)).toEqual(['sam.txt']);
  });

  it('refuses a cursor it did not issue', () => {
    expect(() => read('opened', owner, 'nonsense')).toThrow(DriveCursorError);
  });
});

describe('stats', () => {
  const probe = (): Promise<{ totalBytes: number; freeBytes: number; fsType: string }> =>
    Promise.resolve({ totalBytes: 1000, freeBytes: 400, fsType: 'ext4' });

  function version(
    item: string,
    rev: number,
    stored: { sha: string; bytes: number; purgeAt: string },
  ): void {
    database
      .prepare(
        `insert into drive_versions (id, root_id, item_id, rev, sha256, bytes, at, purge_at, via)
          values (?, ?, ?, ?, ?, ?, ?, ?, 'app')`,
      )
      .run(
        `ver-${item}-${String(rev)}`,
        HOME,
        item,
        rev,
        stored.sha,
        stored.bytes,
        '2026-01-01T00:00:00.000Z',
        stored.purgeAt,
      );
  }

  function trash(itemId: string, rootId: string, bytes: number, purgeAt: string): void {
    database
      .prepare(
        `insert into drive_trash (item_id, root_id, name, original_rel_path, trash_rel_path, is_folder,
          bytes, deleted_at, purge_at) values (?, ?, 'x', 'x', 'x', 0, ?, ?, ?)`,
      )
      .run(itemId, rootId, bytes, NOW, purgeAt);
  }

  it('totals the live, version and trash bytes and splits live items by kind', async () => {
    roots.update(HOME, { items: 3, folders: 1, bytes: 1110 });
    put(photo(1, 'a.jpg'));
    put(video(2, 'b.mp4', 1000));
    put(document(3, 'c.txt', { bytes: 10 }));
    put(folder(4, 'dir'));
    version(id(3), 1, { sha: SHA, bytes: 40, purgeAt: '2027-01-10T00:00:00.000Z' });
    version(id(3), 2, { sha: SHA, bytes: 40, purgeAt: '2027-02-10T00:00:00.000Z' });
    version(id(3), 3, { sha: SHA_TWO, bytes: 25, purgeAt: '2027-01-20T00:00:00.000Z' });
    trash(id(9), HOME, 5, '2026-12-01T00:00:00.000Z');
    const stats = await new DriveStatsReader(context).read(owner, probe);
    expect(stats).toMatchObject({
      items: 3,
      folders: 1,
      liveBytes: 1110,
      versionBytes: 65,
      trashBytes: 5,
      bytes: 1180,
    });
    expect(stats.kinds).toEqual([
      { kind: 'image', items: 1, bytes: 100 },
      { kind: 'video', items: 1, bytes: 1000 },
      { kind: 'audio', items: 0, bytes: 0 },
      { kind: 'document', items: 1, bytes: 10 },
      { kind: 'other', items: 0, bytes: 0 },
    ]);
    expect(stats.roots.find((row) => row.rootId === HOME)).toEqual({
      rootId: HOME,
      items: 3,
      folders: 1,
      bytes: 1110,
      kinds: [
        { kind: 'image', items: 1, bytes: 100 },
        { kind: 'video', items: 1, bytes: 1000 },
        { kind: 'audio', items: 0, bytes: 0 },
        { kind: 'document', items: 1, bytes: 10 },
        { kind: 'other', items: 0, bytes: 0 },
      ],
    });
  });

  it('lays the purge forecast out month by month from now, folding overdue rows into this month', async () => {
    version(id(1), 1, { sha: SHA, bytes: 40, purgeAt: '2026-10-01T00:00:00.000Z' });
    version(id(1), 2, { sha: SHA_TWO, bytes: 25, purgeAt: '2027-01-20T00:00:00.000Z' });
    trash(id(8), HOME, 5, '2026-12-01T00:00:00.000Z');
    trash(id(9), HOME, 7, '2027-01-02T00:00:00.000Z');
    const stats = await new DriveStatsReader(context).read(owner, probe);
    expect(stats.purges).toEqual([
      { month: '2026-11', trashBytes: 0, versionBytes: 40 },
      { month: '2026-12', trashBytes: 5, versionBytes: 0 },
      { month: '2027-01', trashBytes: 7, versionBytes: 25 },
    ]);
    database.exec('delete from drive_versions; delete from drive_trash');
    expect((await new DriveStatsReader(context).read(owner, probe)).purges).toEqual([]);
  });

  it('shows growth and a full date only once the library spans two months', async () => {
    days.record({ rootId: HOME, day: '2026-09-05', items: 1, bytes: 100, added: 1, removed: 0 });
    days.record({ rootId: HOME, day: '2026-10-09', items: 2, bytes: 200, added: 1, removed: 0 });
    let stats = await new DriveStatsReader(context).read(owner, probe);
    expect(stats.growth).toBeNull();
    expect(stats.fullInMonths).toBeNull();
    days.record({ rootId: HOME, day: '2026-11-07', items: 4, bytes: 400, added: 2, removed: 0 });
    stats = await new DriveStatsReader(context).read(owner, probe);
    expect(stats.growth).toEqual([
      { day: '2026-09-05', items: 1, bytes: 100, added: 1, removed: 0 },
      { day: '2026-10-09', items: 2, bytes: 200, added: 1, removed: 0 },
      { day: '2026-11-07', items: 4, bytes: 400, added: 2, removed: 0 },
    ]);
    const months = stats.fullInMonths ?? 0;
    expect(months).toBeCloseTo(400 / ((300 / 63) * 30.4375), 6);
  });

  it('carries each root forward when summing a day it did not change', async () => {
    days.record({ rootId: HOME, day: '2026-08-01', items: 1, bytes: 100, added: 1, removed: 0 });
    days.record({
      rootId: ROBIN_ROOT,
      day: '2026-09-01',
      items: 5,
      bytes: 500,
      added: 5,
      removed: 0,
    });
    days.record({ rootId: HOME, day: '2026-11-01', items: 2, bytes: 150, added: 1, removed: 0 });
    const growth = (await new DriveStatsReader(context).read(owner, probe)).growth ?? [];
    expect(growth.map((day) => [day.day, day.items, day.bytes])).toEqual([
      ['2026-08-01', 1, 100],
      ['2026-09-01', 6, 600],
      ['2026-11-01', 7, 650],
    ]);
  });

  it('reports no full date when the library is not growing, and the pace in bytes per month', () => {
    const row = (day: string, bytes: number): DriveDay => ({
      day,
      rootId: HOME,
      items: 1,
      bytes,
      added: 0,
      removed: 0,
    });
    const flat = [row('2026-08-01', 100), row('2026-11-01', 100)];
    const shrinking = [row('2026-08-01', 100), row('2026-11-01', 50)];
    expect(fullInMonths([flat], 1000)).toBeNull();
    expect(fullInMonths([shrinking], 1000)).toBeNull();
    expect(paceBytesPerMonth([row('2026-08-01', 0), row('2026-08-31', 300)])).toBeCloseTo(
      (300 / 30) * 30.4375,
      6,
    );
    expect(paceBytesPerMonth([row('2026-08-01', 5)])).toBe(0);
  });

  it('probes the data folder disk once and reports its space', async () => {
    let probed = 0;
    const stats = await new DriveStatsReader(context).read(owner, () => {
      probed += 1;
      return probe();
    });
    expect(probed).toBe(1);
    expect(stats.space).toEqual({ totalBytes: 1000, freeBytes: 400, fsType: 'ext4' });
  });

  it('counts only the drives the person can open', async () => {
    roots.update(HOME, { items: 1, bytes: 10 });
    roots.update(ROBIN_ROOT, { items: 2, bytes: 20 });
    roots.update(SAM_ROOT, { items: 4, bytes: 40 });
    trash(id(8), SAM_ROOT, 99, '2026-12-01T00:00:00.000Z');
    const stats = await new DriveStatsReader(context).read(owner, probe);
    expect(stats).toMatchObject({ items: 3, liveBytes: 30, trashBytes: 0 });
    expect(stats.roots.map((row) => row.rootId).sort()).toEqual([HOME, ROBIN_ROOT]);
    expect(stats.purges).toEqual([]);
  });
});
