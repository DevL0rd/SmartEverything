import { DRIVE_STATS, type DriveStats } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { describe, expect, it } from 'vitest';
import { aboutText, fullInText, growthLabelOf, kindSlicesOf } from './storage-hero';

const GB = 1024 ** 3;

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

function volume(mountId: string, rootId: string, fullInMonths: number | null): object {
  return { mountId, rootIds: [rootId], totalBytes: 1000 * GB, freeBytes: 500 * GB, fullInMonths };
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

describe('Storage hero', () => {
  it('colours the donut by file kind only and drops empty kinds', () => {
    const slices = kindSlicesOf(
      stats({
        kinds: [
          { kind: 'image', items: 3, bytes: 90 * GB },
          { kind: 'audio', items: 0, bytes: 0 },
          { kind: 'other', items: 1, bytes: 10 * GB },
        ],
      }),
    );
    expect(slices.map((slice) => [slice.label, slice.colour])).toEqual([
      ['Images', 'viz-1'],
      ['Other', 'track'],
    ]);
  });

  it('says how long until a disk is full in months or years', () => {
    expect(aboutText(0.4)).toBe('less than a month');
    expect(aboutText(1)).toBe('about 1 month');
    expect(aboutText(7.4)).toBe('about 7 months');
    expect(aboutText(46)).toBe('about 4 years');
  });

  it('has no forecast without the hub forecast', () => {
    expect(fullInText(stats({ volumes: [volume('1', A, null)] }), [])).toBeNull();
  });

  it('names the disk that fills first when there are several', () => {
    const several = stats({ volumes: [volume('1', A, 30), volume('2', B, 9)] });
    expect(
      fullInText(several, [
        { mountId: '1', name: 'Media disk' },
        { mountId: '2', name: 'Projects' },
      ]),
    ).toBe('Projects is full in about 9 months at this pace');
    expect(fullInText(stats({ volumes: [volume('1', A, 48)] }), [])).toBe(
      'Full in about 4 years at this pace',
    );
  });

  it('describes the growth line from its first to its last day', () => {
    const label = growthLabelOf([
      { day: '2026-08-01', items: 1, bytes: 100 * GB, added: 1, removed: 0 },
      { day: '2026-11-01', items: 2, bytes: 200 * GB, added: 1, removed: 0 },
    ]);
    expect(label.startsWith(`Used space from ${bytes(100 * GB)} on `)).toBe(true);
    expect(label.endsWith(`to ${bytes(200 * GB)} now`)).toBe(true);
  });
});
