import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveChange } from '@smarteverything/domain';
import type { ToastInput } from '../../../components/toast-store';

const notify = vi.hoisted(() => vi.fn<(input: ToastInput) => number>());

vi.mock('../../../components/toast-store', () => ({ notify }));
vi.mock('../../../api/drive', () => ({ changeDrive: vi.fn() }));

import { addToAlbum, moveToTrash, setFavourite, type Change } from './actions';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

function recorder(failed: readonly unknown[] = []): { calls: DriveChange[]; change: Change } {
  const calls: DriveChange[] = [];
  return {
    calls,
    change: (body): Promise<{ failed: readonly unknown[] }> => {
      calls.push(body);
      return Promise.resolve({ failed });
    },
  };
}

describe('library actions', () => {
  beforeEach(() => {
    notify.mockReset();
  });

  it('stars and unstars, since Favourite and Star are one mark', async () => {
    const { calls, change } = recorder();
    await expect(setFavourite([A, B], true, change)).resolves.toBe(true);
    await setFavourite([A], false, change);
    expect(calls).toEqual([
      { action: 'star', itemIds: [A, B] },
      { action: 'unstar', itemIds: [A] },
    ]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('moves to trash with an undo that restores the same items', async () => {
    const { calls, change } = recorder();
    await expect(moveToTrash([A, B], change)).resolves.toBe(true);
    const toast = notify.mock.calls[0]?.[0];
    expect(toast?.message).toBe('Moved 2 photos to trash');
    toast?.undo?.();
    await vi.waitFor(() => {
      expect(calls).toEqual([
        { action: 'trash', itemIds: [A, B] },
        { action: 'restore', itemIds: [A, B] },
      ]);
    });
  });

  it('reports items the hub could not change and offers no undo', async () => {
    const { change } = recorder([{ itemId: A, reason: 'locked' }]);
    await expect(moveToTrash([A], change)).resolves.toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not move to trash', tone: 'critical' }),
    );
  });

  it('reports a failed call', async () => {
    const change: Change = () => Promise.reject(new Error('offline'));
    await expect(setFavourite([A], true, change)).resolves.toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not add to favourites', tone: 'critical' }),
    );
  });

  it('adds the picked items to an album and names it', async () => {
    const { calls, change } = recorder();
    const album = { id: '00000000-0000-4000-8000-0000000000c1', title: 'Tokyo' };
    await expect(addToAlbum([A, B], album, change)).resolves.toBe(true);
    expect(calls).toEqual([{ action: 'album_add', albumId: album.id, itemIds: [A, B] }]);
    expect(notify).toHaveBeenCalledWith({ message: 'Added 2 photos to Tokyo' });
  });
});
