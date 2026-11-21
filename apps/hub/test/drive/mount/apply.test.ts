import { DRIVE_FEED_ROW, type DriveFeedOp, type DriveFeedRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { changedElsewhereIn } from '../../../src/drive/units/mount';

const NODE = '0e000000-0000-4000-8000-00000000000a';
const OTHER = '0e000000-0000-4000-8000-00000000000b';
const ITEM = '0e000000-0000-4000-8000-000000000001';
const ROOT = '0e000000-0000-4000-8000-000000000002';

function row(rev: number, op: DriveFeedOp, deviceId: string | null): DriveFeedRow {
  return DRIVE_FEED_ROW.parse({
    seq: rev,
    rootId: ROOT,
    itemId: ITEM,
    op,
    rev,
    at: '2026-11-16T00:00:00.000Z',
    actorProfileId: null,
    via: deviceId === null ? 'outside' : 'mount',
    deviceId,
  });
}

function changed(rows: readonly DriveFeedRow[], rev: number, baseRev: number): boolean {
  const newestFirst = [...rows].sort((left, right) => right.rev - left.rev);
  const window = { rows: newestFirst, next: null };
  const store = { driveFeed: { recentOfItem: (): typeof window => window } };
  return changedElsewhereIn(store, { itemId: ITEM, rev, nodeId: NODE, baseRev });
}

describe('a change made elsewhere', () => {
  it('ignores a rename or move of the file by another computer, which keeps its content', () => {
    const rows = [row(2, 'update', NODE), row(3, 'move', OTHER), row(4, 'rename', null)];
    expect(changed(rows, 4, 2)).toBe(false);
  });

  it('still sees a content change made elsewhere after a rename', () => {
    expect(changed([row(3, 'rename', OTHER), row(4, 'update', null)], 4, 2)).toBe(true);
  });
});
