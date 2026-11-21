import type { DriveRoot, LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeFeed } from '../../src/store/feed';
import { testLogger } from '../support/logs';
import { sharedDriveRoot } from './drive-roots-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000001';
const OTHER = '0d000000-0000-4000-8000-000000000002';
const QUIET_MS = 2000;

let feed: ChangeFeed;
let heard: LiveChange[];

function counted(root: DriveRoot, files: number): DriveRoot {
  return { ...root, items: files, bytes: files * 100 };
}

function update(before: DriveRoot, after: DriveRoot): void {
  feed.emit({
    type: 'change',
    table: 'drive_roots',
    operation: 'UPDATE',
    record: after,
    oldRecord: before,
  });
}

function totalsOf(change: LiveChange | undefined): unknown {
  if (change?.table !== 'drive_roots') return null;
  return {
    items: change.record?.items,
    previous: change.oldRecord?.items,
    state: change.record?.state,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  feed = new ChangeFeed(testLogger());
  feed.quietTotals(QUIET_MS);
  heard = [];
  feed.subscribe((change) => {
    heard.push(change);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('drive totals on the live feed', () => {
  it('announce one change per settled burst of counter updates', () => {
    const root = sharedDriveRoot(ROOT);
    for (let files = 1; files <= 50; files += 1) {
      update(counted(root, files - 1), counted(root, files));
      vi.advanceTimersByTime(QUIET_MS / 2);
    }
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(QUIET_MS);
    expect(heard.map(totalsOf)).toEqual([{ items: 50, previous: 0, state: 'ready' }]);
  });

  it('keep each drive’s burst apart', () => {
    const root = sharedDriveRoot(ROOT);
    const other = sharedDriveRoot(OTHER);
    update(root, counted(root, 3));
    update(other, counted(other, 7));
    vi.advanceTimersByTime(QUIET_MS);
    expect(heard.map((change) => change.table === 'drive_roots' && change.record?.id)).toEqual([
      ROOT,
      OTHER,
    ]);
  });

  it('send held totals before any other change of that drive', () => {
    const root = sharedDriveRoot(ROOT);
    update(root, counted(root, 4));
    update(counted(root, 4), { ...counted(root, 4), state: 'scanning' });
    expect(heard.map(totalsOf)).toEqual([
      { items: 4, previous: 0, state: 'ready' },
      { items: 4, previous: 4, state: 'scanning' },
    ]);
    vi.advanceTimersByTime(QUIET_MS);
    expect(heard).toHaveLength(2);
    expect(heard[1]?.seq).toBeGreaterThan(heard[0]?.seq ?? 0);
  });

  it('pass a drive row announced again unchanged straight through', () => {
    const root = sharedDriveRoot(ROOT);
    update(root, root);
    expect(heard.map(totalsOf)).toEqual([{ items: 0, previous: 0, state: 'ready' }]);
  });

  it('stay silent when a burst ends where it started', () => {
    const root = sharedDriveRoot(ROOT);
    update(root, counted(root, 2));
    update(counted(root, 2), root);
    vi.advanceTimersByTime(QUIET_MS);
    expect(heard).toEqual([]);
  });

  it('deliver what is held when the store closes', () => {
    const root = sharedDriveRoot(ROOT);
    update(root, counted(root, 9));
    feed.settleTotals();
    expect(heard.map(totalsOf)).toEqual([{ items: 9, previous: 0, state: 'ready' }]);
  });
});
