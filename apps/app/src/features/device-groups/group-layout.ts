import type { Idiom } from '../../design/tokens';

export interface RowMetrics {
  readonly row: number;
  readonly gap: number;
  readonly column: number;
  readonly header: number;
  readonly master: number;
  readonly white: number;
  readonly more: number;
}

export interface RowInput {
  readonly width: number;
  readonly height: number;
  readonly idiom: Idiom;
  readonly total: number;
  readonly wide: boolean;
  readonly expandedIndex: number | null;
  readonly expandedExtra: number;
  readonly lines: number;
  readonly note: boolean;
}

export interface RowPlan {
  readonly columns: number;
  readonly start: number;
  readonly count: number;
  readonly hidden: number;
}

export interface ChipGridPlan {
  readonly leftWidth: number;
  readonly columns: number;
  readonly chipWidth: number;
  readonly shown: number;
  readonly hidden: number;
}

const LINE = 24;
const NOTE = 20;
const WIDE_COLUMNS_FROM = 1000;
const CHIP_WIDTH = 104;
const CHIP_GAP = 6;
const MORE_WIDTH = 72;
const GRID_CHIP_WIDTH = 140;
const GRID_GAP = 8;
const LEFT_SHARE = 0.38;
const LEFT_MIN = 300;
const ZONE_GAP = 16;
const TWO_ROWS_FROM = 110;

export function rowMetrics(idiom: Idiom): RowMetrics {
  return idiom === 'touch'
    ? { row: 48, gap: 2, column: 8, header: 40, master: 48, white: 32, more: 44 }
    : { row: 40, gap: 4, column: 12, header: 36, master: 40, white: 28, more: 32 };
}

function stackHeight(metrics: RowMetrics, lines: number): number {
  return (
    metrics.header + metrics.master + metrics.white + metrics.gap * 3 + lines * (LINE + metrics.gap)
  );
}

export function planRows(input: RowInput): RowPlan {
  const metrics = rowMetrics(input.idiom);
  const columns = input.wide ? (input.width >= WIDE_COLUMNS_FROM ? 3 : 2) : 1;
  const free =
    input.height -
    stackHeight(metrics, input.lines) -
    (input.expandedIndex === null ? 0 : input.expandedExtra);
  const step = metrics.row + metrics.gap;
  let perColumn = Math.floor((free - (input.note ? NOTE : 0) + metrics.gap) / step);
  if (input.total > perColumn * columns)
    perColumn = Math.max(1, Math.floor((free - metrics.more) / step));
  const count = Math.min(Math.max(perColumn, 0) * columns, input.total);
  const start =
    input.expandedIndex !== null && input.expandedIndex >= count
      ? input.expandedIndex - count + 1
      : 0;
  return { columns, start, count, hidden: input.total - count };
}

export interface RowPart<T> {
  readonly items: readonly T[];
  readonly columns: number;
}

export function spanParts<T extends { readonly id: string }>(
  visible: readonly T[],
  columns: number,
  spanId: string | null,
): readonly RowPart<T>[] {
  const at = spanId === null ? -1 : visible.findIndex((item) => item.id === spanId);
  if (at < 0 || columns === 1) return [{ items: visible, columns }];
  return [
    { items: visible.slice(0, at), columns },
    { items: visible.slice(at, at + 1), columns: 1 },
    { items: visible.slice(at + 1), columns },
  ].filter((part) => part.items.length > 0);
}

export function planChips(width: number, total: number): { shown: number; hidden: number } {
  const all = total * CHIP_WIDTH + (total - 1) * CHIP_GAP <= width;
  const shown = all
    ? total
    : Math.max(1, Math.floor((width - MORE_WIDTH - CHIP_GAP) / (CHIP_WIDTH + CHIP_GAP)));
  return { shown, hidden: total - shown };
}

export function planChipGrid(width: number, height: number, total: number): ChipGridPlan {
  const leftWidth = Math.max(LEFT_MIN, Math.round(width * LEFT_SHARE));
  const zone = width - leftWidth - ZONE_GAP;
  const columns = Math.max(1, Math.floor((zone + GRID_GAP) / (GRID_CHIP_WIDTH + GRID_GAP)));
  const capacity = columns * (height >= TWO_ROWS_FROM ? 2 : 1);
  const everything = total <= capacity;
  const shown = everything ? total : capacity - 1;
  const chipWidth = Math.floor((zone + GRID_GAP) / columns) - GRID_GAP;
  return { leftWidth, columns, chipWidth, shown, hidden: total - shown };
}

export const CHIP_METRICS = { width: CHIP_WIDTH, gap: CHIP_GAP, moreWidth: MORE_WIDTH } as const;
