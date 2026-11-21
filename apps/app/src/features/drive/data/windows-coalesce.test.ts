import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { DriveChangedNotice } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { DRIVE_EVERYWHERE, driveKey, type DriveWindowScope } from '../../../queries/keys';
import { FOLDER_ID, OTHER_FOLDER_ID, ROOT_ID } from './fixtures';
import { invalidateDriveChanged } from './windows';

interface Window {
  readonly calls: { readonly signal: AbortSignal }[];
  readonly release: () => void;
}

const folderIn = (folderId: string): DriveWindowScope => ({
  rootId: ROOT_ID,
  folderId,
  albumId: null,
});

const unsubscribes: (() => void)[] = [];

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
});

function notice(folderIds: readonly string[], cursor: number): DriveChangedNotice {
  return {
    type: 'drive_changed',
    rootIds: [ROOT_ID],
    folderIds,
    albumIds: [],
    months: [],
    cursor,
  };
}

function watched(client: QueryClient, key: readonly unknown[]): Window {
  const calls: { readonly signal: AbortSignal }[] = [];
  const waiting: (() => void)[] = [];
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: ({ signal }): Promise<string> => {
      calls.push({ signal });
      return new Promise<string>((resolve) => {
        waiting.push(() => {
          resolve(`data-${String(calls.length)}`);
        });
      });
    },
    staleTime: Infinity,
    retry: false,
  });
  unsubscribes.push(observer.subscribe(() => undefined));
  return {
    calls,
    release: (): void => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

async function flushed(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
}

async function primed(windows: readonly Window[]): Promise<void> {
  await flushed();
  for (const window of windows) window.release();
  await flushed();
}

describe('drive_changed notices in a burst', () => {
  it('refetch each reached window once per settled round instead of once per notice', async () => {
    const client = new QueryClient();
    const stats = watched(client, driveKey('stats', DRIVE_EVERYWHERE));
    const trash = watched(client, driveKey('trash', DRIVE_EVERYWHERE));
    await primed([stats, trash]);
    expect(stats.calls).toHaveLength(1);

    invalidateDriveChanged(client, notice([], 1));
    await flushed();
    expect(stats.calls).toHaveLength(2);
    for (let cursor = 2; cursor <= 40; cursor += 1)
      invalidateDriveChanged(client, notice([], cursor));
    await flushed();
    expect(stats.calls).toHaveLength(2);
    expect(trash.calls).toHaveLength(2);
    expect(stats.calls[1]?.signal.aborted).toBe(false);

    stats.release();
    trash.release();
    await flushed();
    expect(stats.calls).toHaveLength(3);
    expect(trash.calls).toHaveLength(3);

    stats.release();
    trash.release();
    await flushed();
    expect(stats.calls).toHaveLength(3);
    expect(trash.calls).toHaveLength(3);
  });

  it('apply the union of every merged notice after the round in flight settles', async () => {
    const client = new QueryClient();
    const first = watched(client, driveKey('folder', folderIn(FOLDER_ID), null));
    const second = watched(client, driveKey('folder', folderIn(OTHER_FOLDER_ID), null));
    await primed([first, second]);

    invalidateDriveChanged(client, notice([FOLDER_ID], 1));
    await flushed();
    expect(first.calls).toHaveLength(2);
    expect(second.calls).toHaveLength(1);

    invalidateDriveChanged(client, notice([OTHER_FOLDER_ID], 2));
    invalidateDriveChanged(client, notice([FOLDER_ID], 3));
    await flushed();
    expect(second.calls).toHaveLength(1);

    first.release();
    await flushed();
    expect(first.calls).toHaveLength(3);
    expect(second.calls).toHaveLength(2);
  });

  it('leave a fetch already running untouched and refetch it once it settles', async () => {
    const client = new QueryClient();
    const stats = watched(client, driveKey('stats', DRIVE_EVERYWHERE));
    await primed([stats]);
    void client.refetchQueries({ queryKey: driveKey('stats', DRIVE_EVERYWHERE) });
    await flushed();
    expect(stats.calls).toHaveLength(2);

    invalidateDriveChanged(client, notice([], 1));
    await flushed();
    expect(stats.calls).toHaveLength(2);
    expect(stats.calls[1]?.signal.aborted).toBe(false);

    stats.release();
    await flushed();
    expect(stats.calls).toHaveLength(3);
    stats.release();
    await flushed();
    expect(stats.calls).toHaveLength(3);
  });
});
