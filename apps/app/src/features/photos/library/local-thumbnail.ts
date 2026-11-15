import { PixelRatio } from 'react-native';
import type { VideoThumbnail } from 'expo-video';
import { hasPhotoFlag } from '@smarteverything/domain';
import { isNative } from '../../../design/platform';
import { rowHeight } from '../../../components/media-grid/justify';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { desktopThumbnail } from '../local/desktop-source';
import { resolveLocalMedia } from '../local/source';
import { localIdOf } from '../local/store';

const THUMB_PX = rowHeight('comfortable', 'pointer');

function thumbPixels(): number {
  return PixelRatio.getPixelSizeForLayoutSize(THUMB_PX);
}

async function nativePoster(uri: string, aspect: number): Promise<VideoThumbnail | null> {
  const video = await import('expo-video');
  const player = video.createVideoPlayer({ uri });
  try {
    const frames = await player.generateThumbnailsAsync(0, {
      maxWidth: Math.round(thumbPixels() * Math.max(1, aspect)),
    });
    return frames[0] ?? null;
  } finally {
    player.release();
  }
}

export function localPhotoThumbnail(id: string): Promise<string | null> {
  return isNative() ? resolveLocalMedia(id) : desktopThumbnail(id, thumbPixels());
}

export async function localThumbnail(tile: MediaTile): Promise<string | VideoThumbnail | null> {
  const id = localIdOf(tile);
  if (id === null) throw new Error('A local thumbnail needs a local media ID');
  if (!isNative()) return desktopThumbnail(id, thumbPixels());
  const uri = await resolveLocalMedia(id);
  if (uri === null || !hasPhotoFlag(tile.flags, 'video')) return uri;
  return nativePoster(uri, tile.aspect);
}
