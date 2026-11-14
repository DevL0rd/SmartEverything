import type { SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DriveActor } from '../../src/drive/access';
import {
  DriveAlbumAccessError,
  DriveAlbumCursorError,
  DriveAlbumItemError,
  DriveAlbumsService,
  type AlbumCursor,
  type SmartQueryRunner,
} from '../../src/drive/albums';
import { compileSmartRule } from '../../src/drive/smart-sql-compile';
import { dayBounds, resolveDateWord } from '../../src/drive/smart-sql-dates';
import type { DriveItemDraft } from '../../src/store/repositories/drive-items';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import type { TestStore } from '../support/store';
import { driveTestStore } from './spaces-fixture';

const NOW = '2026-11-07T10:00:00.000Z';
const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const PERSON_ROOT = '0d000000-0000-4000-8000-000000000002';
const DAY_MS = 86_400_000;
const BASE_DAY = Date.parse('2026-01-01T00:00:00.000Z');

interface Spec {
  readonly kind: 'folder' | 'image' | 'video' | 'document';
  readonly name: string;
  readonly starred: boolean;
  readonly bytes: number;
  readonly durationMs: number | null;
  readonly takenAt: string | null;
  readonly rootId: string;
}

const SPECS: readonly Spec[] = Array.from({ length: 16 }, (_, index): Spec => {
  const kinds = ['image', 'video', 'document', 'image'] as const;
  const names = ['Beach-1.jpg', 'Beach Day.mp4', "o'brien 100%_done.txt", 'report.pdf'] as const;
  const kind = kinds[index % kinds.length] ?? 'image';
  return {
    kind,
    name: `${names[index % names.length] ?? 'x'}-${String(index)}`,
    starred: index % 3 === 0,
    bytes: (index + 1) * 1000,
    durationMs: kind === 'video' ? (index + 1) * 20_000 : null,
    takenAt: kind === 'document' ? null : new Date(BASE_DAY + index * 17 * DAY_MS).toISOString(),
    rootId: HOME_ROOT,
  };
});

const spec = (fields: Partial<Spec>): Spec => ({
  kind: 'image',
  name: 'x',
  starred: true,
  bytes: 5,
  durationMs: null,
  takenAt: NOW,
  rootId: HOME_ROOT,
  ...fields,
});

const FOLDER = spec({ kind: 'folder', name: 'Trips', bytes: 0, takenAt: null });
const EXTRA_VIDEO = spec({ kind: 'video', name: 'extra.mp4', durationMs: 1000 });
const PERSON_ITEM = spec({ name: 'private.jpg', rootId: PERSON_ROOT });

let opened: TestStore;
let reader: DatabaseSync;
let service: DriveAlbumsService;
let owner: DriveActor;
let member: DriveActor;
let ids: string[];
let names: Map<string, string>;
let counter: number;

const ROWS = z.array(z.object({ id: z.string(), at: z.number() }));
const TOTAL = z.object({ total: z.number() });
const IDS = z.array(z.object({ id: z.string() }));

const runner: SmartQueryRunner = {
  rows: (statement) => ROWS.parse(reader.prepare(statement.text).all(statement.parameters)),
  count: (statement) => TOTAL.parse(reader.prepare(statement.text).get(statement.parameters)).total,
};

function uuid(prefix: string, index: number): string {
  return `${prefix}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function draftOf(spec: Spec, id: string): DriveItemDraft {
  const base = {
    id,
    rootId: spec.rootId,
    parentId: null,
    relPath: spec.name,
    name: spec.name,
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
  const file = {
    ...base,
    mime: 'application/octet-stream',
    bytes: spec.bytes,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  } as const;
  const media = {
    takenAt: spec.takenAt,
    width: null,
    height: null,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
  } as const;
  switch (spec.kind) {
    case 'folder':
      return { ...base, kind: 'folder', childCount: 0, bytes: 0 };
    case 'image':
      return { ...file, ...media, kind: 'image' };
    case 'video':
      return { ...file, ...media, kind: 'video', durationMs: spec.durationMs };
    case 'document':
      return { ...file, kind: 'document' };
  }
}

function addItem(spec: Spec): string {
  counter += 1;
  const id = uuid('0f', counter);
  opened.store.driveItems.write({
    item: draftOf(spec, id),
    identity: { dev: '1', ino: String(counter) },
  });
  if (spec.starred) {
    opened.store.driveStars.star(owner.profileId, id);
    opened.store.driveStars.star(member.profileId, id);
  }
  ids.push(id);
  names.set(id, spec.name);
  return id;
}

beforeEach(async () => {
  opened = await driveTestStore(() => new Date(NOW));
  reader = new DatabaseSync(join(opened.directory, 'test.db'), { readOnly: true });
  const { store } = opened;
  owner = { profileId: store.profiles.first().id };
  member = { profileId: store.profiles.create({ name: 'Sam' }).id };
  store.driveRoots.insert(sharedDriveRoot(HOME_ROOT));
  store.driveRoots.insert(personalDriveRoot(PERSON_ROOT, owner.profileId));
  counter = 0;
  ids = [];
  names = new Map();
  let albumCounter = 0;
  service = new DriveAlbumsService({
    albums: store.driveAlbums,
    items: store.driveItems,
    roots: store.driveRoots,
    grants: store.driveGrants,
    runner,
    newId: (): string => {
      albumCounter += 1;
      return uuid('0a', albumCounter);
    },
    now: (): string => NOW,
    timeZone: 'UTC',
  });
  for (const spec of SPECS) {
    addItem(spec);
  }
  addItem(FOLDER);
  addItem(PERSON_ITEM);
});

afterEach(async () => {
  reader.close();
  await opened.close();
});

const rule = (match: 'all' | 'any', ...rules: SmartRuleLeaf[]): SmartRule => ({ match, rules });

describe('date words and day bounds', () => {
  const now = new Date('2026-11-07T10:00:00.000Z');

  it.each([
    ['today', '2026-11-07', '2026-11-07'],
    ['Yesterday', '2026-11-06', '2026-11-06'],
    ['this week', '2026-11-02', '2026-11-08'],
    ['last week', '2026-10-26', '2026-11-01'],
    ['this month', '2026-11-01', '2026-11-30'],
    ['last month', '2026-10-01', '2026-10-31'],
    ['last year', '2025-01-01', '2025-12-31'],
    ['july', '2026-07-01', '2026-07-31'],
    ['last july', '2026-07-01', '2026-07-31'],
    ['december', '2025-12-01', '2025-12-31'],
    ['last november', '2025-11-01', '2025-11-30'],
    ['february 2024', '2024-02-01', '2024-02-29'],
    ['2024', '2024-01-01', '2024-12-31'],
    ['2024-05', '2024-05-01', '2024-05-31'],
    ['2024-05-03', '2024-05-03', '2024-05-03'],
  ])('resolves %s', (word, from, to) => {
    expect(resolveDateWord(word, now, 'UTC')).toEqual({ from, to });
  });

  it('refuses unknown words and impossible days', () => {
    expect(resolveDateWord('someday', now, 'UTC')).toBeNull();
    expect(resolveDateWord('2024-13', now, 'UTC')).toBeNull();
    expect(resolveDateWord('2023-02-30', now, 'UTC')).toBeNull();
  });

  it('reads today in the home time zone', () => {
    const late = new Date('2026-11-07T20:00:00.000Z');
    expect(resolveDateWord('today', late, 'Asia/Bangkok')?.from).toBe('2026-11-08');
  });

  it('turns days into instants of the zone, including a 25 hour day', () => {
    const bangkok = dayBounds({ from: '2026-11-07', to: '2026-11-07' }, 'Asia/Bangkok');
    expect(bangkok.startSeconds).toBe(Date.parse('2026-11-06T17:00:00Z') / 1000);
    const change = dayBounds({ from: '2026-11-01', to: '2026-11-01' }, 'America/New_York');
    expect((change.endSeconds ?? 0) - (change.startSeconds ?? 0)).toBe(25 * 3600);
    expect(dayBounds({ from: null, to: null }, 'UTC')).toEqual({
      startSeconds: null,
      endSeconds: null,
    });
  });
});

function inRange(value: number, low: number | null, high: number | null): boolean {
  return (low === null || value >= low) && (high === null || value <= high);
}

function matchesDates(spec: Spec, leaf: Extract<SmartRuleLeaf, { kind: 'date_range' }>): boolean {
  if (leaf.field !== 'takenAt' || spec.takenAt === null) {
    return false;
  }
  const from = leaf.from === null ? null : Date.parse(`${leaf.from}T00:00:00Z`);
  const to = leaf.to === null ? null : Date.parse(`${leaf.to}T00:00:00Z`) + DAY_MS - 1;
  return inRange(Date.parse(spec.takenAt), from, to);
}

function matchesLeaf(spec: Spec, leaf: SmartRuleLeaf): boolean {
  switch (leaf.kind) {
    case 'item_kind':
      return leaf.itemKinds.some((kind) => kind === spec.kind);
    case 'text':
      return spec.name.toLowerCase().includes(leaf.contains.toLowerCase());
    case 'starred':
      return spec.starred === leaf.starred;
    case 'size_range':
      return inRange(spec.bytes, leaf.minBytes, leaf.maxBytes);
    case 'duration_range':
      return spec.durationMs !== null && inRange(spec.durationMs, leaf.minMs, leaf.maxMs);
    case 'date_range':
      return matchesDates(spec, leaf);
    case 'in_root':
    case 'in_folder':
      return false;
  }
}

function expectedNames(smart: SmartRule): string[] {
  return SPECS.filter((spec) => {
    const hits = smart.rules.map((leaf) => matchesLeaf(spec, leaf));
    return smart.match === 'all' ? hits.every(Boolean) : hits.some(Boolean);
  })
    .map((spec) => spec.name)
    .sort();
}

function matchedNames(
  smart: SmartRule,
  reachProfileId: string | null = null,
  starViewerId: string | null = member.profileId,
): string[] {
  const filter = compileSmartRule(smart, { reachProfileId, starViewerId, timeZone: 'UTC' });
  const rows = IDS.parse(
    reader.prepare(`select id from drive_items where ${filter.text}`).all(filter.parameters),
  );
  return rows.map((row) => names.get(row.id) ?? '').sort();
}

const day = fc
  .integer({ min: 0, max: 280 })
  .map((n) => new Date(BASE_DAY + n * DAY_MS).toISOString().slice(0, 10));
const maybe = <T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<T | null> =>
  fc.option(arbitrary, { nil: null });

const leafArbitrary: fc.Arbitrary<SmartRuleLeaf> = fc.oneof(
  fc.record({
    kind: fc.constant('item_kind' as const),
    itemKinds: fc.uniqueArray(fc.constantFrom('image', 'video', 'audio', 'document', 'other'), {
      minLength: 1,
    }),
  }),
  fc.record({
    kind: fc.constant('text' as const),
    field: fc.constant('name' as const),
    contains: fc.stringMatching(/^[a-zA-Z0-9%_' -]{1,6}$/).filter((text) => text.trim() !== ''),
  }),
  fc.record({
    kind: fc.constant('date_range' as const),
    field: fc.constant('takenAt' as const),
    from: maybe(day),
    to: maybe(day),
  }),
  fc.record({ kind: fc.constant('starred' as const), starred: fc.boolean() }),
  fc.record({
    kind: fc.constant('size_range' as const),
    minBytes: maybe(fc.integer({ min: 0, max: 17_000 })),
    maxBytes: maybe(fc.integer({ min: 0, max: 17_000 })),
  }),
  fc.record({
    kind: fc.constant('duration_range' as const),
    minMs: maybe(fc.integer({ min: 0, max: 340_000 })),
    maxMs: maybe(fc.integer({ min: 0, max: 340_000 })),
  }),
);

const ruleArbitrary: fc.Arbitrary<SmartRule> = fc.record({
  match: fc.constantFrom('all' as const, 'any' as const),
  rules: fc.array(leafArbitrary, { minLength: 1, maxLength: 4 }),
});

describe('smart rule compiler', () => {
  it('selects exactly what a reference evaluation selects', () => {
    fc.assert(
      fc.property(ruleArbitrary, (smart) => {
        expect(matchedNames(smart)).toEqual(expectedNames(smart));
      }),
      { numRuns: 300 },
    );
  });

  it('binds every value and never writes user text into the statement', () => {
    fc.assert(
      fc.property(ruleArbitrary, fc.uuid(), (smart, profile) => {
        const filter = compileSmartRule(smart, {
          reachProfileId: profile,
          starViewerId: profile,
          timeZone: 'UTC',
        });
        const used = [...filter.text.matchAll(/\$([a-z0-9]+)/g)].map((hit) => hit[1]);
        expect(new Set(used)).toEqual(new Set(Object.keys(filter.parameters)));
        expect(filter.text).not.toContain(profile);
        const masked: SmartRule = {
          match: smart.match,
          rules: smart.rules.map((leaf) =>
            leaf.kind === 'text' ? { ...leaf, contains: 'x' } : leaf,
          ),
        };
        const reference = compileSmartRule(masked, {
          reachProfileId: profile,
          starViewerId: profile,
          timeZone: 'UTC',
        });
        expect(filter.text).toEqual(reference.text);
        for (const leaf of smart.rules) {
          if (leaf.kind === 'text') {
            expect(Object.values(filter.parameters)).toContain(leaf.contains);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('treats quotes, wildcards and statements in text as plain characters', () => {
    const hostile = "'; drop table drive_items; --";
    expect(matchedNames(rule('all', { kind: 'text', field: 'name', contains: hostile }))).toEqual(
      [],
    );
    expect(matchedNames(rule('all', { kind: 'text', field: 'name', contains: '%' }))).toEqual(
      expectedNames(rule('all', { kind: 'text', field: 'name', contains: '%' })),
    );
    expect(reader.prepare('select count(*) as total from drive_items').get()).toEqual({
      total: SPECS.length + 2,
    });
  });

  it('limits a home rule to home roots and a person rule to home plus the owner roots', () => {
    const starred = rule('all', { kind: 'starred', starred: true });
    expect(matchedNames(starred)).not.toContain('private.jpg');
    expect(matchedNames(starred, owner.profileId)).toContain('private.jpg');
    expect(matchedNames(starred, member.profileId)).not.toContain('private.jpg');
    expect(matchedNames(starred, owner.profileId)).not.toContain('Trips');
  });

  it('reads the starred rule for the viewer only', () => {
    const starred = rule('all', { kind: 'starred', starred: true });
    const lonely = addItem(spec({ name: 'lonely.jpg' }));
    opened.store.driveStars.unstar(member.profileId, lonely);
    expect(matchedNames(starred, null, owner.profileId)).toContain('lonely.jpg');
    expect(matchedNames(starred, null, member.profileId)).not.toContain('lonely.jpg');
    expect(matchedNames(starred, null, null)).toEqual([]);
  });

  it('reaches items another person shared through a grant on the item or its folder', () => {
    const everything = rule('all', { kind: 'item_kind', itemKinds: ['image'] });
    expect(matchedNames(everything, member.profileId)).not.toContain('private.jpg');
    const privateId = ids[17] ?? '';
    opened.store.driveGrants.set(
      { itemId: privateId, profileId: member.profileId, role: 'view' },
      owner.profileId,
    );
    expect(matchedNames(everything, member.profileId)).toContain('private.jpg');
  });
});

describe('albums', () => {
  it('keeps manual albums to files the audience can reach', () => {
    const album = service.create(
      { kind: 'manual', title: 'Trip', surface: 'drive', scope: 'home' },
      member,
    );
    const [first = '', second = ''] = ids;
    expect(service.addItems(album.id, [first, second], member).itemCount).toBe(2);
    expect(() => service.addItems(album.id, [ids[16] ?? ''], owner)).toThrow(DriveAlbumItemError);
    expect(() => service.addItems(album.id, [ids[17] ?? ''], owner)).toThrow(DriveAlbumItemError);
    expect(() => service.addItems(album.id, [ids[17] ?? ''], member)).toThrow(DriveAlbumItemError);
    expect(() => service.addItems(album.id, [uuid('0f', 999)], owner)).toThrow(DriveAlbumItemError);
    expect(service.removeItems(album.id, [first], member).itemCount).toBe(1);
    const page = service.members(album.id, member, null, 10);
    expect(page).toEqual({ itemIds: [second], next: null });
  });

  it('lets a person album reach that person roots and hides it from others', () => {
    const album = service.create(
      { kind: 'manual', title: 'Mine', surface: 'drive', scope: 'person' },
      owner,
    );
    expect(service.addItems(album.id, [ids[17] ?? ''], owner).itemCount).toBe(1);
    expect(() => service.get(album.id, member)).toThrow(DriveAlbumAccessError);
    expect(service.list(member, 'drive')).toEqual([]);
    expect(service.list(owner, 'drive').map((entry) => entry.id)).toEqual([album.id]);
    expect(() => {
      service.remove(album.id, member);
    }).toThrow(DriveAlbumAccessError);
    service.remove(album.id, owner);
    expect(service.list(owner, 'drive')).toEqual([]);
  });

  it('counts a smart album at creation and recounts when items or the rule change', () => {
    const smart = service.create(
      {
        kind: 'smart',
        title: 'Starred',
        surface: 'drive',
        scope: 'home',
        rule: rule('all', { kind: 'starred', starred: true }),
      },
      member,
    );
    const starredCount = SPECS.filter((spec) => spec.starred).length;
    expect(smart.itemCount).toBe(starredCount);
    addItem(EXTRA_VIDEO);
    service.refresh(smart.id);
    expect(service.get(smart.id, member).itemCount).toBe(starredCount + 1);
    service.refreshAll();
    expect(
      service.setRule(smart.id, rule('all', { kind: 'item_kind', itemKinds: ['video'] }), member)
        .itemCount,
    ).toBe(SPECS.filter((spec) => spec.kind === 'video').length + 1);
    expect(() => service.addItems(smart.id, [ids[0] ?? ''], member)).toThrow();
  });

  it('counts a home smart album with the stars of whoever looks', () => {
    const smart = service.create(
      {
        kind: 'smart',
        title: 'Starred',
        surface: 'drive',
        scope: 'home',
        rule: rule('all', { kind: 'starred', starred: true }),
      },
      owner,
    );
    const starredCount = SPECS.filter((spec) => spec.starred).length;
    expect(smart.itemCount).toBe(starredCount);
    const mine = addItem(spec({ name: 'mine.jpg', starred: false }));
    opened.store.driveStars.star(owner.profileId, mine);
    expect(service.get(smart.id, owner).itemCount).toBe(starredCount + 1);
    expect(service.get(smart.id, member).itemCount).toBe(starredCount);
    expect(service.members(smart.id, owner, null, 100).itemIds).toContain(mine);
    expect(service.members(smart.id, member, null, 100).itemIds).not.toContain(mine);
  });

  it('lets a person reach a granted file in a manual album of their own', () => {
    const album = service.create(
      { kind: 'manual', title: 'Theirs', surface: 'drive', scope: 'person' },
      member,
    );
    const privateId = ids[17] ?? '';
    expect(() => service.addItems(album.id, [privateId], member)).toThrow(DriveAlbumItemError);
    opened.store.driveGrants.set(
      { itemId: privateId, profileId: member.profileId, role: 'view' },
      owner.profileId,
    );
    expect(service.addItems(album.id, [privateId], member).itemCount).toBe(1);
  });

  it('pages a smart album newest first with a keyset cursor', () => {
    const smart = service.create(
      {
        kind: 'smart',
        title: 'Images',
        surface: 'drive',
        scope: 'home',
        rule: rule('all', { kind: 'item_kind', itemKinds: ['image'] }),
      },
      owner,
    );
    const pages: (readonly string[])[] = [];
    let cursor: AlbumCursor | null = null;
    do {
      const page = service.members(smart.id, owner, cursor, 3);
      pages.push(page.itemIds);
      cursor = page.next;
    } while (cursor !== null);
    const expected = SPECS.map((spec, index) => ({ spec, id: ids[index] ?? '' }))
      .filter((entry) => entry.spec.kind === 'image')
      .reverse()
      .map((entry) => entry.id);
    expect(pages.flat()).toEqual(expected);
    expect(pages.every((page) => page.length <= 3)).toBe(true);
    const manual = service.create(
      { kind: 'manual', title: 'M', surface: 'drive', scope: 'home' },
      owner,
    );
    expect(() =>
      service.members(manual.id, owner, { kind: 'smart', at: 0, itemId: ids[0] ?? '' }, 3),
    ).toThrow(DriveAlbumCursorError);
  });
});
