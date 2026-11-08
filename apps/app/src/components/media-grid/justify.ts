import type { Idiom } from '../../design/tokens';
import { sameTile, type MediaDay, type MediaTile } from './tiles';

export const MEDIA_ZOOM_STEPS = ['years', 'months', 'days', 'comfortable'] as const;

export type MediaZoomStep = (typeof MEDIA_ZOOM_STEPS)[number];

export const TILE_GAP = 3;

const POINTER_ROW_HEIGHT: Readonly<Record<MediaZoomStep, number>> = {
  years: 64,
  months: 112,
  days: 168,
  comfortable: 232,
};

const TOUCH_SCALE = 2 / 3;

export function rowHeight(step: MediaZoomStep, idiom: Idiom): number {
  const pointer = POINTER_ROW_HEIGHT[step];
  return idiom === 'pointer' ? pointer : Math.round(pointer * TOUCH_SCALE);
}

export interface GridGeometry {
  readonly width: number;
  readonly target: number;
  readonly gap: number;
}

export interface PlacedTile {
  readonly tile: MediaTile;
  readonly width: number;
}

export interface DayHeadRow {
  readonly kind: 'head';
  readonly key: string;
  readonly day: MediaDay;
}

export interface TileRow {
  readonly kind: 'tiles';
  readonly key: string;
  readonly height: number;
  readonly tiles: readonly PlacedTile[];
}

export type MediaGridRow = DayHeadRow | TileRow;

interface Line {
  readonly tiles: readonly MediaTile[];
  readonly height: number;
}

function fitHeight(geometry: GridGeometry, count: number, aspects: number): number {
  return (geometry.width - geometry.gap * (count - 1)) / aspects;
}

function closer(left: number, right: number, target: number): boolean {
  return Math.abs(left - target) < Math.abs(right - target);
}

function closesBefore(
  open: readonly MediaTile[],
  aspects: number,
  tile: MediaTile,
  geometry: GridGeometry,
): boolean {
  if (open.length === 0) return false;
  const without = fitHeight(geometry, open.length, aspects);
  const withTile = fitHeight(geometry, open.length + 1, aspects + tile.aspect);
  return withTile <= geometry.target && closer(without, withTile, geometry.target);
}

export function justifyDay(tiles: readonly MediaTile[], geometry: GridGeometry): readonly Line[] {
  const lines: Line[] = [];
  let open: MediaTile[] = [];
  let aspects = 0;
  for (const tile of tiles) {
    if (closesBefore(open, aspects, tile, geometry)) {
      lines.push({ tiles: open, height: fitHeight(geometry, open.length, aspects) });
      open = [];
      aspects = 0;
    }
    open.push(tile);
    aspects += tile.aspect;
    const height = fitHeight(geometry, open.length, aspects);
    if (height <= geometry.target) {
      lines.push({ tiles: open, height });
      open = [];
      aspects = 0;
    }
  }
  if (open.length > 0) lines.push({ tiles: open, height: geometry.target });
  return lines;
}

function rowOf(day: MediaDay, line: Line): TileRow {
  const first = line.tiles[0];
  return {
    kind: 'tiles',
    key: `${day.key}:${first?.id ?? ''}`,
    height: line.height,
    tiles: line.tiles.map((tile) => ({ tile, width: tile.aspect * line.height })),
  };
}

export function layoutGrid(
  days: readonly MediaDay[],
  geometry: GridGeometry,
): readonly MediaGridRow[] {
  if (geometry.width <= 0) return [];
  return days.flatMap((day): MediaGridRow[] => [
    { kind: 'head', key: `${day.key}:head`, day },
    ...justifyDay(day.tiles, geometry).map((line) => rowOf(day, line)),
  ]);
}

function samePlaced(left: PlacedTile, right: PlacedTile | undefined): boolean {
  return left.width === right?.width && sameTile(left.tile, right.tile);
}

export function sameRow(left: MediaGridRow, right: MediaGridRow): boolean {
  if (left.kind === 'head') {
    return (
      right.kind === 'head' &&
      left.day.key === right.day.key &&
      left.day.tiles.length === right.day.tiles.length
    );
  }
  return (
    right.kind === 'tiles' &&
    left.height === right.height &&
    left.tiles.length === right.tiles.length &&
    left.tiles.every((placed, index) => samePlaced(placed, right.tiles[index]))
  );
}

export function reuseGridRows(
  previous: readonly MediaGridRow[],
  next: readonly MediaGridRow[],
): readonly MediaGridRow[] {
  const known = new Map(previous.map((row) => [row.key, row] as const));
  const merged = next.map((row) => {
    const old = known.get(row.key);
    return old !== undefined && sameRow(old, row) ? old : row;
  });
  const unchanged =
    merged.length === previous.length && merged.every((row, index) => row === previous[index]);
  return unchanged ? previous : merged;
}

export function headIndices(rows: readonly MediaGridRow[]): number[] {
  return rows.flatMap((row, index) => (row.kind === 'head' ? [index] : []));
}
