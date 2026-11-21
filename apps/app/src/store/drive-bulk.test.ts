import { describe, expect, it, vi } from 'vitest';
import type { DriveChange, DriveChangeResult } from '@smarteverything/domain';

vi.mock('../api/drive', () => ({ changeDrive: vi.fn() }));

const { changeDriveBatched } = await import('./drive-bulk');

const ids = Array.from(
  { length: 120 },
  (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
);

function answered(body: DriveChange): DriveChangeResult {
  const itemIds = 'itemIds' in body ? body.itemIds : [];
  return {
    done: itemIds.map((itemId) => ({ itemId, resultItemId: null })),
    failed: [],
    conflicts: [],
  };
}

describe('batched Drive changes', () => {
  it('sends each item once, in batches, and merges the answers', async () => {
    const sent: DriveChange[] = [];
    const result = await changeDriveBatched({ action: 'trash', itemIds: ids }, (body) => {
      sent.push(body);
      return Promise.resolve(answered(body));
    });
    expect(sent.map((body) => ('itemIds' in body ? body.itemIds.length : 0))).toEqual([50, 50, 20]);
    expect(sent.flatMap((body) => ('itemIds' in body ? body.itemIds : []))).toEqual(ids);
    expect(result.done).toHaveLength(120);
  });

  it('names the unsent items as failed with the reason when a call fails', async () => {
    let calls = 0;
    const result = await changeDriveBatched(
      { action: 'move', itemIds: ids, toFolderId: ids[0] ?? '' },
      (body) => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error('offline')) : Promise.resolve(answered(body));
      },
    );
    expect(calls).toBe(2);
    expect(result.done).toHaveLength(50);
    expect(result.failed).toHaveLength(70);
    expect(result.failed[0]).toEqual({ itemId: ids[50], reason: 'offline' });
  });

  it('keeps each copy id with its item when a copy is sent in batches', async () => {
    const sent: DriveChange[] = [];
    const copyIds = ids.map((id) => id.replace('00000000-', 'cccccccc-'));
    await changeDriveBatched(
      { action: 'copy', itemIds: ids, toFolderId: ids[0] ?? '', copyIds },
      (body) => {
        sent.push(body);
        return Promise.resolve(answered(body));
      },
    );
    expect(sent.map((body) => (body.action === 'copy' ? body.copyIds : null))).toEqual([
      copyIds.slice(0, 50),
      copyIds.slice(50, 100),
      copyIds.slice(100),
    ]);
  });
});
