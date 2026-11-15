import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopSource, desktopThumbnail } from './desktop-source';
import { localLibrary } from './store';
import { deferred } from '../backup/runner/deferred-fixture';
import type { LocalMediaShape } from './desktop-metadata';

const desktop = vi.hoisted(() => ({
  list: vi.fn(),
  shape: vi.fn(),
  frame: vi.fn(),
}));

vi.mock('../../../design/platform', () => ({
  desktopBridge: (): object => ({
    photos: { list: desktop.list, onChange: (): (() => void) => () => undefined },
  }),
}));
vi.mock('./desktop-metadata', () => ({ desktopMediaShape: desktop.shape }));
vi.mock('./desktop-frame', () => ({ desktopFrame: desktop.frame }));

const frames: (() => void)[] = [];

function paint(): void {
  for (const callback of frames.splice(0)) callback();
}

const ITEM = {
  id: 'a'.repeat(64),
  name: 'local.mp4',
  mimeType: 'video/mp4',
  bytes: 100,
  modifiedAt: 1000,
  takenAt: 500,
  uri: 'app://smarteverything/local-media/test',
  video: true,
  folder: '/home/person/Pictures/Trip',
};

beforeEach(async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
  desktop.list.mockReset();
  desktop.shape.mockReset();
  desktop.frame.mockReset();
  desktop.list.mockResolvedValue({ items: [], issues: [] });
  await desktopSource.list();
  desktop.list.mockResolvedValue({ items: [ITEM], issues: [] });
  desktop.shape.mockResolvedValue({ width: 1920, height: 1080, durationMs: 1000 });
  localLibrary.set({ state: 'loading', access: 'none', items: [], error: null });
});

afterEach(() => {
  paint();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    paint();
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
    paint();
    expect(localLibrary.get().items[0]?.width).toBeNull();
    expect(desktopSource.resolve(ITEM.id)).toBe(second);
    expect(desktop.shape).toHaveBeenCalledTimes(2);
    edited.resolve({ width: 1920, height: 1080, durationMs: 2000 });
    await second;
    paint();
    expect(localLibrary.get().items[0]).toMatchObject({
      width: 1920,
      height: 1080,
      durationMs: 2000,
    });
    await desktopSource.resolve(ITEM.id);
    expect(desktop.shape).toHaveBeenCalledTimes(2);
  });

  it('writes the shapes measured in one frame to the library store once', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...ITEM,
      id: index.toString(16).padStart(64, '0'),
    }));
    desktop.list.mockResolvedValue({ items: many, issues: [] });
    const items = await desktopSource.list();
    localLibrary.set({ state: 'ready', access: 'all', items, error: null });
    const changes = vi.fn();
    const off = localLibrary.subscribe(changes);
    await Promise.all(many.map((item) => desktopSource.resolve(item.id)));
    expect(changes).not.toHaveBeenCalled();
    paint();
    off();
    expect(changes).toHaveBeenCalledOnce();
    expect(localLibrary.get().items.every((item) => item.width === 1920)).toBe(true);
  });

  it('builds one sized thumbnail per revision and measures the item from it', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    desktop.frame.mockResolvedValue({
      url: 'blob:thumb-1',
      shape: { width: 4000, height: 3000, durationMs: null },
    });
    const items = await desktopSource.list();
    localLibrary.set({ state: 'ready', access: 'all', items, error: null });
    expect(await desktopThumbnail(ITEM.id, 464)).toBe('blob:thumb-1');
    expect(await desktopThumbnail(ITEM.id, 464)).toBe('blob:thumb-1');
    expect(desktop.frame).toHaveBeenCalledOnce();
    expect(desktop.frame).toHaveBeenCalledWith(ITEM.uri, true, 464);
    expect(desktop.shape).not.toHaveBeenCalled();
    paint();
    expect(localLibrary.get().items[0]).toMatchObject({ width: 4000, height: 3000 });
    desktop.frame.mockResolvedValue({
      url: 'blob:thumb-2',
      shape: { width: 3000, height: 4000, durationMs: null },
    });
    desktop.list.mockResolvedValue({ items: [{ ...ITEM, modifiedAt: 2000 }], issues: [] });
    await desktopSource.list();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
    expect(await desktopThumbnail(ITEM.id, 464)).toBe('blob:thumb-2');
    expect(desktop.frame).toHaveBeenCalledTimes(2);
  });

  it('retries a thumbnail that failed to build', async () => {
    desktop.frame.mockRejectedValueOnce(new Error('undecodable')).mockResolvedValueOnce({
      url: 'blob:thumb',
      shape: { width: 10, height: 10, durationMs: null },
    });
    await desktopSource.list();
    await expect(desktopThumbnail(ITEM.id, 464)).rejects.toThrow('undecodable');
    expect(await desktopThumbnail(ITEM.id, 464)).toBe('blob:thumb');
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
