import type { TimelinePage } from '@smarteverything/domain';
import { localDayKey, MINUTE_MS } from '../../format/time';

export interface MediaTile {
  readonly id: string;
  readonly rev: number;
  readonly aspect: number;
  readonly takenAt: number;
  readonly offsetMin: number | null;
  readonly durationMs: number | null;
  readonly thumbhash: string | null;
  readonly flags: number;
  readonly local: boolean;
  readonly backedUp?: boolean;
}

export interface MediaDay {
  readonly key: string;
  readonly tiles: readonly MediaTile[];
}

function cell<T>(column: readonly T[], index: number, name: string): T {
  const value = column[index];
  if (value === undefined) {
    throw new RangeError(`The timeline page has no ${name} for item ${String(index)}`);
  }
  return value;
}

export function tilesOfPage(page: TimelinePage): readonly MediaTile[] {
  return page.ids.map((id, index) => ({
    id,
    rev: cell(page.revs, index, 'revision'),
    aspect: cell(page.aspect, index, 'aspect'),
    takenAt: cell(page.takenAt, index, 'capture time'),
    offsetMin: cell(page.offsetMin, index, 'time offset'),
    durationMs: cell(page.durationMs, index, 'duration'),
    thumbhash: cell(page.thumbhash, index, 'placeholder'),
    flags: cell(page.flags, index, 'flags'),
    local: false,
  }));
}

export function wallDayKey(takenAt: number, offsetMin: number | null): string {
  if (offsetMin === null) return localDayKey(takenAt);
  return new Date(takenAt + offsetMin * MINUTE_MS).toISOString().slice(0, 10);
}

export type MediaGrouping = 'day' | 'month';

function groupBy(
  tiles: readonly MediaTile[],
  keyOf: (tile: MediaTile) => string,
): readonly MediaDay[] {
  const groups: { readonly key: string; readonly tiles: MediaTile[] }[] = [];
  for (const tile of tiles) {
    const key = keyOf(tile);
    const last = groups.at(-1);
    if (last?.key === key) last.tiles.push(tile);
    else groups.push({ key, tiles: [tile] });
  }
  return groups;
}

export function groupDays(tiles: readonly MediaTile[]): readonly MediaDay[] {
  return groupBy(tiles, (tile) => wallDayKey(tile.takenAt, tile.offsetMin));
}

export function groupMonths(tiles: readonly MediaTile[]): readonly MediaDay[] {
  return groupBy(tiles, (tile) => wallDayKey(tile.takenAt, tile.offsetMin).slice(0, 7));
}

export function groupTiles(
  tiles: readonly MediaTile[],
  grouping: MediaGrouping,
): readonly MediaDay[] {
  return grouping === 'month' ? groupMonths(tiles) : groupDays(tiles);
}

export function sameTile(left: MediaTile, right: MediaTile): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      left.rev === right.rev &&
      left.aspect === right.aspect &&
      left.flags === right.flags &&
      left.thumbhash === right.thumbhash &&
      left.durationMs === right.durationMs &&
      left.local === right.local &&
      left.backedUp === right.backedUp)
  );
}
