import type { PhotoSource, SourceItem } from '@smarteverything/domain';
import { bytes, count } from '../../../format/number';
import { localDayKey, playTime } from '../../../format/time';
import { columnsOf, tileWidthOf, type TileGeometry } from '../deleted/rows';

export interface SourceTile {
  readonly id: string;
  readonly chipId: string;
  readonly madeAt: number;
  readonly day: string;
  readonly kept: boolean;
  readonly video: boolean;
  readonly durationMs: number | null;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
}

export interface SourceDay {
  readonly day: string;
  readonly tiles: readonly SourceTile[];
}

export interface SourceHeadRow {
  readonly kind: 'head';
  readonly key: string;
  readonly day: string;
  readonly ids: readonly string[];
  readonly tiles: readonly SourceTile[];
}

export interface SourceTilesRow {
  readonly kind: 'tiles';
  readonly key: string;
  readonly tiles: readonly SourceTile[];
  readonly tileWidth: number;
  readonly height: number;
}

export type SourceRow = SourceHeadRow | SourceTilesRow;

export const SOURCE_ASPECT: Readonly<Record<PhotoSource, number>> = { cameras: 16 / 9, ai: 1 };

const NOUNS: Readonly<Record<PhotoSource, readonly [string, string]>> = {
  cameras: ['clip', 'clips'],
  ai: ['image', 'images'],
};

export function sourceTileOf(item: SourceItem): SourceTile {
  const madeAt = Date.parse(item.madeAt);
  return {
    id: item.itemId,
    chipId: item.chipId,
    madeAt,
    day: localDayKey(madeAt),
    kept: item.kept,
    video: item.mime.startsWith('video/'),
    durationMs: item.durationMs,
    name: item.name,
    mime: item.mime,
    bytes: item.bytes,
  };
}

export function sourceDaysOf(tiles: readonly SourceTile[]): readonly SourceDay[] {
  const days: { readonly day: string; readonly tiles: SourceTile[] }[] = [];
  for (const tile of tiles) {
    const last = days.at(-1);
    if (last?.day === tile.day) last.tiles.push(tile);
    else days.push({ day: tile.day, tiles: [tile] });
  }
  return days;
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

export function sourceRowsOf(
  days: readonly SourceDay[],
  geometry: TileGeometry,
  aspect: number,
): readonly SourceRow[] {
  if (geometry.width <= 0) return [];
  const columns = columnsOf({ ...geometry, target: geometry.target * aspect });
  const tileWidth = tileWidthOf(geometry, columns);
  const height = tileWidth / aspect;
  return days.flatMap((day): SourceRow[] => [
    {
      kind: 'head',
      key: `head:${day.day}`,
      day: day.day,
      ids: day.tiles.map((tile) => tile.id),
      tiles: day.tiles,
    },
    ...chunk(day.tiles, columns).map((tiles, index): SourceTilesRow => ({
      kind: 'tiles',
      key: `tiles:${day.day}:${String(index)}`,
      tiles,
      tileWidth,
      height,
    })),
  ]);
}

export function nounCount(source: PhotoSource, total: number): string {
  const [one, many] = NOUNS[source];
  return total === 1 ? `1 ${one}` : `${count(total)} ${many}`;
}

function clipLength(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${count(hours)} h ${String(minutes)} min`;
  if (minutes > 0) return `${String(minutes)} min ${String(rest)} s`;
  return `${String(rest)} s`;
}

function plural(total: number, one: string, many: string): string {
  return total === 1 ? `1 ${one}` : `${count(total)} ${many}`;
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function cameraDayDetail(tiles: readonly SourceTile[], names: ReadonlyMap<string, string>): string {
  const clips = tiles.filter((tile) => tile.video).length;
  const snapshots = tiles.length - clips;
  const counts = [
    clips === 0 ? null : plural(clips, 'clip', 'clips'),
    snapshots === 0 ? null : plural(snapshots, 'snapshot', 'snapshots'),
  ].filter((part): part is string => part !== null);
  const cameras = distinct(
    tiles.flatMap((tile) => {
      const name = names.get(tile.chipId);
      return name === undefined ? [] : [name];
    }),
  );
  return [cameras.join(', '), counts.join(', ')].filter((part) => part !== '').join(' · ');
}

function aiDayDetail(tiles: readonly SourceTile[]): string {
  const kept = tiles.filter((tile) => tile.kept).length;
  const chats = distinct(tiles.map((tile) => tile.chipId)).length;
  return [
    nounCount('ai', tiles.length),
    chats > 1 ? `from ${count(chats)} chats` : null,
    kept === 0 ? null : `${count(kept)} kept`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export function sourceDayDetail(
  source: PhotoSource,
  tiles: readonly SourceTile[],
  names: ReadonlyMap<string, string>,
): string {
  return source === 'cameras' ? cameraDayDetail(tiles, names) : aiDayDetail(tiles);
}

export function pickedDetail(source: PhotoSource, picked: readonly SourceTile[]): string | null {
  if (picked.length === 0) return null;
  const length = picked.reduce((sum, tile) => sum + (tile.durationMs ?? 0), 0);
  if (source === 'cameras' && length > 0) return clipLength(length);
  return bytes(picked.reduce((sum, tile) => sum + tile.bytes, 0));
}

export function pickedLine(source: PhotoSource, picked: number): string {
  return `${nounCount(source, picked)} selected`;
}

export function keptLine(source: PhotoSource, kept: number): string {
  if (kept === 0) {
    return source === 'cameras' ? 'Already in Drive' : 'Already in your library';
  }
  return source === 'cameras'
    ? `${nounCount(source, kept)} kept in Drive, in Saved › Cameras`
    : `${nounCount(source, kept)} kept in your library`;
}

export function sourceTileLabel(tile: SourceTile): string {
  const parts = [
    tile.video ? 'Clip' : 'Picture',
    tile.video && tile.durationMs !== null ? playTime(tile.durationMs / 1000) : null,
    tile.kept ? 'Kept' : null,
  ];
  return parts.filter((part): part is string => part !== null).join(', ');
}

export function pickedTiles(
  tiles: readonly SourceTile[],
  ids: ReadonlySet<string>,
): readonly SourceTile[] {
  return tiles.filter((tile) => ids.has(tile.id));
}
