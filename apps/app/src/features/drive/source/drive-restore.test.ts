import { describe, expect, it } from 'vitest';
import type { DriveChangeResult, DriveItem } from '@smarteverything/domain';
import { documentFixture } from '../data/fixtures';
import { restoredFollowOf, type RestoreEnv } from './drive-restore';

const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000010';
const OTHER_ID = 'a1b2c3d4-0000-4000-8000-000000000011';

function itemOf(relPath: string, parentId: string | null): DriveItem {
  return documentFixture({
    id: ITEM_ID,
    rootId: ROOT_ID,
    parentId,
    relPath,
    name: relPath.split('/').at(-1),
    modifiedAt: '2026-11-07T10:00:00.000Z',
    addedAt: '2026-11-07T10:00:00.000Z',
    rev: 2,
    etag: 'e',
    bytes: 4,
  });
}

function resultOf(done: DriveChangeResult['done']): DriveChangeResult {
  return { done, failed: [], conflicts: [] };
}

function envOf(item: DriveItem | Error, opened: DriveItem[]): RestoreEnv {
  return {
    readItem: (): Promise<DriveItem> =>
      item instanceof Error ? Promise.reject(item) : Promise.resolve(item),
    labelOf: (rootId): string | null => (rootId === ROOT_ID ? 'Projects' : null),
    open: (shown): void => {
      opened.push(shown);
    },
  };
}

const ONE = resultOf([{ itemId: ITEM_ID, resultItemId: ITEM_ID }]);

describe('what a restore says afterwards', () => {
  it('says what one item was restored as and where, and Open goes to it', async () => {
    const opened: DriveItem[] = [];
    const item = itemOf('Home/Kitchen remodel/Quotes (2)', FOLDER_ID);
    const follow = await restoredFollowOf(ONE, envOf(item, opened));
    expect(follow?.message).toBe('Restored as Quotes (2) in Kitchen remodel');
    expect(follow?.action?.label).toBe('Open');
    follow?.action?.onPress();
    expect(opened).toEqual([item]);
  });

  it('names the drive for an item restored at its top', async () => {
    const follow = await restoredFollowOf(ONE, envOf(itemOf('Quote.pdf', null), []));
    expect(follow?.message).toBe('Restored as Quote.pdf in Projects');
  });

  it('still says it was restored when the restored item cannot be read', async () => {
    const follow = await restoredFollowOf(ONE, envOf(new Error('gone'), []));
    expect(follow).toEqual({ message: '1 item restored', action: null });
  });

  it('counts several restored items', async () => {
    const two = resultOf([
      { itemId: ITEM_ID, resultItemId: ITEM_ID },
      { itemId: OTHER_ID, resultItemId: OTHER_ID },
    ]);
    const follow = await restoredFollowOf(two, envOf(itemOf('Quote.pdf', null), []));
    expect(follow).toEqual({ message: '2 items restored', action: null });
  });

  it('says nothing when nothing was restored', async () => {
    expect(await restoredFollowOf(resultOf([]), envOf(itemOf('Quote.pdf', null), []))).toBeNull();
  });
});
