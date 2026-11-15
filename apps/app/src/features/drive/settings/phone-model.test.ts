import { describe, expect, it } from 'vitest';
import type { DriveOfflineItem } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { documentFixture, folderFixture } from '../data/fixtures';
import { phoneRowLineOf, phoneSegmentsOf, phoneSummaryOf } from './phone-model';

const CLIENT = '00000000-0000-4000-8000-0000000000c1';
const ME = '00000000-0000-4000-8000-0000000000e1';
const AT = '2026-11-14T08:00:00.000Z';

function pin(itemId: string, patch: Partial<DriveOfflineItem> = {}): DriveOfflineItem {
  return {
    clientId: CLIENT,
    itemId,
    profileId: ME,
    state: 'ready',
    bytes: 2048,
    syncedRev: 1,
    error: null,
    updatedAt: AT,
    ...patch,
  };
}

const FILE = '00000000-0000-4000-8000-000000000101';
const FOLDER = '00000000-0000-4000-8000-000000000102';

describe('this phone', () => {
  it('says what each kept item is doing', () => {
    const doc = documentFixture({ id: FILE, name: 'Budget.xlsx' });
    expect(phoneRowLineOf(pin(FILE), doc)).toEqual({
      itemId: FILE,
      name: 'Budget.xlsx',
      folder: false,
      line: `Kept · ${bytes(2048)}`,
      tone: 'variant',
    });
    const folder = folderFixture({ id: FOLDER, name: 'Taxes' });
    const waiting = pin(FOLDER, { state: 'waiting', bytes: 0, syncedRev: null });
    expect(phoneRowLineOf(waiting, folder)).toMatchObject({
      folder: true,
      line: 'Copying to this phone',
      tone: 'info',
    });
    const failed = pin(FILE, { state: 'failed', syncedRev: null, error: 'Too little space' });
    expect(phoneRowLineOf(failed, undefined)).toMatchObject({
      name: 'A file you can no longer open',
      line: 'Not copied: Too little space',
      tone: 'critical',
    });
  });

  it('splits the space bar by item, largest first, leaving out empty copies', () => {
    const rows = [pin(FILE, { bytes: 10 }), pin(FOLDER, { bytes: 30 }), pin('x', { bytes: 0 })];
    const segments = phoneSegmentsOf(rows, (itemId) => itemId.slice(-3));
    expect(segments.map((segment) => [segment.label, segment.value])).toEqual([
      ['102', 30],
      ['101', 10],
    ]);
  });

  it('sums the kept items and prefers the space the phone reports', () => {
    const rows = [pin(FILE, { bytes: 10 }), pin(FOLDER, { bytes: 30 })];
    expect(phoneSummaryOf(rows, null)).toBe(`2 items kept · ${bytes(40)} on this phone`);
    expect(phoneSummaryOf(rows.slice(0, 1), 500)).toBe(`1 item kept · ${bytes(500)} on this phone`);
  });
});
