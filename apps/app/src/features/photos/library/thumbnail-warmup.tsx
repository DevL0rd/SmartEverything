import { useEffect, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { Logger } from '@smarteverything/logging';
import { useScreenLive } from '../../../design/animation-gate';
import { isNative } from '../../../design/platform';
import { useScopeVisible } from '../../../design/visibility';
import { tileState } from '../../../components/media-grid/marks';
import { ThumbnailQueue } from '../../../components/media-grid/thumbnail-queue';
import { tileKey } from '../../../components/media-grid/tile';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { useDriveLink } from '../../drive';
import { localIdOf } from '../local/store';

const log = new Logger('app.photos');

export function canWarmThumbnail(tile: MediaTile): boolean {
  return localIdOf(tile) === null && tileState(tile) === 'ready';
}

export async function warmThumbnail(uri: string, cacheKey: string): Promise<void> {
  if (!isNative()) {
    await Image.prefetch(uri, 'disk');
    return;
  }
  const image = await Image.loadAsync({ uri, cacheKey });
  image.release();
}

function WarmThumbnail({
  tile,
  queue,
}: {
  readonly tile: MediaTile;
  readonly queue: ThumbnailQueue;
}): ReactNode {
  const uri = useDriveLink(tile.id, tile.rev, 'thumb');
  const key = tileKey(tile);
  useEffect(() => {
    if (uri === null) return;
    return queue.request(`${key}\n${uri}`, () => warmThumbnail(uri, key));
  }, [uri, key, queue]);
  return null;
}

export function ThumbnailWarmup({ tiles }: { readonly tiles: readonly MediaTile[] }): ReactNode {
  const { focused, foreground } = useScreenLive();
  const visible = useScopeVisible();
  const active = focused && foreground && visible;
  const [queue] = useState(
    (): ThumbnailQueue =>
      new ThumbnailQueue((error) => {
        log.warn('thumbnail.prefetch_failed', { reason: String(error) });
      }),
  );
  const limit = active ? tiles.length : 0;
  useEffect(() => {
    queue.resize(limit);
    return (): void => {
      queue.resize(0);
    };
  }, [queue, limit]);
  if (!active) return null;
  return tiles
    .filter(canWarmThumbnail)
    .map((tile) => <WarmThumbnail key={tileKey(tile)} tile={tile} queue={queue} />);
}
