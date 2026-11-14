import { describe, expect, it } from 'vitest';
import { ROOT_ID, OTHER_ROOT_ID } from './fixtures';
import { progressAfter } from './progress';
import type { DriveProgressNotice } from '@smarteverything/domain';

function notice(
  rootId: string,
  phase: DriveProgressNotice['phase'],
  done: number,
  total: number,
): DriveProgressNotice {
  return { type: 'drive_progress', rootId, phase, done, total };
}

describe('drive progress slice', () => {
  it('tracks each phase of each root', () => {
    const first = progressAfter({}, notice(ROOT_ID, 'scan', 2, 10));
    const second = progressAfter(first, notice(ROOT_ID, 'hash', 1, 5));
    expect(second).toEqual({
      [ROOT_ID]: { scan: { done: 2, total: 10 }, hash: { done: 1, total: 5 } },
    });
  });

  it('drops a phase when it completes and the root when nothing is left', () => {
    const running = progressAfter(
      progressAfter({}, notice(ROOT_ID, 'scan', 2, 10)),
      notice(ROOT_ID, 'hash', 1, 5),
    );
    const scanned = progressAfter(running, notice(ROOT_ID, 'scan', 10, 10));
    expect(scanned).toEqual({ [ROOT_ID]: { hash: { done: 1, total: 5 } } });
    expect(progressAfter(scanned, notice(ROOT_ID, 'hash', 5, 5))).toEqual({});
  });

  it('keeps other roots untouched and their identity stable', () => {
    const other = progressAfter({}, notice(OTHER_ROOT_ID, 'scan', 1, 3));
    const next = progressAfter(other, notice(ROOT_ID, 'scan', 1, 3));
    expect(next[OTHER_ROOT_ID]).toBe(other[OTHER_ROOT_ID]);
  });
});
