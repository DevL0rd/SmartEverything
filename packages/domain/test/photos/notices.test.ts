import { describe, expect, it } from 'vitest';
import {
  DRIVE_CHANGED_NOTICE,
  LIVE_NOTICE,
  PHOTOS_ENDPOINTS,
  PHOTOS_PROGRESS_KINDS,
  PHOTOS_PROGRESS_NOTICE,
  PHOTO_RAIL_COUNTS,
} from '../../src';
import { DRIVE_NOTICES } from '../../src/api/live-drive';

const ROOT = '0d000000-0000-4000-8000-000000000001';
const ITEM = '0f000000-0000-4000-8000-000000000001';

const CHANGED = {
  type: 'drive_changed',
  rootIds: [ROOT],
  folderIds: [],
  albumIds: [],
  months: ['2026-03', '2026-04'],
  cursor: 3,
};

const COUNTS = {
  timeline: 10,
  memories: 2,
  albums: 1,
  places: 3,
  favourites: 4,
  videos: 5,
  screenshots: 6,
  cameras: 7,
  ai: 8,
  duplicates: 9,
  backupPhones: 2,
  deleted: 1,
};

describe('drive_changed months', () => {
  it('carries the taken months and is a live notice', () => {
    expect(DRIVE_CHANGED_NOTICE.parse(CHANGED)).toStrictEqual(CHANGED);
    expect(LIVE_NOTICE.parse(CHANGED)).toStrictEqual(CHANGED);
  });

  it('accepts no months as an empty list', () => {
    expect(DRIVE_CHANGED_NOTICE.safeParse({ ...CHANGED, months: [] }).success).toBe(true);
  });

  it('requires the field and refuses anything but yyyy-mm', () => {
    const without = Object.fromEntries(Object.entries(CHANGED).filter(([key]) => key !== 'months'));
    expect(DRIVE_CHANGED_NOTICE.safeParse(without).success).toBe(false);
    expect(DRIVE_CHANGED_NOTICE.safeParse({ ...CHANGED, months: ['2026-13'] }).success).toBe(false);
    expect(DRIVE_CHANGED_NOTICE.safeParse({ ...CHANGED, months: ['March'] }).success).toBe(false);
  });
});

describe('photos_progress', () => {
  it('accepts every kind with an item or a device', () => {
    for (const kind of PHOTOS_PROGRESS_KINDS) {
      const notice = { type: 'photos_progress', kind, itemId: ITEM, done: 1, total: 2 };
      expect(PHOTOS_PROGRESS_NOTICE.parse(notice)).toStrictEqual(notice);
      expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
    }
    const backup = {
      type: 'photos_progress',
      kind: 'backup',
      deviceId: 'phone-1',
      done: 0,
      total: 9,
    };
    expect(PHOTOS_PROGRESS_NOTICE.parse(backup)).toStrictEqual(backup);
  });

  it('refuses done past total, unknown kinds and unknown fields', () => {
    const base = { type: 'photos_progress', kind: 'preview', done: 1, total: 2 };
    expect(PHOTOS_PROGRESS_NOTICE.safeParse({ ...base, done: 3 }).success).toBe(false);
    expect(PHOTOS_PROGRESS_NOTICE.safeParse({ ...base, kind: 'scan' }).success).toBe(false);
    expect(PHOTOS_PROGRESS_NOTICE.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(PHOTOS_PROGRESS_NOTICE.safeParse({ ...base, itemId: 'nope' }).success).toBe(false);
  });

  it('is registered once beside the other drive notices', () => {
    const types = DRIVE_NOTICES.map((notice) => notice.shape.type.value);
    expect(types).toStrictEqual(['drive_changed', 'drive_progress', 'photos_progress']);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('the rail counts', () => {
  it('serves one count per section on a member endpoint', () => {
    expect(PHOTO_RAIL_COUNTS.parse(COUNTS)).toStrictEqual(COUNTS);
    expect(PHOTOS_ENDPOINTS.readPhotoRailCounts.access).toBe('member');
    expect(PHOTOS_ENDPOINTS.readPhotoRailCounts.path).toBe('/api/drive/photos/rail-counts');
  });

  it('leaves duplicates null for a member and refuses a missing or negative count', () => {
    expect(PHOTO_RAIL_COUNTS.safeParse({ ...COUNTS, duplicates: null }).success).toBe(true);
    const without = Object.fromEntries(Object.entries(COUNTS).filter(([key]) => key !== 'deleted'));
    expect(PHOTO_RAIL_COUNTS.safeParse(without).success).toBe(false);
    expect(PHOTO_RAIL_COUNTS.safeParse({ ...COUNTS, videos: -1 }).success).toBe(false);
  });
});
