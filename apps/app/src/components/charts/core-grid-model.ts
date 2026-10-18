import { barPath } from './bar-path';

export const HEAT_FROM = 64;
export const HEAT_COLUMNS = 16;
const HEAT_LEVELS = 10;
const GAP = 2;
const RADIUS = 2;
const MIN_BAR = 2;
const HEAT_FLOOR = 0.1;

export interface CoreGroup {
  readonly label: string;
  readonly from: number;
  readonly to: number;
}

export function coreSummary(values: readonly number[]): string {
  const busiest = Math.max(0, ...values);
  const average = values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
  return `${String(values.length)} threads, busiest ${String(Math.round(busiest))} percent, average ${String(Math.round(average))} percent`;
}

export function threadLine(index: number | null, values: readonly number[]): string | null {
  const value = index === null ? undefined : values[index];
  return index === null || value === undefined
    ? null
    : `Thread ${String(index + 1)} · ${String(Math.round(value))} %`;
}

export interface BarLayout {
  readonly slot: number;
  readonly tracks: string;
  readonly bars: string;
}

export function barLayout(values: readonly number[], width: number, height: number): BarLayout {
  const count = Math.max(values.length, 1);
  const bar = (width - GAP * (count - 1)) / count;
  const radii = { top: RADIUS, bottom: RADIUS };
  const tracks = values.map((_, index) =>
    barPath({ x: index * (bar + GAP), width: bar, top: 0, bottom: height }, radii),
  );
  const bars = values.map((value, index) => {
    const tall = Math.max(MIN_BAR, (clampLoad(value) / 100) * height);
    return barPath(
      { x: index * (bar + GAP), width: bar, top: height - tall, bottom: height },
      radii,
    );
  });
  return { slot: bar + GAP, tracks: tracks.join(' '), bars: bars.join(' ') };
}

function clampLoad(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function barIndexAt(x: number, slot: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(x / slot)));
}

export function selectedBar(index: number, slot: number, height: number): string {
  return barPath(
    { x: index * slot, width: slot - GAP, top: 0, bottom: height },
    { top: RADIUS, bottom: RADIUS },
  );
}

export interface HeatLayout {
  readonly cell: number;
  readonly height: number;
  readonly levels: readonly { readonly opacity: number; readonly d: string }[];
}

function heatCell(width: number): number {
  return (width - GAP * (HEAT_COLUMNS - 1)) / HEAT_COLUMNS;
}

function cellBox(
  position: number,
  cell: number,
): { x: number; top: number; bottom: number; width: number } {
  const column = position % HEAT_COLUMNS;
  const row = Math.floor(position / HEAT_COLUMNS);
  const top = row * (cell + GAP);
  return { x: column * (cell + GAP), width: cell, top, bottom: top + cell };
}

export function levelOf(value: number): number {
  return Math.min(HEAT_LEVELS - 1, Math.floor(clampLoad(value) / (100 / HEAT_LEVELS)));
}

export function heatLayout(values: readonly number[], width: number): HeatLayout {
  const cell = heatCell(width);
  const radii = { top: RADIUS, bottom: RADIUS };
  const paths: string[][] = Array.from({ length: HEAT_LEVELS }, () => []);
  values.forEach((value, position) => {
    paths[levelOf(value)]?.push(barPath(cellBox(position, cell), radii));
  });
  const rows = Math.ceil(values.length / HEAT_COLUMNS);
  return {
    cell,
    height: rows * cell + Math.max(0, rows - 1) * GAP,
    levels: paths.flatMap((d, level) =>
      d.length === 0
        ? []
        : [
            {
              opacity: HEAT_FLOOR + (1 - HEAT_FLOOR) * ((level + 0.5) / HEAT_LEVELS),
              d: d.join(' '),
            },
          ],
    ),
  };
}

export function heatIndexAt(
  point: { x: number; y: number },
  cell: number,
  count: number,
): number | null {
  const column = Math.floor(point.x / (cell + GAP));
  const row = Math.floor(point.y / (cell + GAP));
  const index = row * HEAT_COLUMNS + column;
  return column < 0 || column >= HEAT_COLUMNS || row < 0 || index >= count ? null : index;
}

export function selectedCell(position: number, cell: number): string {
  return barPath(cellBox(position, cell), { top: RADIUS, bottom: RADIUS });
}

export function groupsOf(
  count: number,
  groups: readonly CoreGroup[] | undefined,
): readonly CoreGroup[] {
  return groups ?? [{ label: 'All threads', from: 0, to: count }];
}
