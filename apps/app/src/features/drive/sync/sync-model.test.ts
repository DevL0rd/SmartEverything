import { describe, expect, it } from 'vitest';
import {
  DRIVE_CONFLICT,
  DRIVE_RECENT_ENTRY,
  DRIVE_SYNC_CLIENT,
  type DriveConflict,
  type DriveRecentEntry,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { dayKeyOf } from '../../../format/time';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';
import {
  CHANGE_DAYS,
  HOUR_MS,
  HOUR_STEPS,
  SYNC_CLIENT_STATES,
  SYNC_STATE_LOOK,
  changeBarsOf,
  changeWindowCovered,
  clientStatusOf,
  clientViewOf,
  folderSubtitleOf,
  lastHourOf,
  movedTodayOf,
  selectiveOf,
  syncChangesOf,
  syncSentenceOf,
  syncSubtitleOf,
  syncableRootsOf,
  syncedRootsOf,
  worstStatusOf,
  type SyncChange,
  type SyncClientStatus,
} from './sync-model';

const AT = '2026-11-07T10:00:00.000Z';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const GIB = 1024 ** 3;
const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
const OFFICE = 'b0000000-0000-4000-8000-000000000003';
const PROFILE = 'c0000000-0000-4000-8000-000000000001';

function client(
  patch: Partial<Pick<DriveSyncClient, 'needBytes' | 'errors'>> = {},
): DriveSyncClient {
  return DRIVE_SYNC_CLIENT.parse({
    clientId: 'd0000000-0000-4000-8000-000000000002',
    rootId: ROOT_ID,
    deviceId: LAPTOP,
    profileId: PROFILE,
    enabled: true,
    selected: [],
    lastSeq: 1,
    lastSeenAt: AT,
    needBytes: 0,
    errors: [],
    ...patch,
  });
}

function conflict(relPath: string): DriveConflict {
  return DRIVE_CONFLICT.parse({
    id: 'e0000000-0000-4000-8000-000000000001',
    rootId: ROOT_ID,
    itemId: 'e0000000-0000-4000-8000-000000000002',
    conflictItemId: 'e0000000-0000-4000-8000-000000000003',
    relPath,
    conflictRelPath: `${relPath}.conflict`,
    hubRev: 2,
    baseRev: 1,
    deviceId: LAPTOP,
    profileId: PROFILE,
    at: AT,
    resolvedAt: null,
    resolution: null,
  });
}

function entry(raw: object, itemBytes = 10): DriveRecentEntry {
  return DRIVE_RECENT_ENTRY.parse({
    item: {
      id: 'e0000000-0000-4000-8000-000000000009',
      rootId: ROOT_ID,
      parentId: null,
      relPath: 'Budget 2027.xlsx',
      name: 'Budget 2027.xlsx',
      modifiedAt: AT,
      addedAt: AT,
      openedAt: null,
      starred: false,
      rev: 1,
      etag: 'e1',
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      mime: 'application/vnd.ms-excel',
      bytes: itemBytes,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      kind: 'document',
    },
    at: AT,
    ...raw,
  });
}

function change(at: number, patch: Partial<SyncChange> = {}): SyncChange {
  return {
    rootId: ROOT_ID,
    via: 'sync',
    deviceId: LAPTOP,
    at: new Date(at).toISOString(),
    bytes: 100,
    ...patch,
  };
}

const EVERY_STATE: readonly SyncClientStatus[] = [
  { state: 'upToDate' },
  { state: 'moving', needBytes: 1.2 * GIB },
  { state: 'waiting', needBytes: GIB },
  { state: 'offline', needBytes: 1.4 * GIB },
  { state: 'conflict', conflicts: 1, more: false, file: 'Budget 2027.xlsx' },
  { state: 'failed', problems: 1, message: 'Permission denied' },
  { state: 'blocked', reason: 'disk full' },
  { state: 'rescanning' },
  { state: 'resuming', offsetBytes: 512 * 1024 ** 2 },
];

describe('sync state sentences and colours', () => {
  it('says what is happening and how much for every state', () => {
    expect(EVERY_STATE.map(syncSentenceOf)).toEqual([
      'Up to date',
      `Getting ${bytes(1.2 * GIB)}`,
      `Waiting · ${bytes(GIB)} to get`,
      `Offline · ${bytes(1.4 * GIB)} waiting`,
      '1 conflict · Budget 2027.xlsx',
      'Failed · Permission denied',
      'Blocked · disk full',
      'Rescanning the folder after many changes',
      `Resuming at ${bytes(512 * 1024 ** 2)}`,
    ]);
  });

  it('colours each state by the design meaning', () => {
    expect(SYNC_CLIENT_STATES.map((state) => SYNC_STATE_LOOK[state].ring)).toEqual([
      'positive',
      'info',
      'warning',
      'track',
      'warning',
      'critical',
      'warning',
      'info',
      'info',
    ]);
    expect(SYNC_STATE_LOOK.failed.sentence).toBe('critical');
    expect(SYNC_STATE_LOOK.offline.sentence).toBe('variant');
  });

  it('counts several conflicts and problems', () => {
    expect(syncSentenceOf({ state: 'conflict', conflicts: 3, more: true, file: null })).toBe(
      '3+ conflicts wait for you',
    );
    expect(syncSentenceOf({ state: 'failed', problems: 2, message: 'Disk full' })).toBe(
      '2 problems · Disk full',
    );
    expect(syncSentenceOf({ state: 'offline', needBytes: 0 })).toBe('Offline');
  });
});

describe('client status', () => {
  const facts = { online: true, conflicts: [], moreConflicts: false };

  it('puts errors before conflicts before offline before moving', () => {
    const failing = client({
      needBytes: 5,
      errors: [{ relPath: null, message: 'Permission denied', at: AT }],
    });
    expect(clientStatusOf({ ...facts, client: failing }).state).toBe('failed');
    expect(
      clientStatusOf({
        ...facts,
        client: client(),
        conflicts: [conflict('Docs/Budget 2027.xlsx')],
      }),
    ).toEqual({ state: 'conflict', conflicts: 1, more: false, file: 'Budget 2027.xlsx' });
    expect(clientStatusOf({ ...facts, online: false, client: client({ needBytes: 5 }) })).toEqual({
      state: 'offline',
      needBytes: 5,
    });
    expect(clientStatusOf({ ...facts, client: client({ needBytes: 5 }) }).state).toBe('moving');
    expect(clientStatusOf({ ...facts, client: client() }).state).toBe('upToDate');
  });

  it('picks the worst state for a computer', () => {
    expect(worstStatusOf(EVERY_STATE).state).toBe('failed');
    expect(worstStatusOf([{ state: 'upToDate' }, { state: 'offline', needBytes: 0 }]).state).toBe(
      'offline',
    );
    expect(worstStatusOf([]).state).toBe('upToDate');
  });
});

describe('client view', () => {
  const base = {
    key: 'k',
    name: 'Laptop',
    rootBytes: 100,
    lastSeenAt: AT,
    online: true,
    selected: [],
    extra: null,
    now: NOW,
  };

  it('shows a rate and sparkline only while something moves', () => {
    const hour = lastHourOf([change(NOW - 1000)], NOW, LAPTOP);
    const moving = clientViewOf({ ...base, status: { state: 'moving', needBytes: 25 }, hour });
    expect(moving.ring).toBe(0.75);
    expect(moving.rate).toBe(`${bytes(100)}/h`);
    expect(moving.series).toHaveLength(HOUR_STEPS);
    const idle = clientViewOf({ ...base, status: { state: 'upToDate' }, hour });
    expect(idle.rate).toBeNull();
    expect(idle.series).toEqual([]);
    expect(idle.details).toBe('seen now');
  });

  it('summarises a selective sync choice', () => {
    expect(selectiveOf([])).toBeNull();
    expect(selectiveOf(['Photos/2026'])).toBe('2026 only');
    expect(selectiveOf(['Music', 'Photos/2026', 'Films'])).toBe('Music, 2026 and Films only');
  });
});

describe('changes', () => {
  it('reads written entries from the recent feed and drops opened ones', () => {
    const entries = [
      entry({ kind: 'changed', actorProfileId: null, via: 'sync', deviceId: LAPTOP }, 40),
      entry({ kind: 'opened' }),
    ];
    expect(syncChangesOf(entries)).toEqual([
      { rootId: ROOT_ID, via: 'sync', deviceId: LAPTOP, at: AT, bytes: 40 },
    ]);
  });

  it('knows when the loaded feed reaches back past the change window', () => {
    const today = dayKeyOf(NOW);
    const recent = entry({ kind: 'opened' });
    const old = entry({ kind: 'opened', at: '2026-10-01T10:00:00.000Z' });
    expect(changeWindowCovered([], today)).toBe(false);
    expect(changeWindowCovered([recent], today)).toBe(false);
    expect(changeWindowCovered([recent, old], today)).toBe(true);
  });

  it('sums the last hour of sync traffic per computer', () => {
    const changes = [
      change(NOW - 60_000),
      change(NOW - HOUR_MS - 1),
      change(NOW - 60_000, { deviceId: OFFICE, bytes: 50 }),
      change(NOW - 60_000, { via: 'app' }),
    ];
    expect(lastHourOf(changes, NOW, LAPTOP)).toMatchObject({ bytes: 100, files: 1 });
    expect(lastHourOf(changes, NOW, null)).toMatchObject({ bytes: 150, files: 2 });
  });

  it('counts today and the changes per day of one folder', () => {
    const today = dayKeyOf(NOW);
    const changes = [change(NOW - 1000), change(NOW - 1000, { rootId: OTHER_ROOT_ID })];
    expect(movedTodayOf(changes, today)).toEqual({ bytes: 200, files: 2 });
    const bars = changeBarsOf(changes, ROOT_ID, today);
    expect(bars).toHaveLength(CHANGE_DAYS);
    expect(bars.at(-1)).toEqual({ key: today, value: 1 });
    expect(bars.slice(0, -1).every((bar) => bar.value === 0)).toBe(true);
  });
});

describe('folders and subtitles', () => {
  it('splits synced folders from the ones that can be made synced', () => {
    const plain = rootRow(ROOT_ID, 'ready');
    const synced = { ...rootRow(OTHER_ROOT_ID, 'ready'), synced: true };
    expect(syncedRootsOf([plain, synced])).toEqual([synced]);
    expect(syncableRootsOf([plain, synced])).toEqual([plain]);
  });

  it('describes the page and each folder', () => {
    expect(syncSubtitleOf(0, 0, null)).toBe('No synced folders yet');
    expect(syncSubtitleOf(3, 2, 'Up to date on 2 computers')).toBe(
      '3 synced folders on 2 computers · Up to date on 2 computers',
    );
    expect(
      folderSubtitleOf({
        root: { ...rootRow(ROOT_ID, 'ready'), items: 2 },
        changes: 4,
        selective: 1,
      }),
    ).toContain(`4 changes in ${String(CHANGE_DAYS)} days`);
  });
});
