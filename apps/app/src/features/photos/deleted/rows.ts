import type { DeletedDay, DeletedItem } from './model';

export interface TileGeometry {
  readonly width: number;
  readonly target: number;
  readonly gap: number;
}

export interface DeletedHeadRow {
  readonly kind: 'head';
  readonly key: string;
  readonly day: string;
  readonly ids: readonly string[];
}

export interface DeletedTilesRow {
  readonly kind: 'tiles';
  readonly key: string;
  readonly items: readonly DeletedItem[];
  readonly tileWidth: number;
  readonly height: number;
}

export type DeletedRow = DeletedHeadRow | DeletedTilesRow;

export function columnsOf(geometry: TileGeometry): number {
  return Math.max(
    1,
    Math.floor((geometry.width + geometry.gap) / (geometry.target + geometry.gap)),
  );
}

export function tileWidthOf(geometry: TileGeometry, columns: number): number {
  return Math.max(0, (geometry.width - geometry.gap * (columns - 1)) / columns);
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

export function deletedRowsOf(
  days: readonly DeletedDay[],
  geometry: TileGeometry,
): readonly DeletedRow[] {
  if (geometry.width <= 0) return [];
  const columns = columnsOf(geometry);
  const tileWidth = tileWidthOf(geometry, columns);
  return days.flatMap((day): DeletedRow[] => [
    { kind: 'head', key: `head:${day.day}`, day: day.day, ids: day.items.map((item) => item.id) },
    ...chunk(day.items, columns).map((items, index): DeletedTilesRow => ({
      kind: 'tiles',
      key: `tiles:${day.day}:${String(index)}`,
      items,
      tileWidth,
      height: geometry.target,
    })),
  ]);
}
