import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopSource } from './desktop-source';
import { localLibrary } from './store';
import { deferred } from '../backup/runner/deferred-fixture';
import type { LocalMediaShape } from './desktop-metadata';

const desktop = vi.hoisted(() => ({
  list: vi.fn(),
  shape: vi.fn(),
}));

vi.mock('../../../design/platform', () => ({
  desktopBridge: (): object => ({
    photos: { list: desktop.list, onChange: (): (() => void) => () => undefined },
  }),
}));
vi.mock('./desktop-metadata', () => ({ desktopMediaShape: desktop.shape }));

const ITEM = {
  id: 'a'.repeat(64),
  name: 'local.mp4',
  mimeType: 'video/mp4',
  bytes: 100,
  modifiedAt: 1000,
  takenAt: 500,
  uri: 'app://smarteverything/local-media/test',
  video: true,
};

beforeEach(async () => {
  desktop.list.mockReset();
  desktop.shape.mockReset();
  desktop.list.mockResolvedValue({ items: [], issues: [] });
  await desktopSource.list();
  desktop.list.mockResolvedValue({ items: [ITEM], issues: [] });
  desktop.shape.mockResolvedValue({ width: 1920, height: 1080, durationMs: 1000 });
  localLibrary.set({ state: 'loading', access: 'none', items: [], error: null });
});

describe('desktop local Photos source', () => {
  it('lists local videos immediately without decoding the entire library', async () => {
    const items = await desktopSource.list();
    expect(items.map((item) => item.id)).toEqual([ITEM.id]);
    expect(items[0]?.modificationTime).toBe(ITEM.modifiedAt);
    expect(desktop.shape).not.toHaveBeenCalled();
  });

  it('measures requested media on demand and retains its original streaming URI', async () => {
    const items = await desktopSource.list();
    localLibrary.set({ state: 'ready', access: 'all', items, error: null });
    expect(await desktopSource.resolve(ITEM.id)).toBe(ITEM.uri);
    expect(localLibrary.get().items[0]).toMatchObject({
      width: 1920,
      height: 1080,
      durationMs: 1000,
    });
    expect(await desktopSource.resolve(ITEM.id)).toBe(ITEM.uri);
    expect(desktop.shape).toHaveBeenCalledOnce();
  });

  it('measures an edited revision independently while the previous measurement is pending', async () => {
    const original = deferred<LocalMediaShape>();
    const edited = deferred<LocalMediaShape>();
    desktop.shape
      .mockReset()
      .mockReturnValueOnce(original.promise)
      .mockReturnValueOnce(edited.promise);
    await desktopSource.list();
    const first = desktopSource.resolve(ITEM.id);
    desktop.list.mockResolvedValue({
      items: [{ ...ITEM, modifiedAt: 2000, bytes: 200 }],
      issues: [],
    });
    const items = await desktopSource.list();
    localLibrary.set({ state: 'ready', access: 'all', items, error: null });
    const second = desktopSource.resolve(ITEM.id);
    expect(desktop.shape).toHaveBeenCalledTimes(2);
    original.resolve({ width: 640, height: 480, durationMs: 1000 });
    await first;
    expect(localLibrary.get().items[0]?.width).toBeNull();
    expect(desktopSource.resolve(ITEM.id)).toBe(second);
    expect(desktop.shape).toHaveBeenCalledTimes(2);
    edited.resolve({ width: 1920, height: 1080, durationMs: 2000 });
    await second;
    expect(localLibrary.get().items[0]).toMatchObject({
      width: 1920,
      height: 1080,
      durationMs: 2000,
    });
    await desktopSource.resolve(ITEM.id);
    expect(desktop.shape).toHaveBeenCalledTimes(2);
  });

  it('reports unreadable folders without hiding available items', async () => {
    desktop.list.mockResolvedValue({
      items: [ITEM],
      issues: [{ folder: 'Videos', message: 'Access denied' }],
    });
    expect(await desktopSource.list()).toHaveLength(1);
    expect(desktopSource.issues()).toEqual(['Videos: Access denied']);
  });

  it('cannot resolve removed media or publish an aborted inventory', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await desktopSource.list(controller.signal)).toEqual([]);
    desktop.list.mockResolvedValue({ items: [], issues: [] });
    await desktopSource.list();
    expect(await desktopSource.resolve(ITEM.id)).toBeNull();
  });
});
