import { DatabaseSync } from 'node:sqlite';
import { ApiError, STACK } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/service-read';
import { BURST_GAP_MS, StacksService } from '../../src/photos/stacks';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { DriveStacksRepository } from '../../src/store/repositories/drive-stacks';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0f000000-0000-4000-8000-000000000001';
const OTHER_ROOT = '0f000000-0000-4000-8000-000000000002';
const ALICE_ROOT = '0f000000-0000-4000-8000-000000000003';
const HIDDEN_ROOT = '0f000000-0000-4000-8000-000000000004';
const SECOND = 1000;

type Fields = Record<string, string | number | null>;

interface Seed {
  readonly n: number;
  readonly at: number | null;
  readonly root?: string;
  readonly mime?: string;
  readonly kind?: 'image' | 'video';
  readonly stem?: string;
}

const BASE = Date.parse('2026-06-01T10:00:00.000Z');

let database: DatabaseSync;
let context: StoreContext;
let alice: DriveActor;
let bob: DriveActor;
let service: StacksService;
let media: DriveMediaRepository;
let stacks: DriveStacksRepository;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  const aliceId = profiles.create({ name: 'Alice' }).id;
  alice = { profileId: aliceId, owner: false };
  bob = { profileId: profiles.create({ name: 'Bob' }).id, owner: false };
  insertRoot(HOME_ROOT, 'home', null, 1);
  insertRoot(OTHER_ROOT, 'home', null, 1);
  insertRoot(ALICE_ROOT, 'person', aliceId, 1);
  insertRoot(HIDDEN_ROOT, 'home', null, 0);
  service = new StacksService(context);
  media = new DriveMediaRepository(context);
  stacks = new DriveStacksRepository(context);
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
  return `0f000000-0000-4000-8000-2${String(n).padStart(11, '0')}`;
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
    mime: item.mime ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: 0,
    rev: 1,
    etag: `etag-${String(item.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: item.at === null ? null : new Date(BASE + item.at).toISOString(),
  });
  media.save({
    item_id: id,
    time_source: 'metadata',
    tz_offset_min: null,
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
    stem_key: item.stem ?? null,
    stack_id: null,
    place_id: null,
  });
  return id;
}

function stackOf(n: number): string | null {
  return media.byId(itemId(n)).stack_id;
}

describe('bursts', () => {
  it('stacks shots taken within the gap of each other and leaves a later shot out', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 400 });
    seed({ n: 3, at: 900 });
    seed({ n: 4, at: 5 * SECOND });
    const formation = service.form(itemId(2));
    expect(formation?.kind).toBe('burst');
    expect(formation?.itemIds).toEqual([itemId(1), itemId(2), itemId(3)]);
    expect(stackOf(1)).toBe(stackOf(3));
    expect(stackOf(1)).not.toBeNull();
    expect(stackOf(4)).toBeNull();
    expect(stacks.byId(stackOf(1) ?? '').cover_item_id).toBe(itemId(1));
  });

  it('follows a chain whose ends are further apart than the gap', () => {
    for (let n = 0; n < 5; n += 1) seed({ n: n + 1, at: n * BURST_GAP_MS });
    expect(service.form(itemId(5))?.itemIds).toHaveLength(5);
  });

  it('splits at a pause longer than the gap into two stacks', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 200 });
    seed({ n: 3, at: 200 + BURST_GAP_MS + 1 });
    seed({ n: 4, at: 300 + BURST_GAP_MS + 1 });
    service.form(itemId(1));
    service.form(itemId(4));
    expect(stackOf(1)).toBe(stackOf(2));
    expect(stackOf(3)).toBe(stackOf(4));
    expect(stackOf(1)).not.toBe(stackOf(3));
  });

  it('leaves a lone shot, other roots, videos and undated files alone', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 100, root: OTHER_ROOT });
    seed({ n: 3, at: 150, kind: 'video' });
    seed({ n: 4, at: null });
    expect(service.form(itemId(1))).toBeNull();
    expect(service.form(itemId(4))).toBeNull();
    expect(service.form('missing')).toBeNull();
    expect(stacks.list()).toEqual([]);
  });

  it('adds a late shot to the existing stack and keeps its cover', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 300 });
    const first = service.form(itemId(1));
    service.makeCover(alice, first?.stackId ?? '', itemId(2));
    seed({ n: 3, at: 600 });
    const again = service.form(itemId(3));
    expect(again?.stackId).toBe(first?.stackId);
    expect(stackOf(3)).toBe(first?.stackId);
    expect(stacks.byId(first?.stackId ?? '').cover_item_id).toBe(itemId(2));
    expect(stacks.list()).toHaveLength(1);
  });

  it('is the same stack when formed again', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 300 });
    const first = service.form(itemId(1));
    expect(service.form(itemId(2))?.stackId).toBe(first?.stackId);
    expect(stacks.list()).toHaveLength(1);
  });

  it('merges two stacks when a shot bridges them', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 300 });
    seed({ n: 4, at: 2 * BURST_GAP_MS });
    seed({ n: 5, at: 2 * BURST_GAP_MS + 300 });
    service.form(itemId(1));
    service.form(itemId(4));
    expect(stacks.list()).toHaveLength(2);
    seed({ n: 3, at: BURST_GAP_MS });
    service.form(itemId(3));
    expect(stacks.list()).toHaveLength(1);
    expect(new Set([1, 2, 3, 4, 5].map(stackOf)).size).toBe(1);
  });

  it('sets a shot free that no longer belongs to the burst', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 300 });
    seed({ n: 3, at: 600 });
    service.form(itemId(2));
    database
      .prepare('update drive_items set taken_at = ? where id = ?')
      .run(new Date(BASE + 10 * SECOND).toISOString(), itemId(3));
    service.form(itemId(1));
    expect(stackOf(3)).toBeNull();
    expect(stackOf(1)).toBe(stackOf(2));
    expect(stackOf(1)).not.toBeNull();
  });
});

describe('RAW plus JPEG pairs', () => {
  it('stack by stem key with the displayable file as the cover', () => {
    const raw = seed({ n: 1, at: 0, mime: 'image/x-canon-cr2', stem: 'trip/IMG_1' });
    const jpeg = seed({ n: 2, at: 0, mime: 'image/jpeg', stem: 'trip/IMG_1' });
    const formation = service.form(raw);
    expect(formation?.kind).toBe('stem');
    expect(stackOf(1)).toBe(stackOf(2));
    expect(stacks.byId(formation?.stackId ?? '').cover_item_id).toBe(jpeg);
  });

  it('are not pulled into a burst of their neighbours', () => {
    seed({ n: 1, at: 0, mime: 'image/x-canon-cr2', stem: 'a/IMG_1' });
    seed({ n: 2, at: 0, stem: 'a/IMG_1' });
    seed({ n: 3, at: 200 });
    seed({ n: 4, at: 400 });
    service.form(itemId(1));
    service.form(itemId(3));
    expect(stacks.byId(stackOf(1) ?? '').kind).toBe('stem');
    expect(stacks.byId(stackOf(3) ?? '').kind).toBe('burst');
    expect(stackOf(3)).toBe(stackOf(4));
    expect(stackOf(2)).not.toBe(stackOf(3));
  });

  it('do not stack a file with a different stem or none', () => {
    seed({ n: 1, at: 0, stem: 'a/IMG_1' });
    seed({ n: 2, at: 5 * SECOND, stem: 'a/IMG_2' });
    expect(service.form(itemId(1))).toBeNull();
  });
});

describe('leaving', () => {
  it('dissolves a stack that falls under two photos', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 300 });
    service.form(itemId(1));
    service.leave(itemId(2));
    expect(stackOf(1)).toBeNull();
    expect(stackOf(2)).toBeNull();
    expect(stacks.list()).toEqual([]);
  });

  it('keeps a stack that still has two photos', () => {
    seed({ n: 1, at: 0 });
    seed({ n: 2, at: 300 });
    seed({ n: 3, at: 600 });
    service.form(itemId(1));
    service.leave(itemId(3));
    expect(stackOf(1)).toBe(stackOf(2));
    expect(stackOf(1)).not.toBeNull();
    expect(stackOf(3)).toBeNull();
    service.leave(itemId(3));
  });
});

describe('reading and choosing a cover', () => {
  function burst(root: string = HOME_ROOT): string {
    seed({ n: 1, at: 0, root });
    seed({ n: 2, at: 300, root });
    seed({ n: 3, at: 600, root });
    return service.form(itemId(1))?.stackId ?? '';
  }

  it('reads a stack as the contract describes it, in capture order', () => {
    const id = burst();
    const stack = service.read(alice, id);
    expect(STACK.safeParse(stack).success).toBe(true);
    expect(stack.kind).toBe('burst');
    expect(stack.itemIds).toEqual([itemId(1), itemId(2), itemId(3)]);
    expect(stack.coverItemId).toBe(itemId(1));
  });

  it('calls a RAW plus JPEG stack raw_jpeg', () => {
    seed({ n: 1, at: 0, mime: 'image/x-canon-cr2', stem: 'k' });
    seed({ n: 2, at: 0, stem: 'k' });
    const id = service.form(itemId(1))?.stackId ?? '';
    expect(service.read(alice, id).kind).toBe('raw_jpeg');
  });

  it('makes another photo the cover and refuses one from outside the stack', () => {
    const id = burst();
    seed({ n: 9, at: 60 * SECOND });
    expect(service.makeCover(alice, id, itemId(3)).coverItemId).toBe(itemId(3));
    expect(stacks.byId(id).cover_item_id).toBe(itemId(3));
    expect(() => service.makeCover(alice, id, itemId(9))).toThrow(ApiError);
    expect(service.read(alice, id).coverItemId).toBe(itemId(3));
  });

  it('shows a stack to nobody who cannot see its photos', () => {
    const id = burst(ALICE_ROOT);
    expect(service.read(alice, id).itemIds).toHaveLength(3);
    expect(() => service.read(bob, id)).toThrow(ApiError);
    expect(() => service.makeCover(bob, id, itemId(1))).toThrow(ApiError);
    expect(service.read({ ...bob, owner: true }, id).itemIds).toHaveLength(3);
  });

  it('does not show stacks of folders that are not in Photos', () => {
    const id = burst(HIDDEN_ROOT);
    expect(() => service.read({ ...alice, owner: true }, id)).toThrow(ApiError);
    expect(service.list({ ...alice, owner: true }, undefined).items).toEqual([]);
  });

  it('falls back to the first photo when the cover photo is gone', () => {
    const id = burst();
    stacks.setCover(id, itemId(3));
    database.prepare('update drive_stacks set cover_item_id = null where id = ?').run(id);
    expect(service.read(alice, id).coverItemId).toBe(itemId(1));
  });

  it('lists the stacks the viewer can see', () => {
    burst();
    seed({ n: 11, at: 100 * SECOND, root: ALICE_ROOT });
    seed({ n: 12, at: 100 * SECOND + 200, root: ALICE_ROOT });
    service.form(itemId(11));
    expect(service.list(alice, undefined).items).toHaveLength(2);
    const forBob = service.list(bob, undefined);
    expect(forBob.items).toHaveLength(1);
    expect(forBob.next).toBeNull();
  });
});
