import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalMediaItem } from '../local/types';

const resolve = vi.hoisted(() => vi.fn<(id: string) => Promise<string | null>>());

vi.mock('../local/source', () => ({ resolveLocalMedia: resolve }));

const { localFileOf, LocalFileUnreadableError } = await import('./local-ask');

const ITEM: LocalMediaItem = {
  id: 'a1',
  name: 'IMG_0001.jpg',
  takenAt: 0,
  modificationTime: 1,
  width: null,
  height: null,
  durationMs: null,
  video: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  resolve.mockReset();
});

describe('asking about a photo on this device', () => {
  it('reads the original with its media type and size', async () => {
    resolve.mockResolvedValue('file:///photos/IMG_0001.jpg');
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob)));
    const file = await localFileOf(ITEM);
    expect(file).toMatchObject({ name: 'IMG_0001.jpg', mime: 'image/jpeg', bytes: 3 });
    expect((await file.data()).byteLength).toBe(3);
  });

  it('fails by name when the file is gone, unreadable or has no type', async () => {
    resolve.mockResolvedValue(null);
    await expect(localFileOf(ITEM)).rejects.toBeInstanceOf(LocalFileUnreadableError);
    resolve.mockResolvedValue('file:///photos/IMG_0001.jpg');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(localFileOf(ITEM)).rejects.toThrow('404');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Blob([new Uint8Array([1])]))),
    );
    await expect(localFileOf(ITEM)).rejects.toThrow('no media type');
  });
});
