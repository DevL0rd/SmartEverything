import { describe, expect, it } from 'vitest';
import type { MediaJob, MediaProcessing } from '@smarteverything/domain';
import type { UploadEntry } from '../../nas/uploads';
import { bytes } from '../../../format/number';
import { INITIAL_BACKUP_STATUS } from './model/status';
import { growthShapeOf } from './growth-model';
import {
  addedInMonth,
  freeUpBodyOf,
  freeUpConfirmOf,
  freeUpLabelOf,
  jobsLeftText,
  monthlyGrowthOf,
  processingOf,
  unreadableText,
} from './stats-model';
import { thisPhoneCopy } from './this-phone-model';
import { ALREADY_THERE_PHONE, sheetEntryText, sheetTargetText } from './upload-sheet-model';

const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000009';

interface Day {
  readonly day: string;
  readonly items: number;
  readonly bytes: number;
  readonly added: number;
  readonly removed: number;
}

function day(date: string, bytes: number, added = 0): Day {
  return { day: date, items: 0, bytes, added, removed: 0 };
}

describe('uploaded per day', () => {
  it('uses the days of the current month only', () => {
    const growth = [day('2026-10-31', 1, 9), day('2026-11-01', 2, 4), day('2026-11-02', 3, 6)];
    const added = addedInMonth(growth, '2026-11');
    expect(added?.items).toBe(10);
    expect(added?.bars.map((bar) => bar.value)).toEqual([4, 6]);
    expect(addedInMonth(growth, '2026-12')).toBeNull();
    expect(addedInMonth(null, '2026-11')).toBeNull();
  });
});

describe('growth and its projection', () => {
  const growth = [day('2026-09-01', 100), day('2026-10-01', 130), day('2026-10-31', 160)];

  it('measures the monthly pace from the first and last day', () => {
    expect(monthlyGrowthOf(growth)).toBeCloseTo((60 / 60) * (365.25 / 12));
    expect(monthlyGrowthOf(null)).toBeNull();
  });

  it('draws a dashed projection past the last day only while the library grows', () => {
    const shape = growthShapeOf(growth, monthlyGrowthOf(growth), 340, 88);
    expect(shape?.line.startsWith('M0.0 ')).toBe(true);
    expect(shape?.projection?.endsWith(' 0.0')).toBe(true);
    expect(growthShapeOf(growth, 0, 340, 88)?.projection).toBeNull();
    expect(growthShapeOf(growth.slice(0, 1), 10, 340, 88)).toBeNull();
    expect(growthShapeOf(growth, 10, 0, 88)).toBeNull();
  });
});

describe('processing', () => {
  const ITEM = 'a1b2c3d4-0000-4000-8000-000000000001';
  function failed(id: string, kind: MediaJob['kind']): MediaJob {
    return {
      id,
      kind,
      itemId: ITEM,
      rev: 1,
      state: 'failed',
      attempts: 3,
      error: 'unsupported',
      modelVersion: null,
      queuedAt: '2026-11-07T10:00:00.000Z',
    };
  }
  const processing: MediaProcessing = {
    queued: 1200,
    running: 4,
    failed: [
      failed('a1b2c3d4-0000-4000-8000-000000000002', 'preview'),
      failed('a1b2c3d4-0000-4000-8000-000000000003', 'poster'),
    ],
  };

  it('counts jobs left and lists each unreadable file once', () => {
    const view = processingOf(processing, new Map([['preview', { done: 96, total: 100 }]]));
    expect(view.left).toBe(1204);
    expect(view.failedItems).toHaveLength(1);
    expect(view.rows).toEqual([
      { key: 'preview', label: 'Previews', progress: 0.96, note: '4 left', done: false },
    ]);
    expect(jobsLeftText(1204)).toBe('1,204 jobs left · visible items first');
    expect(jobsLeftText(0)).toBe('Nothing waiting');
    expect(unreadableText(3)).toBe(
      '3 files could not be read. The originals stay and can be downloaded.',
    );
  });
});

describe('free up space', () => {
  const freeable = { localIds: ['a', 'b'], bytes: 8.4 * 1024 ** 3 };

  it('names the size and promises the hub has checked each item', () => {
    expect(freeUpLabelOf(freeable)).toBe(`Free up ${bytes(freeable.bytes)}`);
    expect(freeUpBodyOf(freeable)).toBe(
      'Removes 2 photos and videos from this phone that the hub already has and has checked. They stay in Photos.',
    );
    expect(freeUpConfirmOf(freeable)).toMatchObject({
      cancelLabel: 'Keep them',
      confirmLabel: `Free up ${bytes(freeable.bytes)}`,
    });
  });
});

describe('this phone', () => {
  it('says what is left and how much is on the hub', () => {
    const copy = thisPhoneCopy(
      {
        ...INITIAL_BACKUP_STATUS,
        phase: 'uploading',
        total: 12_440,
        done: 12_406,
        bytesLeft: 412 * 1024 ** 2,
      },
      'Pixel 9',
      34,
    );
    expect(copy.title).toBe('This phone · Pixel 9');
    expect(copy.left).toBe(`34 left · ${bytes(412 * 1024 ** 2)}`);
    expect(copy.detail).toBe('12,406 of 12,440 on the hub');
    expect(copy.tone).toBe('primary');
    expect(thisPhoneCopy({ ...INITIAL_BACKUP_STATUS, phase: 'idle' }, null, 0)).toMatchObject({
      title: 'This phone',
      left: 'Nothing left to back up',
      tone: 'positive',
    });
  });
});

describe('the upload sheet', () => {
  it('says where uploads go and marks files the hub already has', () => {
    expect(sheetTargetText(null, 'Alex')).toBe('Goes to Uploads/Alex in the library folder');
    expect(sheetTargetText('Uploads/Sam', 'Alex')).toBe(
      'Goes to Uploads/Sam in the library folder',
    );
    const entry: UploadEntry = {
      id: '1',
      name: 'Garden.jpg',
      size: 10,
      sent: 10,
      state: 'settled',
      outcome: { kind: 'already-have', itemId: ITEM_ID },
    };
    expect(sheetEntryText(entry)).toEqual({
      kind: 'note',
      text: ALREADY_THERE_PHONE,
      critical: false,
    });
  });
});
