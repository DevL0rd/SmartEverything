import { describe, expect, it } from 'vitest';
import {
  DRIVE_VERSION,
  type DriveItem,
  type DriveSharedWithMeEntry,
  type DriveVersion,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { AT, FOLDER_ID, folderFixture, imageFixture, personalRootRow } from '../data/fixtures';
import {
  EDIT_DAYS,
  coversItem,
  detailsSubjectOf,
  editWindowStart,
  editsPerDay,
  editsTotal,
  integrityOf,
  needsOlderVersions,
  placementRingOf,
  whoSeesOf,
} from './details-model';

const SAM = 'b1b2c3d4-0000-4000-8000-000000000001';
const LAPTOP = 'd1b2c3d4-0000-4000-8000-000000000001';

function idOf(index: number): string {
  return `c1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base(index: number, name: string, extra: object = {}): object {
  return {
    id: idOf(index),
    parentId: FOLDER_ID,
    relPath: `Home/Kitchen/${name}`,
    name,
    rev: 3,
    addedByProfileId: SAM,
    ...extra,
  };
}

function image(index: number, name: string, extra: object = {}): DriveItem {
  return imageFixture({
    ...base(index, name, extra),
    bytes: 3_400_000,
    integrity: 'ok',
    thumb: { state: 'ready' },
    width: 4032,
    height: 3024,
  });
}

function folder(index: number, name: string): DriveItem {
  return folderFixture({ ...base(index, name), childCount: 4, bytes: 10 });
}

function version(rev: number, at: string, extra: object = {}): DriveVersion {
  return DRIVE_VERSION.parse({
    id: idOf(100 + rev),
    itemId: idOf(1),
    rev,
    sha256: 'a'.repeat(64),
    bytes: 100,
    at,
    purgeAt: '2027-11-07T10:00:00.000Z',
    actorProfileId: SAM,
    via: 'app',
    deviceId: LAPTOP,
    addedByProfileId: SAM,
    ...extra,
  });
}

describe('info lines', () => {
  const item = image(1, 'Island sketch v4.jpg');

  it('says who sees an item of the Shared Drive, of my drive and one shared with me', () => {
    const who = { ownerName: 'Sam', people: [] };
    expect(whoSeesOf({ ...who, access: 'shared' })).toBe('Everyone in the home');
    expect(whoSeesOf({ ...who, access: 'own' })).toBe('Only you');
    expect(whoSeesOf({ ...who, access: 'own', people: ['Sam'] })).toBe('You and Sam');
    expect(whoSeesOf({ ...who, access: 'own', people: ['Sam', 'Robin', 'Ada'] })).toBe(
      'You and Sam, Robin and Ada',
    );
    expect(whoSeesOf({ ...who, access: 'edit' })).toBe('Shared with you by Sam · Can edit');
    expect(whoSeesOf({ ...who, access: 'view', ownerName: null })).toBe(
      'Shared with you by its owner · Can view',
    );
    expect(whoSeesOf({ ...who, access: 'none' })).toBe('Shared with you by Sam');
  });

  it('marks damage as critical and a clean check as positive', () => {
    expect(integrityOf(item)?.tone).toBe('positive');
    expect(integrityOf(image(3, 'b.jpg'))?.text).toBe('Checked, no damage found');
    expect(integrityOf(folder(2, 'Quotes'))).toBeNull();
  });
});

describe('edits per day', () => {
  const today = '2026-11-07';

  it('counts versions into one bar per day of the last 30 days', () => {
    const bars = editsPerDay(
      [
        version(3, '2026-11-07T12:00:00.000Z'),
        version(2, '2026-11-07T12:00:00.000Z'),
        version(1, '2026-11-01T12:00:00.000Z'),
      ],
      today,
    );
    expect(bars).toHaveLength(EDIT_DAYS);
    expect(bars.at(-1)).toEqual({ key: today, value: 2 });
    expect(bars.find((bar) => bar.key === '2026-11-01')?.value).toBe(1);
    expect(editsTotal(bars)).toBe(3);
  });

  it('asks for older versions only until the window is covered', () => {
    const start = editWindowStart(today);
    expect(needsOlderVersions([version(3, '2026-11-07T12:00:00.000Z')], start, true)).toBe(true);
    expect(needsOlderVersions([version(1, '2026-09-01T12:00:00.000Z')], start, true)).toBe(false);
    expect(needsOlderVersions([], start, false)).toBe(false);
  });
});

describe('computer rings', () => {
  type Facts = Parameters<typeof placementRingOf>[0];

  function placement(
    id: string,
    state: Facts['status']['state'],
    extra: Partial<Facts> = {},
  ): Facts {
    return { id, mode: 'synced', hold: null, status: { state, needBytes: 0 }, ...extra };
  }

  it('gives each placement its share of the placed folder and a word from its state', () => {
    const rings = [
      placementRingOf(placement('a', 'up_to_date'), 'Workstation', 4096),
      placementRingOf(
        placement('b', 'syncing', { status: { state: 'syncing', needBytes: 2048 } }),
        'Laptop',
        4096,
      ),
      placementRingOf(placement('c', 'offline'), 'Office PC', 4096),
      placementRingOf(placement('d', 'failed'), 'Den', 4096),
      placementRingOf(placement('e', 'up_to_date', { hold: 'no_access' }), 'Attic', 4096),
      placementRingOf(placement('f', 'mounted', { mode: 'mounted' }), 'Studio', 4096),
      placementRingOf(placement('g', 'failed', { mode: 'mounted' }), 'Shed', 4096),
      placementRingOf(placement('h', 'stopped'), 'Spare', 4096),
    ];
    expect(rings.map((ring) => [ring.name, ring.share, ring.word, ring.tone])).toEqual([
      ['Workstation', 1, 'up to date', 'positive'],
      ['Laptop', 0.5, `${bytes(2048)} left`, 'info'],
      ['Office PC', 1, 'offline', null],
      ['Den', 1, 'sync failed', 'critical'],
      ['Attic', 1, 'on hold', 'warning'],
      ['Studio', 1, 'mounted', 'positive'],
      ['Shed', 1, 'mount failed', 'critical'],
      ['Spare', 1, 'paused', null],
    ]);
  });

  it('counts an item as placed when it is the placed folder or inside it, or the whole drive', () => {
    expect(coversItem(null, 'Home/a.jpg')).toBe(true);
    expect(coversItem('Home', 'Home/a.jpg')).toBe(true);
    expect(coversItem('Home', 'Home')).toBe(true);
    expect(coversItem('Home', 'Homework/a.jpg')).toBe(false);
  });
});

describe('details subject', () => {
  const sharer = 'e1b2c3d4-0000-4000-8000-000000000001';
  const viewer = 'e1b2c3d4-0000-4000-8000-000000000002';
  const theirs = 'e1b2c3d4-0000-4000-8000-000000000003';
  const top = folderFixture({ id: idOf(70), rootId: theirs, relPath: 'Top', parentId: null });
  const middle = folderFixture({
    id: idOf(71),
    rootId: theirs,
    relPath: 'Top/Middle',
    parentId: top.id,
  });
  const file = imageFixture({
    id: idOf(72),
    rootId: theirs,
    relPath: 'Top/Middle/a.jpg',
    parentId: middle.id,
  });
  const entry = (role: 'view' | 'edit'): DriveSharedWithMeEntry => ({
    item: top,
    grant: {
      id: idOf(73),
      itemId: top.id,
      profileId: viewer,
      role,
      grantedBy: sharer,
      createdAt: AT,
      expiresAt: null,
    },
  });

  it('takes a shared-with-me item from the grant on a folder above, without its drive row', () => {
    const subject = detailsSubjectOf(
      { roots: [], viewerId: viewer, shared: [entry('view')] },
      file,
    );
    expect(subject).toMatchObject({
      rootId: theirs,
      ownerProfileId: sharer,
      versionsKept: null,
      access: 'view',
      writable: false,
    });
  });

  it('keeps the drive facts once the sharer’s drive row is known', () => {
    const root = { ...personalRootRow(theirs, sharer), versions: false };
    const subject = detailsSubjectOf(
      { roots: [root], viewerId: viewer, shared: [entry('edit')] },
      file,
    );
    expect(subject).toMatchObject({ ownerProfileId: sharer, versionsKept: false, access: 'edit' });
    expect(subject.writable).toBe(true);
  });

  it('gives nothing to a viewer with no grant on the item or above it', () => {
    expect(detailsSubjectOf({ roots: [], viewerId: viewer, shared: [] }, file).access).toBe('none');
  });
});
