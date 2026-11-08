import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { localLibrary } from './store';
import { watchLocalLibrary } from './watch';
import type { LocalMediaAccess, LocalMediaItem, LocalMediaSource } from './types';
import { deferred } from '../backup/runner/deferred-fixture';

const ITEM: LocalMediaItem = {
  id: 'photo',
  name: 'photo.jpg',
  takenAt: 1,
  modificationTime: 1,
  width: 640,
  height: 480,
  durationMs: null,
  video: false,
};

interface SourceRig {
  readonly source: LocalMediaSource;
  readonly list: Mock<() => Promise<readonly LocalMediaItem[]>>;
  readonly deny: () => void;
}

function sourceOf(): SourceRig {
  let access: LocalMediaAccess = 'all';
  const list = vi.fn<() => Promise<readonly LocalMediaItem[]>>(() => Promise.resolve([ITEM]));
  const source: LocalMediaSource = {
    access: () => Promise.resolve(access),
    requestAccess: () => {
      access = 'all';
      return Promise.resolve(access);
    },
    list,
    onChange: () => () => undefined,
    issues: () => [],
    resolve: () => Promise.resolve('file:///photo.jpg'),
  };
  return {
    source,
    list,
    deny: (): void => {
      access = 'none';
    },
  };
}

function nextState(state: 'denied' | 'ready' | 'error'): Promise<void> {
  if (localLibrary.get().state === state) return Promise.resolve();
  return new Promise((resolve) => {
    const off = localLibrary.subscribe(() => {
      if (localLibrary.get().state !== state) return;
      off();
      resolve();
    });
  });
}

beforeEach(() => {
  localLibrary.set({ state: 'loading', access: 'none', items: [], error: null });
});

describe('independent local library', () => {
  it('browses without a backup handle, hub or upload permission', async () => {
    const source = sourceOf();
    const watch = watchLocalLibrary(source.source);
    await nextState('ready');
    expect(localLibrary.get().items).toEqual([ITEM]);
    watch.stop();
  });

  it('does not enumerate denied media and grants access without enabling backup', async () => {
    const source = sourceOf();
    source.deny();
    const watch = watchLocalLibrary(source.source);
    await nextState('denied');
    expect(source.list).not.toHaveBeenCalled();
    await watch.requestAccess();
    await nextState('ready');
    expect(localLibrary.get().items).toEqual([ITEM]);
    watch.stop();
  });

  it('cannot publish a disposed enumeration', async () => {
    const pending = deferred<readonly LocalMediaItem[]>();
    const entered = deferred<null>();
    const source = sourceOf();
    source.source.list = (): Promise<readonly LocalMediaItem[]> => {
      entered.resolve(null);
      return pending.promise;
    };
    const watch = watchLocalLibrary(source.source);
    await entered.promise;
    watch.stop();
    pending.resolve([ITEM]);
    await pending.promise;
    expect(localLibrary.get().items).toEqual([]);
  });

  it('retains visible items and exposes refresh failures', async () => {
    const source = sourceOf();
    const watch = watchLocalLibrary(source.source);
    await nextState('ready');
    source.list.mockRejectedValue(new Error('Library unavailable'));
    watch.refresh();
    await nextState('error');
    expect(localLibrary.get().items).toEqual([ITEM]);
    expect(localLibrary.get().error).toBe('Library unavailable');
    watch.stop();
  });
});
