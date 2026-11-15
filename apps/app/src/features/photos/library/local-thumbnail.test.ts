import { afterEach, describe, expect, it, vi } from 'vitest';
import { photoFlags } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';

const fakes = vi.hoisted(() => ({
  native: false,
  resolve: vi.fn<(id: string) => Promise<string | null>>(),
  thumbnail: vi.fn<(id: string, px: number) => Promise<string | null>>(),
  thumbnails: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../../design/platform', () => ({ isNative: (): boolean => fakes.native }));
vi.mock('../local/source', () => ({ resolveLocalMedia: fakes.resolve }));
vi.mock('../local/desktop-source', () => ({ desktopThumbnail: fakes.thumbnail }));
vi.mock('react-native', () => ({
  PixelRatio: { getPixelSizeForLayoutSize: (size: number): number => size * 2 },
}));
vi.mock('expo-video', () => ({
  createVideoPlayer: (): object => ({
    generateThumbnailsAsync: fakes.thumbnails,
    release: fakes.release,
  }),
}));

const { localPhotoThumbnail, localThumbnail } = await import('./local-thumbnail');

function tileOf(video: boolean, aspect = 16 / 9): MediaTile {
  return {
    id: 'local:a1',
    rev: 1,
    aspect,
    takenAt: 0,
    offsetMin: null,
    durationMs: null,
    flags: photoFlags(video ? ['video'] : []),
    local: true,
  };
}

afterEach(() => {
  fakes.native = false;
  vi.clearAllMocks();
});

describe('local media thumbnails', () => {
  it('asks the desktop source for a sized thumbnail instead of the original', async () => {
    fakes.thumbnail.mockResolvedValue('blob:thumb');
    expect(await localThumbnail(tileOf(false))).toBe('blob:thumb');
    expect(await localThumbnail(tileOf(true))).toBe('blob:thumb');
    expect(await localPhotoThumbnail('a1')).toBe('blob:thumb');
    expect(fakes.thumbnail).toHaveBeenCalledWith('a1', 464);
    expect(fakes.resolve).not.toHaveBeenCalled();
  });

  it('decodes native video posters at the tile size, not the video size', async () => {
    fakes.native = true;
    const frame = { width: 825, height: 464 };
    fakes.resolve.mockResolvedValue('content://media/1');
    fakes.thumbnails.mockResolvedValue([frame]);
    expect(await localThumbnail(tileOf(true))).toBe(frame);
    expect(fakes.thumbnails).toHaveBeenCalledWith(0, { maxWidth: 825 });
    expect(fakes.release).toHaveBeenCalledOnce();
    await localThumbnail(tileOf(true, 9 / 16));
    expect(fakes.thumbnails).toHaveBeenLastCalledWith(0, { maxWidth: 464 });
  });

  it('shows native photos from their media library URI', async () => {
    fakes.native = true;
    fakes.resolve.mockResolvedValue('content://media/2');
    expect(await localThumbnail(tileOf(false))).toBe('content://media/2');
    expect(fakes.thumbnails).not.toHaveBeenCalled();
  });
});
