import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BulkBusyError,
  batchesOf,
  bulkProgress,
  keptLine,
  runBulk,
  type BulkAnswer,
} from './bulk-run';

const ids = Array.from({ length: 7 }, (_, index) => `item-${String(index)}`);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bulk runs', () => {
  it('splits the items into batches in order', () => {
    expect(batchesOf(ids, 3)).toEqual([ids.slice(0, 3), ids.slice(3, 6), ids.slice(6)]);
  });

  it('reports progress from each landed batch and clears it when done', async () => {
    const seen: string[] = [];
    const outcome = await runBulk({
      label: 'test.trash',
      verb: 'Deleting',
      ids,
      batch: 3,
      send: (batch) => {
        const progress = bulkProgress();
        seen.push(`${String(progress?.done)}/${String(progress?.total)}:${String(batch.length)}`);
        return Promise.resolve({ failed: [] });
      },
    });
    expect(seen).toEqual(['0/7:3', '3/7:3', '6/7:1']);
    expect(outcome).toEqual({ landed: ids, kept: [], reason: null });
    expect(bulkProgress()).toBeNull();
  });

  it('refuses a second run while one is running and sends nothing for it', async () => {
    let release: (answer: BulkAnswer) => void = () => undefined;
    const first = runBulk({
      label: 'test.first',
      verb: 'Deleting',
      ids,
      batch: 50,
      send: () =>
        new Promise<BulkAnswer>((resolve) => {
          release = resolve;
        }),
    });
    const second = vi.fn(() => Promise.resolve({ failed: [] }));
    await expect(
      runBulk({ label: 'test.second', verb: 'Deleting', ids, batch: 50, send: second }),
    ).rejects.toBeInstanceOf(BulkBusyError);
    expect(second).not.toHaveBeenCalled();
    release({ failed: [] });
    await expect(first).resolves.toMatchObject({ reason: null });
  });

  it('stops at a failed call, keeps the rest and never sends that batch again', async () => {
    const send = vi
      .fn<(batch: readonly string[]) => Promise<BulkAnswer>>()
      .mockResolvedValueOnce({ failed: [] })
      .mockRejectedValueOnce(new Error('The hub did not answer'));
    const outcome = await runBulk({ label: 'test.stop', verb: 'Deleting', ids, batch: 3, send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcome.landed).toEqual(ids.slice(0, 3));
    expect(outcome.kept).toEqual(ids.slice(3));
    expect(keptLine(outcome, 'The hub did not answer')).toBe(
      '3 of 7 done. 4 kept: The hub did not answer',
    );
  });

  it('carries on past items the hub refused and names why they were kept', async () => {
    const send = vi.fn((batch: readonly string[]) =>
      Promise.resolve({
        failed: batch.includes('item-1') ? [{ itemId: 'item-1', reason: 'locked' }] : [],
      }),
    );
    const outcome = await runBulk({ label: 'test.refused', verb: 'Deleting', ids, batch: 3, send });
    expect(send).toHaveBeenCalledTimes(3);
    expect(outcome.kept).toEqual(['item-1']);
    expect(outcome.landed).toHaveLength(6);
    expect(outcome.reason).toBe('locked');
  });
});
