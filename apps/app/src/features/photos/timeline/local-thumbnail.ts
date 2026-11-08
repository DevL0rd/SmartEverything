import type { VideoThumbnail } from 'expo-video';
import { hasPhotoFlag } from '@smarteverything/domain';
import { isNative } from '../../../design/platform';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { resolveLocalMedia } from '../local/source';
import { localIdOf } from '../local/store';

function webPoster(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    const clean = (): void => {
      video.removeAttribute('src');
      video.load();
    };
    video.addEventListener(
      'loadeddata',
      () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context === null) {
          clean();
          reject(new Error('The video poster canvas is unavailable'));
          return;
        }
        try {
          context.drawImage(video, 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        clean();
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        clean();
        reject(new Error('The local video poster could not be decoded'));
      },
      { once: true },
    );
    video.src = uri;
  });
}

async function nativePoster(uri: string): Promise<VideoThumbnail | null> {
  const video = await import('expo-video');
  const player = video.createVideoPlayer({ uri });
  try {
    const frames = await player.generateThumbnailsAsync(0);
    return frames[0] ?? null;
  } finally {
    player.release();
  }
}

export async function localThumbnail(tile: MediaTile): Promise<string | VideoThumbnail | null> {
  const id = localIdOf(tile);
  if (id === null) throw new Error('A local thumbnail needs a local media ID');
  const uri = await resolveLocalMedia(id);
  if (uri === null || !hasPhotoFlag(tile.flags, 'video')) return uri;
  return isNative() ? nativePoster(uri) : webPoster(uri);
}
