import { useEffect, useState } from 'react';
import { useStableCallback } from '../../design/use-stable-callback';
import type { ViewableChange } from '../virtual-list-visibility';
import { TILE_GAP, type MediaGridRow } from './justify';
import type { MediaTile } from './tiles';

export interface ThumbnailWindow {
  readonly first: number;
  readonly last: number;
  readonly direction: number;
  readonly firstKey: string;
  readonly lastKey: string;
}

function matchesWindow(
  rows: readonly MediaGridRow[],
  window: ThumbnailWindow | null,
): window is ThumbnailWindow {
  return (
    window !== null &&
    rows[window.first]?.key === window.firstKey &&
    rows[window.last]?.key === window.lastKey
  );
}

export function thumbnailWindow(
  rows: readonly MediaGridRow[],
  window: ThumbnailWindow | null,
): readonly MediaTile[] {
  if (!matchesWindow(rows, window)) return [];
  const visible = rows.slice(window.first, window.last + 1);
  let remaining = visible.reduce(
    (height, row) => height + (row.kind === 'tiles' ? row.height + TILE_GAP : 0),
    0,
  );
  const tiles: MediaTile[] = [];
  let index = window.direction > 0 ? window.last + 1 : window.first - 1;
  while (remaining > 0 && index >= 0 && index < rows.length) {
    const row = rows[index];
    if (row?.kind === 'tiles') {
      tiles.push(...row.tiles.map((placed) => placed.tile));
      remaining -= row.height + TILE_GAP;
    }
    index += window.direction;
  }
  return tiles;
}

export function useThumbnailWindow(
  rows: readonly MediaGridRow[],
  onChange: ((tiles: readonly MediaTile[]) => void) | undefined,
): (change: ViewableChange) => void {
  const [window, setWindow] = useState<ThumbnailWindow | null>(null);
  const changed = useStableCallback((change: ViewableChange): void => {
    if (onChange === undefined) return;
    const indices = change.viewableItems.flatMap((token) =>
      token.isViewable && token.index !== null ? [token.index] : [],
    );
    if (indices.length === 0) {
      setWindow(null);
      return;
    }
    const first = Math.min(...indices);
    const last = Math.max(...indices);
    const firstKey = rows[first]?.key;
    const lastKey = rows[last]?.key;
    if (firstKey === undefined || lastKey === undefined) return;
    setWindow((before) => {
      if (
        before?.firstKey === firstKey &&
        before.lastKey === lastKey &&
        before.first === first &&
        before.last === last
      )
        return before;
      const direction = matchesWindow(rows, before) && first < before.first ? -1 : 1;
      return { first, last, direction, firstKey, lastKey };
    });
  });
  useEffect(() => {
    onChange?.(thumbnailWindow(rows, window));
  }, [rows, window, onChange]);
  return changed;
}
