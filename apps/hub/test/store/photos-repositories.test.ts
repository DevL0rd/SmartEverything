import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreContext, StoreNotFoundError } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import {
  DriveMediaJobsRepository,
  type DriveMediaJobRequest,
} from '../../src/store/repositories/drive-media-jobs';
import { DriveMediaRepository, type DriveMediaRow } from '../../src/store/repositories/drive-media';
import {
  DrivePlacesRepository,
  type DrivePlaceRow,
} from '../../src/store/repositories/drive-places';
import { DriveStacksRepository } from '../../src/store/repositories/drive-stacks';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0f000000-0000-4000-8000-000000000001';
const HUB_DEVICE = '0f000000-0000-4000-8000-000000000041';
const SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);
const ITEMS = [
  '0f000000-0000-4000-8000-000000000011',
  '0f000000-0000-4000-8000-000000000012',
  '0f000000-0000-4000-8000-000000000013',
] as const;

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let context: StoreContext;
let person: string;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  person = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  insertRows();
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

function insertRows(): void {
  insert('drive_roots', {
    id: ROOT,
    kind: 'folder',
    label: 'Library',
    scope: 'home',
    owner_profile_id: null,
    path: '/srv/library',
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
  for (const [index, id] of ITEMS.entries()) {
    insert('drive_items', {
      id,
      root_id: ROOT,
      rel_path: `${String(index)}.jpg`,
      name: `${String(index)}.jpg`,
      kind: 'image',
      mime: 'image/jpeg',
      bytes: 10,
      sha256: SHA,
      integrity: 'unknown',
      modified_at: NOW,
      added_at: NOW,
      starred: 0,
      rev: 1,
      etag: `etag-${String(index)}`,
      outside: 0,
      thumb_state: 'none',
    });
  }
  insert('devices', {
    id: HUB_DEVICE,
    provider: 'local',
    external_id: 'phone:aa',
    kind: 'phone',
    name: 'Pixel',
    model: 'm',
    manufacturer: 'v',
    created_at: NOW,
    updated_at: NOW,
  });
}

function mediaRow(itemId: string, fields: Partial<DriveMediaRow> = {}): DriveMediaRow {
  return {
    item_id: itemId,
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
    stem_key: null,
    stack_id: null,
    place_id: null,
    ...fields,
  };
}

function place(id: string, fields: Partial<DrivePlaceRow> = {}): DrivePlaceRow {
  return { id, name: `Place ${id}`, admin: null, country: 'GB', lat: 51.5, lon: -0.12, ...fields };
}

function first(): string {
  return ITEMS[0];
}

function second(): string {
  return ITEMS[1];
}

describe('DriveMediaRepository', () => {
  it('saves a record with its ThumbHash bytes and reads it back', () => {
    const media = new DriveMediaRepository(context);
    const saved = media.save(
      mediaRow(first(), {
        thumbhash: new Uint8Array([1, 2, 3]),
        tz_offset_min: 420,
        preview_state: 'ready',
      }),
    );
    expect(media.byId(first())).toEqual(saved);
    expect(Array.from(media.byId(first()).thumbhash ?? [])).toEqual([1, 2, 3]);
  });

  it('replaces the record when saved again', () => {
    const media = new DriveMediaRepository(context);
    media.save(mediaRow(first()));
    media.save(mediaRow(first(), { time_source: 'filename', live_id: 'live-1' }));
    expect(media.byId(first())).toMatchObject({ time_source: 'filename', live_id: 'live-1' });
  });

  it('changes only the patched fields and checks the reason rule', () => {
    const media = new DriveMediaRepository(context);
    media.save(mediaRow(first(), { burst_id: 'burst-1' }));
    media.update(first(), { preview_state: 'failed', preview_reason: 'corrupt' });
    expect(media.byId(first())).toMatchObject({
      burst_id: 'burst-1',
      preview_state: 'failed',
      preview_reason: 'corrupt',
    });
    expect(() => media.update(first(), { poster_state: 'failed' })).toThrow(StoreConflictError);
    expect(() => media.update(second(), { burst_id: 'x' })).toThrow(StoreNotFoundError);
  });

  it('finds records by live id, burst, stem key, place and stack', () => {
    const media = new DriveMediaRepository(context);
    new DrivePlacesRepository(context).replaceAll([place('p1')]);
    const stack = new DriveStacksRepository(context).create('stem', first());
    media.save(
      mediaRow(first(), {
        live_id: 'l',
        burst_id: 'b',
        stem_key: 's',
        place_id: 'p1',
        stack_id: stack.id,
      }),
    );
    media.save(mediaRow(second(), { live_id: 'l', stem_key: 's' }));
    expect(media.withLiveId('l').map((row) => row.item_id)).toEqual([first(), second()]);
    expect(media.withStemKey('s')).toHaveLength(2);
    expect(media.withBurstId('b').map((row) => row.item_id)).toEqual([first()]);
    expect(media.inPlace('p1').map((row) => row.item_id)).toEqual([first()]);
    expect(media.inStack(stack.id).map((row) => row.item_id)).toEqual([first()]);
    expect(media.list([second(), 'missing']).map((row) => row.item_id)).toEqual([second()]);
  });

  it('assigns and clears a stack for several items at once', () => {
    const media = new DriveMediaRepository(context);
    const stack = new DriveStacksRepository(context).create('burst', first());
    media.save(mediaRow(first()));
    media.save(mediaRow(second()));
    media.assignStack([first(), second()], stack.id);
    expect(media.inStack(stack.id)).toHaveLength(2);
    media.assignStack([first()], null);
    expect(media.inStack(stack.id).map((row) => row.item_id)).toEqual([second()]);
  });
});

describe('DriveMediaJobsRepository', () => {
  const request = (
    itemId: string,
    kind: 'preview' | 'poster' = 'preview',
    visible = false,
  ): DriveMediaJobRequest => ({
    kind,
    itemId,
    rev: 1,
    visible,
  });

  it('queues one job per item revision and kind and promotes it when asked again visibly', () => {
    const jobs = new DriveMediaJobsRepository(context);
    const queued = jobs.enqueue(request(first()));
    const again = jobs.enqueue(request(first(), 'preview', true));
    expect(again.id).toBe(queued.id);
    expect(again.visible).toBe(true);
    expect(jobs.forItem(first())).toHaveLength(1);
    expect(jobs.enqueue(request(first(), 'poster')).id).not.toBe(queued.id);
  });

  it('claims visible jobs first, then the oldest, and counts the attempt', () => {
    const jobs = new DriveMediaJobsRepository(context);
    const old = jobs.enqueue(request(first()));
    const visible = jobs.enqueue(request(second(), 'preview', true));
    expect(jobs.claim(['preview'])).toMatchObject({
      id: visible.id,
      state: 'running',
      attempts: 1,
    });
    expect(jobs.claim(['preview'])?.id).toBe(old.id);
    expect(jobs.claim(['preview'])).toBeUndefined();
  });

  it('claims only the requested kinds', () => {
    const jobs = new DriveMediaJobsRepository(context);
    jobs.enqueue(request(first(), 'poster'));
    expect(jobs.claim(['preview'])).toBeUndefined();
    expect(jobs.claim(['poster'])?.kind).toBe('poster');
  });

  it('makes the queued jobs of an item visible', () => {
    const jobs = new DriveMediaJobsRepository(context);
    jobs.enqueue(request(first()));
    jobs.enqueue(request(second()));
    expect(jobs.makeVisible(second())).toBe(1);
    expect(jobs.claim(['preview'])?.item_id).toBe(second());
  });

  it('records progress, completion and failure with its reason, and retries a failed job', () => {
    const jobs = new DriveMediaJobsRepository(context);
    const queued = jobs.enqueue(request(first()));
    jobs.claim(['preview']);
    jobs.report(queued.id, 0.5);
    expect(jobs.byId(queued.id).progress).toBe(0.5);
    jobs.fail(queued.id, 'decoder crashed');
    expect(jobs.byId(queued.id)).toMatchObject({
      state: 'failed',
      error: 'decoder crashed',
      progress: null,
    });
    expect(jobs.failures().map((job) => job.id)).toEqual([queued.id]);
    jobs.retry(queued.id);
    expect(jobs.claim(['preview'])).toMatchObject({ id: queued.id, attempts: 2, error: null });
    jobs.complete(queued.id);
    expect(jobs.byId(queued.id).state).toBe('done');
    expect(jobs.tally()).toEqual([]);
  });

  it('queues interrupted jobs again and drops jobs of older revisions', () => {
    const jobs = new DriveMediaJobsRepository(context);
    const queued = jobs.enqueue(request(first()));
    jobs.claim(['preview']);
    expect(jobs.requeueRunning()).toBe(1);
    expect(jobs.byId(queued.id).state).toBe('queued');
    jobs.enqueue({ kind: 'preview', itemId: first(), rev: 2 });
    expect(jobs.removeOlderRevisions(first(), 2)).toBe(1);
    expect(jobs.forItem(first()).map((job) => job.rev)).toEqual([2]);
  });

  it('tallies unfinished jobs by kind and state', () => {
    const jobs = new DriveMediaJobsRepository(context);
    jobs.enqueue(request(first()));
    jobs.enqueue(request(second()));
    jobs.enqueue(request(first(), 'poster'));
    jobs.claim(['poster']);
    expect(jobs.tally()).toEqual([
      { kind: 'poster', state: 'running', total: 1 },
      { kind: 'preview', state: 'queued', total: 2 },
    ]);
  });
});

describe('DriveStacksRepository', () => {
  it('creates a stack, changes its cover and removes it', () => {
    const stacks = new DriveStacksRepository(context);
    const stack = stacks.create('burst', first());
    expect(stacks.byId(stack.id)).toEqual(stack);
    expect(stacks.setCover(stack.id, second()).cover_item_id).toBe(second());
    expect(stacks.list()).toHaveLength(1);
    stacks.remove(stack.id);
    expect(stacks.find(stack.id)).toBeUndefined();
    expect(() => stacks.byId(stack.id)).toThrow(StoreNotFoundError);
  });

  it('refuses a cover that is not an item', () => {
    const stacks = new DriveStacksRepository(context);
    expect(() => stacks.create('stem', 'missing')).toThrow(StoreConflictError);
  });
});

describe('DrivePlacesRepository', () => {
  it('loads the dataset and keeps ids stable when it is loaded again with changes', () => {
    const places = new DrivePlacesRepository(context);
    places.replaceAll([place('1'), place('2'), place('3')]);
    new DriveMediaRepository(context).save(mediaRow(first(), { place_id: '1' }));
    places.replaceAll([place('1', { name: 'Renamed' }), place('4')]);
    expect(places.count()).toBe(2);
    expect(places.byId('1').name).toBe('Renamed');
    expect(places.find('2')).toBeUndefined();
    expect(new DriveMediaRepository(context).byId(first()).place_id).toBe('1');
  });

  it('unlinks media of a place missing from the next dataset', () => {
    const places = new DrivePlacesRepository(context);
    places.replaceAll([place('1')]);
    new DriveMediaRepository(context).save(mediaRow(first(), { place_id: '1' }));
    places.replaceAll([place('2')]);
    expect(new DriveMediaRepository(context).byId(first()).place_id).toBeNull();
  });

  it('refuses a malformed place and keeps the earlier dataset', () => {
    const places = new DrivePlacesRepository(context);
    places.replaceAll([place('1')]);
    expect(() => {
      places.replaceAll([place('2'), place('3', { country: 'gb' })]);
    }).toThrow();
    expect(places.count()).toBe(1);
  });

  it('lists a country and finds places inside bounds, including across the antimeridian', () => {
    const places = new DrivePlacesRepository(context);
    places.replaceAll([
      place('london', { name: 'London', lat: 51.5, lon: -0.1 }),
      place('paris', { name: 'Paris', country: 'FR', lat: 48.9, lon: 2.3 }),
      place('fiji', { name: 'Suva', country: 'FJ', lat: -18.1, lon: 178.4 }),
      place('samoa', { name: 'Apia', country: 'WS', lat: -13.8, lon: -171.8 }),
    ]);
    expect(places.inCountry('FR').map((row) => row.id)).toEqual(['paris']);
    expect(places.within({ south: 45, north: 55, west: -5, east: 5 }).map((row) => row.id)).toEqual(
      ['london', 'paris'],
    );
    expect(
      places.within({ south: -20, north: -10, west: 170, east: -170 }).map((row) => row.id),
    ).toEqual(['fiji', 'samoa']);
  });
});

describe('DriveBackupRepository', () => {
  function register(backup: DriveBackupRepository): string {
    return backup.registerDevice({
      profile_id: person,
      device_id: HUB_DEVICE,
      name: 'Pixel',
      platform: 'android',
      last_seen_at: null,
      settings: { wifiOnly: true },
    }).id;
  }

  it('registers a phone once per hub device and reads it by person and hub device', () => {
    const backup = new DriveBackupRepository(context);
    const id = register(backup);
    expect(backup.deviceById(id).settings).toEqual({ wifiOnly: true });
    expect(backup.findDeviceByHubDevice(HUB_DEVICE)?.id).toBe(id);
    expect(backup.devicesOf(person).map((row) => row.id)).toEqual([id]);
    expect(backup.allDevices()).toHaveLength(1);
    expect(() => register(backup)).toThrow(StoreConflictError);
  });

  it('saves settings and the last seen time', () => {
    const backup = new DriveBackupRepository(context);
    const id = register(backup);
    expect(backup.saveSettings(id, { wifiOnly: false }).settings).toEqual({ wifiOnly: false });
    backup.touchDevice(id, NOW);
    expect(backup.deviceById(id)).toMatchObject({
      last_seen_at: NOW,
      settings: { wifiOnly: false },
    });
  });

  it('keeps one asset per local id, answers have-hashes and counts coverage by state', () => {
    const backup = new DriveBackupRepository(context);
    const id = register(backup);
    const asset = {
      backup_device_id: id,
      local_id: 'l1',
      item_id: first(),
      sha256: SHA,
      state: 'verified',
      at: NOW,
    } as const;
    backup.saveAsset(asset);
    backup.saveAsset({ ...asset, state: 'uploaded' });
    backup.saveAsset({
      ...asset,
      local_id: 'l2',
      item_id: null,
      sha256: OTHER_SHA,
      state: 'uploading',
    });
    expect(backup.findAsset(id, 'l1')?.state).toBe('uploaded');
    expect(backup.assetsOf(id)).toHaveLength(2);
    expect(backup.withHashes([OTHER_SHA]).map((row) => row.local_id)).toEqual(['l2']);
    expect(backup.coverage(id)).toEqual([
      { state: 'uploaded', total: 1 },
      { state: 'uploading', total: 1 },
    ]);
    backup.removeAsset(id, 'l2');
    expect(backup.assetsOf(id)).toHaveLength(1);
  });

  it('refuses an uploaded asset without an item and removes assets with their phone', () => {
    const backup = new DriveBackupRepository(context);
    const id = register(backup);
    const asset = {
      backup_device_id: id,
      local_id: 'l1',
      item_id: null,
      sha256: SHA,
      state: 'uploaded',
      at: NOW,
    } as const;
    expect(() => backup.saveAsset(asset)).toThrow(StoreConflictError);
    backup.saveAsset({ ...asset, item_id: first() });
    backup.removeDevice(id);
    expect(backup.assetsOf(id)).toEqual([]);
  });
});
