import { DRIVE_USAGE, type DriveUsage } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import {
  NO_QUOTA,
  QUOTA_UNKNOWN,
  diskViewOf,
  peopleUsageOf,
  quotaOf,
  sharedDriveUsageOf,
  usageLineOf,
} from './usage-model';

const GB = 1024 ** 3;
const ME = '00000000-0000-4000-8000-0000000000a1';
const SAM = '00000000-0000-4000-8000-0000000000b1';
const GONE = '00000000-0000-4000-8000-0000000000c1';

function usage(profileId: string | null, live: number, versions = 0, trash = 0): DriveUsage {
  return DRIVE_USAGE.parse({
    profileId,
    items: 10,
    folders: 2,
    live: live * GB,
    versions: versions * GB,
    trash: trash * GB,
  });
}

const PEOPLE = [
  { id: ME, name: 'Dana', colour: 'aqua' },
  { id: SAM, name: 'Sam', colour: 'rose' },
] as const;

describe('Storage usage lines', () => {
  it('splits a drive into files, versions and trash against its quota', () => {
    const line = usageLineOf(usage(ME, 30, 5, 5), { known: true, bytes: 200 * GB });
    expect(line.segments.map((segment) => [segment.label, segment.value])).toEqual([
      ['Files', 30 * GB],
      ['Versions', 5 * GB],
      ['Trash', 5 * GB],
    ]);
    expect(line.total).toBe(200 * GB);
    expect(line.used).toBe(`${bytes(40 * GB)} of ${bytes(200 * GB)}`);
    expect(line.counts).toBe('10 files · 2 folders');
    expect(line.tone).toBe('variant');
  });

  it('warns near the quota, turns critical when full and fills the bar past it', () => {
    expect(usageLineOf(usage(ME, 185), { known: true, bytes: 200 * GB }).tone).toBe('warning');
    const over = usageLineOf(usage(ME, 210), { known: true, bytes: 200 * GB });
    expect(over.tone).toBe('critical');
    expect(over.total).toBe(210 * GB);
  });

  it('says no limit only when the quotas are known, else just the used space', () => {
    expect(usageLineOf(usage(ME, 30), NO_QUOTA).used).toBe(`${bytes(30 * GB)} · no limit set`);
    expect(usageLineOf(usage(ME, 30), QUOTA_UNKNOWN).used).toBe(`${bytes(30 * GB)} used`);
    expect(quotaOf(null, ME)).toEqual(QUOTA_UNKNOWN);
    expect(quotaOf([{ profileId: SAM, bytes: GB }], ME)).toEqual(NO_QUOTA);
  });
});

describe('Storage people list', () => {
  it('gives one totals row per known person, biggest first, and marks you', () => {
    const rows = peopleUsageOf({
      usage: [usage(ME, 10), usage(null, 90), usage(SAM, 40), usage(GONE, 5)],
      quotas: [{ profileId: SAM, bytes: 50 * GB }],
      people: PEOPLE,
      me: ME,
    });
    expect(rows.map((row) => [row.person.name, row.you, row.quota])).toEqual([
      ['Sam', false, { known: true, bytes: 50 * GB }],
      ['Dana', true, NO_QUOTA],
    ]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['person', 'quota', 'usage', 'you']);
  });

  it('reads the Shared Drive from its usage row, or from the drive itself for a member', () => {
    expect(sharedDriveUsageOf([usage(null, 90, 1, 2)], null)?.trash).toBe(2 * GB);
    expect(sharedDriveUsageOf([usage(ME, 10)], { items: 4, folders: 1, bytes: 7 * GB })).toEqual({
      profileId: null,
      items: 4,
      folders: 1,
      live: 7 * GB,
      versions: 0,
      trash: 0,
    });
    expect(sharedDriveUsageOf([], null)).toBeNull();
  });
});

describe('Data folder disk', () => {
  const stats = {
    space: { totalBytes: 1000 * GB, freeBytes: 400 * GB, fsType: 'ext4' },
    liveBytes: 100 * GB,
    versionBytes: 10 * GB,
    trashBytes: 10 * GB,
  };

  it('splits used space into every drive and other Hub data for the owner', () => {
    const disk = diskViewOf({ stats, usage: [usage(ME, 100), usage(SAM, 300)], owner: true });
    expect(disk.segments.map((segment) => [segment.label, segment.value])).toEqual([
      ['Drives', 400 * GB],
      ['Other Hub data', 200 * GB],
    ]);
    expect(disk.used).toBe(`${bytes(600 * GB)} of ${bytes(1000 * GB)} used`);
    expect(disk.free).toBe(`${bytes(400 * GB)} free`);
    expect(disk.fsType).toBe('ext4');
  });

  it('shows a member only their own drives against everything else on the disk', () => {
    const disk = diskViewOf({ stats, usage: [usage(ME, 100)], owner: false });
    expect(disk.segments.map((segment) => [segment.label, segment.value])).toEqual([
      ['Your drives', 120 * GB],
      ['Everything else', 480 * GB],
    ]);
  });

  it('warns when the disk is nearly full', () => {
    const full = { ...stats, space: { ...stats.space, freeBytes: 50 * GB } };
    expect(diskViewOf({ stats: full, usage: null, owner: false }).tone).toBe('warning');
  });
});
