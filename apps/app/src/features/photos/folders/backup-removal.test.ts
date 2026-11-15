import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveChangeResult } from '@smarteverything/domain';
import type { ConfirmOutcome } from '../../../components/confirm-store';
import type { ToastInput } from '../../../components/toast-store';

const notify = vi.hoisted(() => vi.fn<(input: ToastInput) => number>());
vi.mock('../../../components/toast-store', () => ({ notify }));
vi.mock('../../../api/drive', () => ({ changeDrive: vi.fn() }));
vi.mock('../../../components/confirm-store', () => ({ choose: vi.fn() }));

import { stopFolderBackup, type FoundCopies, type RemovalDeps } from './backup-removal';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

interface Rig {
  readonly order: string[];
  readonly forgotten: string[][];
  readonly trashed: string[][];
  readonly deps: RemovalDeps;
}

function rig(
  found: Omit<FoundCopies, 'forget'> | null,
  answer: ConfirmOutcome,
  failed = false,
): Rig {
  const order: string[] = [];
  const forgotten: string[][] = [];
  const trashed: string[][] = [];
  const deps: RemovalDeps = {
    copies: () =>
      Promise.resolve(
        found === null
          ? null
          : {
              ...found,
              forget: (localIds): Promise<void> => {
                order.push('forget');
                forgotten.push([...localIds]);
                return Promise.resolve();
              },
            },
      ),
    choose: () => {
      order.push('confirm');
      return Promise.resolve(answer);
    },
    trash: (itemIds): Promise<DriveChangeResult> => {
      order.push('trash');
      trashed.push([...itemIds]);
      const done = itemIds.filter((id) => !failed || id !== B);
      return Promise.resolve({
        done: done.map((itemId) => ({ itemId, resultItemId: null })),
        failed: failed ? [{ itemId: B, reason: 'The item is locked.' }] : [],
        conflicts: [],
      });
    },
  };
  return { order, forgotten, trashed, deps };
}

const FOUND = {
  place: 'phone',
  copies: {
    items: [
      { itemId: A, bytes: 100, localIds: ['1'] },
      { itemId: B, bytes: 200, localIds: ['2', '2b'] },
    ],
    kept: new Map(),
  },
} as const;

describe('stopping backup for a folder', () => {
  beforeEach(() => {
    notify.mockReset();
  });

  it('asks, turns the folder off, moves its hub copies to Recently deleted and forgets them', async () => {
    const t = rig(FOUND, 'confirm');
    const apply = vi.fn(() => {
      t.order.push('apply');
      return Promise.resolve();
    });
    await expect(stopFolderBackup(['camera'], ['Camera'], apply, t.deps)).resolves.toBe(true);
    expect(t.order).toEqual(['confirm', 'apply', 'trash', 'forget']);
    expect(t.trashed).toEqual([[A, B]]);
    expect(t.forgotten).toEqual([['1', '2', '2b']]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Moved 2 photos and videos to Recently deleted' }),
    );
  });

  it('changes nothing when the confirmation is cancelled', async () => {
    const t = rig(FOUND, 'cancel');
    const apply = vi.fn(() => Promise.resolve());
    await expect(stopFolderBackup(['camera'], ['Camera'], apply, t.deps)).resolves.toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(t.trashed).toEqual([]);
    expect(t.forgotten).toEqual([]);
  });

  it('turns the folder off without asking when nothing came only from it', async () => {
    const t = rig(
      { place: 'phone', copies: { items: [], kept: new Map([[A, 'album']]) } },
      'confirm',
    );
    const apply = vi.fn(() => Promise.resolve());
    await stopFolderBackup(['camera'], ['Camera'], apply, t.deps);
    expect(apply).toHaveBeenCalledOnce();
    expect(t.order).toEqual([]);
  });

  it('turns the folder off without removing anything when backup does not run here', async () => {
    const t = rig(null, 'confirm');
    const apply = vi.fn(() => Promise.resolve());
    await stopFolderBackup(['camera'], ['Camera'], apply, t.deps);
    expect(apply).toHaveBeenCalledOnce();
    expect(t.order).toEqual([]);
    expect(notify).toHaveBeenCalledWith({
      message: 'Stopped backing up Camera',
      detail: 'Copies already on the hub stay there.',
    });
  });

  it('stops and keeps the hub copies when asked to', async () => {
    const t = rig(FOUND, 'alternate');
    const apply = vi.fn(() => {
      t.order.push('apply');
      return Promise.resolve();
    });
    await expect(stopFolderBackup(['camera'], ['Camera'], apply, t.deps)).resolves.toBe(true);
    expect(t.order).toEqual(['confirm', 'apply']);
    expect(t.trashed).toEqual([]);
    expect(t.forgotten).toEqual([]);
    expect(notify).toHaveBeenCalledWith({
      message: 'Stopped backing up Camera',
      detail: 'Copies already on the hub stay there.',
    });
  });

  it('forgets only what the hub removed and reports what stayed', async () => {
    const t = rig(FOUND, 'confirm', true);
    await stopFolderBackup(['camera'], ['Camera'], () => Promise.resolve(), t.deps);
    expect(t.forgotten).toEqual([['1']]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '1 photo or video stayed on the hub',
        detail: 'The item is locked.',
        tone: 'critical',
      }),
    );
  });
});
