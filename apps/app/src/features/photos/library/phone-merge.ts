import { useMemo } from 'react';
import type { LibraryScope } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { useLocalTiles } from '../local/tiles';

export function mergeLocalTiles(
  hub: readonly MediaTile[],
  local: readonly MediaTile[],
): readonly MediaTile[] {
  if (local.length === 0) return hub;
  const pending = local;
  const merged: MediaTile[] = [];
  let next = 0;
  for (const tile of hub) {
    let entry = pending[next];
    while (entry !== undefined && entry.takenAt > tile.takenAt) {
      merged.push(entry);
      next += 1;
      entry = pending[next];
    }
    merged.push(tile);
  }
  return [...merged, ...pending.slice(next)];
}

export function useLocalMerge(
  hub: readonly MediaTile[],
  scope: LibraryScope,
): readonly MediaTile[] {
  const local = useLocalTiles(scope, hub);
  return useMemo(() => mergeLocalTiles(hub, local), [hub, local]);
}
