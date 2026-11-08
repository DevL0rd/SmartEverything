import { photoFlags } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { ValueStore } from '../../../design/external-store';
import type { LocalLibraryState, LocalMediaItem } from './types';

export const LOCAL_TILE_PREFIX = 'local:';
export const localLibrary = new ValueStore<LocalLibraryState>({
  state: 'loading',
  access: 'none',
  items: [],
  error: null,
});

export function localTileId(id: string): string {
  return `${LOCAL_TILE_PREFIX}${id}`;
}

export function localIdOf(tile: Pick<MediaTile, 'id' | 'local'>): string | null {
  return tile.local && tile.id.startsWith(LOCAL_TILE_PREFIX)
    ? tile.id.slice(LOCAL_TILE_PREFIX.length)
    : null;
}

export function localTilesOf(
  items: readonly LocalMediaItem[],
  uploaded: ReadonlySet<string> = new Set(),
): readonly MediaTile[] {
  return items
    .map((item) => ({
      id: localTileId(item.id),
      rev: item.modificationTime,
      aspect: item.width === null || item.height === null ? 1 : item.width / item.height,
      takenAt: item.takenAt,
      offsetMin: null,
      durationMs: item.video ? item.durationMs : null,
      thumbhash: null,
      flags: photoFlags(item.video ? ['video'] : []),
      local: true,
      backedUp: uploaded.has(item.id),
    }))
    .sort((left, right) => right.takenAt - left.takenAt);
}
