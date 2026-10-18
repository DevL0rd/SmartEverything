import type { SyncActivity } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { activityLineOf, activityMatches, filterCounts, groupByDay } from './activity-model';

const PEER = 'AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH';
const NOW = new Date(2026, 9, 17, 14, 0).getTime();

function entry(overrides: Partial<SyncActivity>): SyncActivity {
  return {
    id: 1,
    at: new Date(2026, 9, 17, 11, 53).toISOString(),
    kind: 'modified',
    folderId: 'photos',
    path: 'Holidays/2024/Lisbon/IMG_2100.HEIC',
    deviceId: null,
    remote: false,
    ...overrides,
  };
}

describe('groupByDay', () => {
  it('starts a new group when the day changes and labels today and yesterday', () => {
    const days = groupByDay(
      [
        entry({ id: 3, at: new Date(2026, 9, 17, 11, 53).toISOString() }),
        entry({ id: 2, at: new Date(2026, 9, 17, 9, 5).toISOString() }),
        entry({ id: 1, at: new Date(2026, 9, 16, 22, 30).toISOString() }),
      ],
      NOW,
    );
    expect(days.map((day) => day.label)).toEqual(['Today', 'Yesterday']);
    expect(days.map((day) => day.entries.map((item) => item.id))).toEqual([[3, 2], [1]]);
  });

  it('has no groups without entries', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('filters', () => {
  const entries = [
    entry({ id: 1 }),
    entry({ id: 2, kind: 'error' }),
    entry({ id: 3, kind: 'connected', folderId: null, path: null, deviceId: PEER }),
    entry({ id: 4, kind: 'paused', path: null }),
    entry({ id: 5, folderId: 'docs' }),
  ];

  it('counts files, devices and errors apart', () => {
    expect(filterCounts(entries, '')).toEqual({ all: 5, files: 2, devices: 1, errors: 1 });
  });

  it('narrows to one folder', () => {
    expect(filterCounts(entries, 'docs')).toEqual({ all: 1, files: 1, devices: 0, errors: 0 });
    expect(activityMatches(entry({ folderId: 'photos' }), 'files', 'docs')).toBe(false);
  });
});

describe('activityLineOf', () => {
  it('names the file and puts the folder and directory in the detail line', () => {
    const line = activityLineOf(entry({}), null);
    expect(line).toMatchObject({
      word: 'Changed',
      name: 'IMG_2100.HEIC',
      file: true,
      detail: 'photos · Holidays/2024/Lisbon',
      detailPath: true,
      critical: false,
    });
  });

  it('marks a failed file critical with a plain title', () => {
    const line = activityLineOf(entry({ kind: 'error' }), null);
    expect(line.word).toBe('Couldn’t sync');
    expect(line.critical).toBe(true);
    expect(line.icon).toBe('warning');
  });

  it('says where a remote change came from', () => {
    const line = activityLineOf(entry({ remote: true, deviceId: PEER, path: 'a.txt' }), null);
    expect(line.detail).toBe(`photos · from ${PEER.slice(0, 7)}`);
    expect(line.detailPath).toBe(false);
  });

  it('describes a device event without a path', () => {
    const line = activityLineOf(
      entry({ kind: 'connected', folderId: null, path: null, deviceId: PEER }),
      null,
    );
    expect(line).toMatchObject({ file: false, word: 'Connected', name: PEER.slice(0, 7) });
  });
});
