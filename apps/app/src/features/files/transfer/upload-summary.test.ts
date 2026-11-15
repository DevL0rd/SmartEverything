import { describe, expect, it } from 'vitest';
import { percent } from '../../../format/number';
import type { PickedBlob } from '../../../platform/pick-files';
import type { UploadItem, UploadState } from './upload-queue';
import {
  blockedDropText,
  dropDetail,
  failureLineOf,
  headlineOf,
  isActive,
  itemsIn,
  leftText,
  nextClock,
  overallProgress,
  retryNoticeOf,
  sharedFailureOf,
  summaryOf,
} from './upload-summary';

const BLOB: PickedBlob = {
  name: 'x',
  mime: 'text/plain',
  bytes: 100,
  preview: null,
  data: () => Promise.resolve(new ArrayBuffer(0)),
  blob: () => Promise.resolve(new Blob([])),
};

function item(
  id: string,
  state: UploadState,
  sent: number,
  change: Partial<UploadItem> = {},
): UploadItem {
  return {
    id,
    file: BLOB,
    folder: { place: 'p', folder: null },
    folderKey: 'p',
    name: `${id}.txt`,
    replace: false,
    state,
    sent,
    size: 100,
    storedAs: null,
    error: null,
    retryable: false,
    ...change,
  };
}

describe('upload summary', () => {
  it('keeps the uploads of one folder and leaves cancelled and skipped ones out of the counts', () => {
    const items = [
      item('a', 'done', 100),
      item('b', 'sending', 40),
      item('c', 'cancelled', 0),
      item('d', 'skipped', 0),
      item('e', 'waiting', 0, { folderKey: 'q' }),
    ];
    expect(itemsIn(items, 'p')).toHaveLength(4);
    const summary = summaryOf(itemsIn(items, 'p'));
    expect([summary.total, summary.finished, summary.sending, summary.sent, summary.size]).toEqual([
      2, 1, 1, 140, 200,
    ]);
    expect(overallProgress(summary)).toBe(0.7);
    expect(isActive(summary)).toBe(true);
  });

  it('writes the headline from the counts', () => {
    expect(
      headlineOf(summaryOf([item('a', 'done', 100), item('b', 'sending', 0)]), 'Projects'),
    ).toBe('Uploading 2 of 2 to Projects');
    expect(headlineOf(summaryOf([item('a', 'conflict', 0)]), 'Projects')).toBe(
      '1 name already in Projects',
    );
    expect(headlineOf(summaryOf([item('a', 'paused', 50)]), 'Projects')).toBe(
      'Paused · 0 of 1 sent',
    );
    expect(
      headlineOf(summaryOf([item('a', 'done', 100), item('b', 'have', 100)]), 'Projects'),
    ).toBe('Uploaded 2 files to Projects');
    expect(
      headlineOf(summaryOf([item('a', 'done', 100), item('b', 'failed', 10)]), 'Projects'),
    ).toBe('Uploaded 1 of 2 · 1 failed');
    expect(
      headlineOf(summaryOf([item('a', 'failed', 0), item('b', 'failed', 0)]), 'Projects'),
    ).toBe('2 uploads failed');
  });

  it('names a failure every upload shares once, and keeps distinct reasons per row', () => {
    const refused = { retryable: false, error: 'The hub refused the file.' };
    const same = [item('a', 'failed', 0, refused), item('b', 'failed', 0, refused)];
    expect(sharedFailureOf(same)).toBe('The hub refused the file.');
    const mixed = [...same, item('c', 'failed', 0, { retryable: false, error: 'Too big.' })];
    expect(sharedFailureOf(mixed)).toBeNull();
    expect(sharedFailureOf([item('a', 'failed', 0, refused)])).toBeNull();
  });

  it('times the rate from the first sending sample and resets when nothing sends', () => {
    const first = nextClock(undefined, true, 0, 1000);
    expect(first).toEqual({ startAt: 1000, startSent: 0, rate: null });
    expect(nextClock(first, true, 500, 2000)?.rate).toBe(500);
    expect(nextClock(first, false, 500, 2000)).toBeUndefined();
    const sending = summaryOf([item('a', 'sending', 0, { size: 100_000 })]);
    expect(leftText(sending, 10)).toMatch(/left$/);
    expect(leftText(sending, 100_000)).toBe('Less than a minute left');
    expect(leftText(sending, null)).toBeNull();
  });

  it('says how far a dropped connection got and gathers those uploads into one notice', () => {
    const dropped = item('a', 'failed', 25, { retryable: true, error: 'gone' });
    const refused = item('b', 'failed', 0, { error: 'Your space is full.' });
    expect(failureLineOf(dropped)).toBe(`Failed at ${percent(0.25)}`);
    expect(failureLineOf(refused)).toBe('Your space is full.');
    expect(failureLineOf(item('c', 'done', 100))).toBeNull();
    expect(retryNoticeOf([dropped, refused])?.title).toBe('1 upload failed');
    expect(retryNoticeOf([refused])).toBeNull();
  });

  it('says what happens to a drop by the transport’s naming rule and why a drop is refused', () => {
    expect(dropDetail('number')).toMatch(/get a number/);
    expect(dropDetail('ask')).toMatch(/You choose/);
    expect(blockedDropText(false, true)).toMatch(/connection is back/);
    expect(blockedDropText(true, false)).toMatch(/only view/);
    expect(blockedDropText(true, true)).toBeNull();
  });
});
