import { DRIVE_ROOT, DRIVE_STATS, type DriveRoot, type DriveStats } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { describe, expect, it } from 'vitest';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';
import { volumeNamesOf, volumeRowOf } from './volume-list';

const GB = 1024 ** 3;

function root(id: string, patch: Record<string, unknown>): DriveRoot {
  return DRIVE_ROOT.parse({ ...rootRow(id, 'ready'), ...patch });
}

function stats(patch: Partial<Record<keyof DriveStats, unknown>>): DriveStats {
  return DRIVE_STATS.parse({
    items: 10,
    folders: 2,
    bytes: 300 * GB,
    liveBytes: 300 * GB,
    versionBytes: 0,
    trashBytes: 0,
    kinds: [],
    roots: [],
    volumes: [],
    purges: [],
    growth: null,
    ...patch,
  });
}

const MEDIA = root(ROOT_ID, {
  label: 'Media disk',
  bytes: 200 * GB,
  items: 40,
  volume: { mountId: '41', fsType: 'ext4', network: false },
});

const PROJECTS = root(OTHER_ROOT_ID, {
  label: 'Projects',
  bytes: 100 * GB,
  items: 1,
  readOnly: true,
  state: 'offline',
  volume: { mountId: '41', fsType: 'ext4', network: true },
});

const VOLUME = {
  mountId: '41',
  rootIds: [ROOT_ID, OTHER_ROOT_ID],
  totalBytes: 1000 * GB,
  freeBytes: 600 * GB,
  fullInMonths: null,
};

describe('Storage volumes', () => {
  it('stacks the Drive files and the other files on the disk in non-kind colours', () => {
    const row = volumeRowOf(stats({ volumes: [VOLUME] }).volumes[0] ?? VOLUME, [MEDIA], []);
    expect(row.segments).toEqual([
      { label: 'Drive files', value: 200 * GB, colour: 'primary' },
      { label: 'Other files', value: 200 * GB, colour: 'track' },
    ]);
    expect(row.total).toBe(1000 * GB);
    expect(row.used).toBe(`${bytes(400 * GB)} of ${bytes(1000 * GB)}`);
  });

  it('names the volume after its library folders and shows the filesystem and mount', () => {
    const row = volumeRowOf(
      VOLUME,
      [MEDIA, PROJECTS],
      [{ mountId: '41', mountPoint: '/mnt/media' }],
    );
    expect(row.name).toBe('Media disk, Projects');
    expect(row.caption).toBe('ext4 · /mnt/media');
  });

  it('leaves the mount point out for a member who cannot list the disks', () => {
    expect(volumeRowOf(VOLUME, [MEDIA], []).caption).toBe('ext4');
  });

  it('badges a network disk, a read-only disk and an offline library folder', () => {
    const labels = (roots: readonly DriveRoot[]): readonly string[] =>
      volumeRowOf(VOLUME, roots, []).badges.map((badge) => badge.label);
    expect(labels([MEDIA])).toEqual([]);
    expect(labels([PROJECTS])).toEqual(['Network', 'Read only', 'Offline']);
    expect(labels([MEDIA, PROJECTS])).toEqual(['Offline']);
  });

  it('warns when a disk is getting full or almost full, as on the computer storage page', () => {
    const fill = (freeBytes: number): readonly string[] =>
      volumeRowOf({ ...VOLUME, freeBytes }, [MEDIA], []).badges.map((badge) => badge.label);
    expect(fill(600 * GB)).toEqual([]);
    expect(fill(100 * GB)).toEqual(['Getting full']);
    expect(fill(20 * GB)).toEqual(['Almost full']);
  });

  it('gives every volume a name for the growth line', () => {
    expect(volumeNamesOf(stats({ volumes: [VOLUME] }), [MEDIA])).toEqual([
      { mountId: '41', name: 'Media disk' },
    ]);
  });
});
