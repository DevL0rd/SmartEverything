import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveChange } from '@smarteverything/domain';
import type { ToastInput } from '../../../components/toast-store';

const notify = vi.hoisted(() => vi.fn<(input: ToastInput) => number>());

vi.mock('../../../components/toast-store', () => ({ notify }));
vi.mock('../../../api/drive', () => ({ changeDrive: vi.fn() }));

import type { BulkAnswer, BulkFailure } from '../../../store/bulk-run';
import type { LocalCopyResult } from '../backup/runner/local-copies';
import { addToAlbum, moveToTrash, setFavourite, type Change } from './actions';
import type { LocalCopies } from './local-copies';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

function ignoreLanded(): void {
  return;
}

function localCopies(
  trash: LocalCopyResult,
  restore: LocalCopyResult,
): {
  calls: [string, readonly string[]][];
  local: LocalCopies;
} {
  const calls: [string, readonly string[]][] = [];
  return {
    calls,
    local: {
      trash: (ids): Promise<LocalCopyResult> => {
        calls.push(['trash', ids]);
        return Promise.resolve(trash);
      },
      restore: (ids): Promise<LocalCopyResult> => {
        calls.push(['restore', ids]);
        return Promise.resolve(restore);
      },
    },
  };
}

function recorder(failed: readonly BulkFailure[] = []): { calls: DriveChange[]; change: Change } {
  const calls: DriveChange[] = [];
  return {
    calls,
    change: (body): Promise<BulkAnswer> => {
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
    await expect(moveToTrash([A, B], ignoreLanded, change)).resolves.toBe(true);
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

  it('hands each landed batch over as it lands, leaving refused items out', async () => {
    const { change } = recorder([{ itemId: A, reason: 'locked' }]);
    const landed: (readonly string[])[] = [];
    await moveToTrash([A, B], (ids) => landed.push(ids), change);
    expect(landed).toEqual([[B]]);
  });

  it('reports items the hub could not change and offers no undo', async () => {
    const { change } = recorder([{ itemId: A, reason: 'locked' }]);
    await expect(moveToTrash([A], ignoreLanded, change)).resolves.toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not move everything to trash', tone: 'critical' }),
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

  it('moves the copies on this phone to its trash too and brings them back on undo', async () => {
    const { change } = recorder();
    const done = { asked: 2, changed: 2, place: 'phone' } as const;
    const { calls, local } = localCopies({ kind: 'done', ...done }, { kind: 'done', ...done });
    await expect(moveToTrash([A, B], ignoreLanded, change, local)).resolves.toBe(true);
    const toast = notify.mock.calls[0]?.[0];
    expect(toast).toMatchObject({
      message: 'Moved 2 photos to trash',
      detail: 'The 2 copies on this phone moved to its trash too.',
    });
    toast?.undo?.();
    await vi.waitFor(() => {
      expect(notify).toHaveBeenLastCalledWith({
        message: 'The 2 copies on this phone are back too.',
      });
    });
    expect(calls).toEqual([
      ['trash', [A, B]],
      ['restore', [A, B]],
    ]);
  });

  it('says the phone copy was kept when the system screen is declined', async () => {
    const { change } = recorder();
    const { local } = localCopies(
      { kind: 'declined', asked: 1, changed: 0, place: 'phone' },
      { kind: 'none' },
    );
    await moveToTrash([A], ignoreLanded, change, local);
    expect(notify.mock.calls[0]?.[0]).toMatchObject({
      detail: 'The copy on this phone was kept.',
    });
  });

  it('adds no local line for items that exist only on the hub', async () => {
    const { change } = recorder();
    const { local } = localCopies({ kind: 'none' }, { kind: 'none' });
    await moveToTrash([A], ignoreLanded, change, local);
    expect(notify.mock.calls[0]?.[0]).not.toHaveProperty('detail');
  });

  it('never touches the local copy when the hub refused the delete', async () => {
    const { change } = recorder([{ itemId: A, reason: 'locked' }]);
    const { calls, local } = localCopies({ kind: 'none' }, { kind: 'none' });
    await moveToTrash([A], ignoreLanded, change, local);
    expect(calls).toEqual([]);
  });

  it('reports a local trash failure without losing the hub delete', async () => {
    const { change } = recorder();
    const local: LocalCopies = {
      trash: () => Promise.reject(new Error('no activity')),
      restore: () => Promise.resolve({ kind: 'none' }),
    };
    await expect(moveToTrash([A], ignoreLanded, change, local)).resolves.toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The copies on this device were not moved to its trash',
        tone: 'critical',
      }),
    );
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Moved 1 photo to trash' }),
    );
  });
});
