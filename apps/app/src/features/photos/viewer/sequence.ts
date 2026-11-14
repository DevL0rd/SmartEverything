import type { LibraryBucket } from '@smarteverything/domain';
import { wallDayKey, type MediaTile } from '../../../components/media-grid/tiles';

export interface MonthTiles {
  readonly month: string;
  readonly tiles: readonly MediaTile[];
  readonly complete: boolean;
}

export interface AdjacentMonths {
  readonly newer: string | null;
  readonly older: string | null;
}

export interface DayPosition {
  readonly position: number;
  readonly total: number;
}

export interface ViewerSequence {
  readonly current: MediaTile | null;
  readonly previous: MediaTile | null;
  readonly next: MediaTile | null;
  readonly day: DayPosition | null;
}

export const EMPTY_SEQUENCE: ViewerSequence = {
  current: null,
  previous: null,
  next: null,
  day: null,
};

export function wallMonthOf(takenAt: string, offsetMin: number | null): string {
  return wallDayKey(Date.parse(takenAt), offsetMin).slice(0, 7);
}

export function adjacentMonths(
  buckets: readonly LibraryBucket[],
  month: string | null,
): AdjacentMonths {
  const at = month === null ? -1 : buckets.findIndex((bucket) => bucket.month === month);
  if (at === -1) return { newer: null, older: null };
  return { newer: buckets[at - 1]?.month ?? null, older: buckets[at + 1]?.month ?? null };
}

export function dayPositionOf(tiles: readonly MediaTile[], index: number): DayPosition | null {
  const tile = tiles[index];
  if (tile === undefined) return null;
  const day = wallDayKey(tile.takenAt, tile.offsetMin);
  let position = 0;
  let total = 0;
  tiles.forEach((other, at) => {
    if (wallDayKey(other.takenAt, other.offsetMin) !== day) return;
    total += 1;
    if (at <= index) position += 1;
  });
  return { position, total };
}

function previousOf(
  current: MonthTiles,
  index: number,
  newer: MonthTiles | null,
): MediaTile | null {
  if (index > 0) return current.tiles[index - 1] ?? null;
  if (newer?.complete !== true) return null;
  return newer.tiles.at(-1) ?? null;
}

function nextOf(current: MonthTiles, index: number, older: MonthTiles | null): MediaTile | null {
  const following = current.tiles[index + 1];
  if (following !== undefined) return following;
  if (!current.complete || older === null) return null;
  return older.tiles[0] ?? null;
}

export function sequenceOf(
  itemId: string,
  current: MonthTiles,
  newer: MonthTiles | null,
  older: MonthTiles | null,
): ViewerSequence {
  const index = current.tiles.findIndex((tile) => tile.id === itemId);
  if (index === -1) return EMPTY_SEQUENCE;
  return {
    current: current.tiles[index] ?? null,
    previous: previousOf(current, index, newer),
    next: nextOf(current, index, older),
    day: dayPositionOf(current.tiles, index),
  };
}

export function needsMore(current: MonthTiles, itemId: string): boolean {
  if (current.complete) return false;
  const index = current.tiles.findIndex((tile) => tile.id === itemId);
  return index === -1 || index === current.tiles.length - 1;
}
