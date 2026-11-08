import { describe, expect, it } from 'vitest';
import {
  DRIVE_CONFLICT,
  DRIVE_SYNC_CLIENT,
  type DriveConflict,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { ROOT_ID, rootRow } from '../../nas/data/fixtures';
import { computerViewsOf, type SyncFacts } from './sync-client-row';
import { lastHourOf } from './sync-model';
import {
  computerFactsOf,
  conflictFactOf,
  syncStatItemsOf,
  type SyncStatsInputs,
} from './sync-stats';

const AT = '2026-11-07T10:00:00.000Z';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
const OFFICE = 'b0000000-0000-4000-8000-000000000003';
const PROFILE = 'c0000000-0000-4000-8000-000000000001';

function client(deviceId: string, lastSeenAt: string | null, needBytes = 0): DriveSyncClient {
  return DRIVE_SYNC_CLIENT.parse({
    clientId: deviceId.replace('b0000000', 'd0000000'),
    rootId: ROOT_ID,
    deviceId,
    profileId: PROFILE,
    enabled: true,
    selected: [],
    lastSeq: 1,
    lastSeenAt,
    needBytes,
    errors: [],
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

function facts(patch: Partial<SyncFacts> = {}): SyncFacts {
  return {
    clients: [client(LAPTOP, AT, 25), client(OFFICE, '2026-11-05T12:00:00.000Z')],
    conflicts: [],
    moreConflicts: false,
    computers: new Map([
      [LAPTOP, { deviceId: LAPTOP, name: 'Laptop', online: true }],
      [OFFICE, { deviceId: OFFICE, name: 'Office PC', online: false }],
    ]),
    changes: [],
    now: NOW,
    ...patch,
  };
}

describe('sync stat strip', () => {
  const synced = [{ ...rootRow(ROOT_ID, 'ready'), synced: true }];

  function inputs(patch: Partial<SyncStatsInputs> = {}): SyncStatsInputs {
    return {
      synced,
      computers: computerFactsOf(facts()),
      today: { bytes: 2048, files: 3 },
      hour: lastHourOf([], NOW, null),
      conflicts: { open: 0, more: false, file: null },
      now: NOW,
      stale: false,
      ...patch,
    };
  }

  it('shows the five tiles with their figures', () => {
    const items = syncStatItemsOf(inputs());
    expect(items.map((item) => item.key)).toEqual([
      'folders',
      'computers',
      'moved',
      'hour',
      'conflicts',
    ]);
    expect(items[0]?.caption).toBe('1 shared');
    expect(items[1]).toMatchObject({ value: '2', unit: '· 1 online' });
    expect(items[1]?.caption).toContain('Office PC seen');
    expect(items[3]?.caption).toBe('Nothing moved');
    expect(items[4]).toMatchObject({ value: '0', caption: 'None waiting' });
  });

  it('drops the feed tiles until the feed loads and marks stale numbers', () => {
    const items = syncStatItemsOf(inputs({ today: null, hour: null, stale: true }));
    expect(items.map((item) => item.key)).toEqual(['folders', 'computers', 'conflicts']);
    expect(items.every((item) => item.stale === true)).toBe(true);
  });

  it('warns about open conflicts and names a single file', () => {
    const fact = conflictFactOf({ items: [conflict('Docs/Budget 2027.xlsx')], more: false });
    expect(fact).toEqual({ open: 1, more: false, file: 'Budget 2027.xlsx' });
    expect(syncStatItemsOf(inputs({ conflicts: fact })).at(-1)).toMatchObject({
      value: '1',
      caption: 'Budget 2027.xlsx',
      tone: 'warning',
    });
    expect(conflictFactOf({ items: [conflict('a.txt')], more: true })).toEqual({
      open: 1,
      more: true,
      file: null,
    });
  });
});

describe('computers', () => {
  it('lists each computer once with its latest sighting', () => {
    expect(computerFactsOf(facts())).toEqual([
      { name: 'Laptop', online: true, lastSeenAt: AT },
      { name: 'Office PC', online: false, lastSeenAt: '2026-11-05T12:00:00.000Z' },
    ]);
  });

  it('builds a row per computer from its folders', () => {
    const root = { ...rootRow(ROOT_ID, 'ready'), synced: true, bytes: 100 };
    const views = computerViewsOf([root], facts());
    expect(views.map((view) => view.sentence)).toEqual([`Getting ${bytes(25)}`, 'Offline']);
    expect(views[0]?.ring).toBe(0.75);
    expect(views[1]?.details).toContain('syncs 1 folder');
  });
});
