import { describe, expect, it } from 'vitest';
import {
  DRIVE_CONFLICT,
  DRIVE_VERSION,
  type DriveConflict,
  type DriveVersion,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { clock } from '../../../format/time';
import { ROOT_ID } from '../data/fixtures';
import { CURRENT } from '../versions/versions-model';
import {
  UNKNOWN_CLIENT,
  comparePicksOf,
  conflictActionsOf,
  copyWellsOf,
  hubMakerOf,
  keepLabelOf,
  openConflictsOf,
  resolvedMessageOf,
  sentenceOf,
  sidesOf,
  type ConflictNamers,
  type ConflictSides,
} from './conflict-model';

const SAM = 'e1b2c3d4-0000-4000-8000-000000000002';
const LAPTOP = 'e1b2c3d4-0000-4000-8000-000000000003';
const WORKSTATION = 'e1b2c3d4-0000-4000-8000-000000000006';
const ITEM_ID = 'e1b2c3d4-0000-4000-8000-000000000004';
const TIME = { now: Date.parse('2026-11-07T15:00:00.000Z'), zone: 'UTC' };

const NAMERS: ConflictNamers = {
  deviceName: (id) => (id === LAPTOP ? 'Laptop' : id === WORKSTATION ? 'Workstation' : null),
  byName: (id) => (id === SAM ? 'Sam' : null),
};

function at(day: string, moment: string, size: number): string {
  return `${day} ${clock(moment, 'UTC')} · ${bytes(size)}`;
}

const SIDES: ConflictSides = { hub: 'Workstation', client: 'Laptop' };

function idOf(index: number): string {
  return `f1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function conflict(extra: object = {}): DriveConflict {
  return DRIVE_CONFLICT.parse({
    id: idOf(70),
    rootId: ROOT_ID,
    itemId: ITEM_ID,
    conflictItemId: idOf(71),
    relPath: 'Home/Budget 2027.xlsx',
    conflictRelPath: 'Home/Budget 2027.sync-conflict-20261107-124400-e1b2c3d4.xlsx',
    hubRev: 4,
    baseRev: 3,
    deviceId: LAPTOP,
    profileId: SAM,
    at: '2026-11-07T12:44:00.000Z',
    resolvedAt: null,
    resolution: null,
    ...extra,
  });
}

function version(rev: number, at: string, size: number, extra: object = {}): DriveVersion {
  return DRIVE_VERSION.parse({
    id: idOf(rev),
    itemId: ITEM_ID,
    rev,
    sha256: 'a'.repeat(64),
    bytes: size,
    at,
    purgeAt: '2027-11-07T10:00:00.000Z',
    actorProfileId: SAM,
    via: 'sync',
    deviceId: WORKSTATION,
    addedByProfileId: SAM,
    ...extra,
  });
}

const HISTORY: readonly DriveVersion[] = [
  version(4, '2026-11-07T14:00:00.000Z', 90_000, { via: 'app', deviceId: null }),
  version(3, '2026-11-07T12:41:00.000Z', 88_000),
  version(2, '2026-11-06T09:00:00.000Z', 80_000),
];

describe('the three buttons', () => {
  it('reads Keep hub version, Keep client version, Keep both on desktop, in that order', () => {
    expect(conflictActionsOf(SIDES, true)).toEqual([
      { resolution: 'keep_hub', label: 'Keep hub version (Workstation)', variant: 'outlined' },
      { resolution: 'keep_client', label: 'Keep Laptop version', variant: 'outlined' },
      { resolution: 'keep_both', label: 'Keep both', variant: 'tonal' },
    ]);
  });

  it('puts Keep both first on the phone with the same words', () => {
    expect(conflictActionsOf(SIDES, false).map((action) => action.label)).toEqual([
      'Keep both',
      'Keep hub version (Workstation)',
      'Keep Laptop version',
    ]);
  });

  it('keeps Keep both as the one tonal default on every platform', () => {
    for (const pointer of [true, false]) {
      const tonal = conflictActionsOf(SIDES, pointer).filter(
        (action) => action.variant === 'tonal',
      );
      expect(tonal.map((action) => action.resolution)).toEqual(['keep_both']);
    }
  });

  it('drops the computer from Keep hub version when nobody knows which made it', () => {
    expect(keepLabelOf('keep_hub', { hub: null, client: 'Laptop' })).toBe('Keep hub version');
    expect(keepLabelOf('keep_client', { hub: null, client: UNKNOWN_CLIENT })).toBe(
      'Keep the other version',
    );
  });

  it('says what was kept once the hub settles it', () => {
    expect(resolvedMessageOf('keep_hub', SIDES)).toBe('Kept the hub version');
    expect(resolvedMessageOf('keep_client', SIDES)).toBe('Kept the Laptop version');
    expect(resolvedMessageOf('keep_both', SIDES)).toBe('Kept both copies');
  });
});

describe('the sentence', () => {
  it('names the client and the computer that made the hub version', () => {
    expect(sentenceOf(SIDES)).toBe('Laptop and Workstation changed it before they synced');
  });

  it('names the hub when the hub version has no known maker or the same name', () => {
    expect(sentenceOf({ hub: null, client: 'Laptop' })).toBe(
      'Laptop and the hub changed it before they synced',
    );
    expect(sentenceOf({ hub: 'Laptop', client: 'Laptop' })).toBe(
      'Laptop and the hub changed it before they synced',
    );
    expect(sentenceOf({ hub: 'Sam', client: UNKNOWN_CLIENT })).toBe(
      'The other computer and Sam changed it before they synced',
    );
  });

  it('writes you in lower case inside the sentence', () => {
    expect(sentenceOf({ hub: 'You', client: 'Laptop' })).toBe(
      'Laptop and you changed it before they synced',
    );
  });
});

describe('sidesOf', () => {
  it('credits the hub version to the write that made it and the client to its device', () => {
    const maker = hubMakerOf({ rev: 4, addedByProfileId: SAM }, HISTORY, 4);
    expect(maker).toEqual({ deviceId: WORKSTATION, profileId: SAM });
    expect(sidesOf(conflict(), maker, NAMERS)).toEqual(SIDES);
  });

  it('falls to the person when the hub version was written in the app', () => {
    const maker = hubMakerOf({ rev: 5, addedByProfileId: SAM }, HISTORY, 5);
    expect(sidesOf(conflict(), maker, NAMERS)).toEqual({ hub: 'Sam', client: 'Laptop' });
  });

  it('credits a first version to the person who added the file', () => {
    expect(hubMakerOf({ rev: 1, addedByProfileId: SAM }, [], 1)).toEqual({
      deviceId: null,
      profileId: SAM,
    });
    expect(hubMakerOf({ rev: 4, addedByProfileId: SAM }, [], 4)).toBeNull();
  });
});

describe('comparePicksOf', () => {
  it('picks the hub version as A and the version both started from as B', () => {
    expect(comparePicksOf(conflict(), { rev: 4 }, HISTORY)).toEqual({ a: CURRENT, b: idOf(3) });
    expect(comparePicksOf(conflict(), { rev: 6 }, HISTORY)).toEqual({ a: idOf(4), b: idOf(3) });
  });

  it('leaves the picks to the sheet when the hub version is not loaded', () => {
    expect(comparePicksOf(conflict({ hubRev: 9, baseRev: 8 }), { rev: 10 }, HISTORY)).toBeNull();
  });
});

describe('copyWellsOf', () => {
  it('shows each copy with its maker, time and size', () => {
    expect(
      copyWellsOf({
        conflict: conflict(),
        sides: SIDES,
        item: { rev: 4, modifiedAt: '2026-11-07T12:41:00.000Z', bytes: 88_000 },
        copy: { modifiedAt: '2026-11-07T12:44:00.000Z', bytes: 91_000 },
        versions: HISTORY,
        time: TIME,
      }),
    ).toEqual([
      {
        title: 'Hub version',
        name: 'Workstation',
        detail: at('Today', '2026-11-07T12:41:00.000Z', 88_000),
      },
      {
        title: 'Laptop version',
        name: 'Laptop',
        detail: at('Today', '2026-11-07T12:44:00.000Z', 91_000),
      },
    ]);
  });

  it('reads the hub copy from Versions once a newer write replaced it', () => {
    const [hub] = copyWellsOf({
      conflict: conflict({ hubRev: 3, baseRev: 2 }),
      sides: SIDES,
      item: { rev: 5, modifiedAt: '2026-11-07T14:30:00.000Z', bytes: 99_000 },
      copy: null,
      versions: HISTORY,
      time: TIME,
    });
    expect(hub.detail).toBe(at('Yesterday', '2026-11-06T09:00:00.000Z', 88_000));
  });
});

describe('openConflictsOf', () => {
  it('keeps only conflicts still waiting for a choice', () => {
    const settled = conflict({
      id: idOf(80),
      resolvedAt: '2026-11-07T14:10:00.000Z',
      resolution: 'keep_both',
    });
    expect(openConflictsOf([conflict(), settled]).map((one) => one.id)).toEqual([idOf(70)]);
  });
});
