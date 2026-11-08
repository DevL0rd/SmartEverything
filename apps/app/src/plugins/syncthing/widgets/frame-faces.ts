import type { BoardClass, WidgetSize } from '../../../components/widget-board';
import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export const SYNC_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

const CHIP_CHROME = 46;
const CHAR_WIDTH = 6.5;
const CHIP_MAX = 150;
const CHIP_GAP = 6;
const MORE_RESERVE = 28;
const CHIP_ROW = 24;
const COMPACT_GAP = 6;

export function devicesLineFits(room: number, idiom: Idiom, stale: boolean): boolean {
  const type = TYPE_SCALE[idiom];
  const lines = stale ? 2 : 1;
  const gaps = lines + 1;
  return type.body[1] + CHIP_ROW + lines * type.footnote[1] + gaps * COMPACT_GAP <= room;
}

export function rowCapacity(body: number, reserved: number, rowHeight: number): number {
  return Math.max(1, Math.floor((body - reserved) / rowHeight));
}

export function fitRows<T>(
  items: readonly T[],
  capacity: number,
): { readonly shown: readonly T[]; readonly more: number } {
  if (items.length <= capacity) {
    return { shown: items, more: 0 };
  }
  const shown = items.slice(0, Math.max(1, capacity - 1));
  return { shown, more: items.length - shown.length };
}

export function chipWidthOf(label: string): number {
  return Math.min(CHIP_MAX, CHIP_CHROME + CHAR_WIDTH * label.length);
}

function packChips(labels: readonly string[], width: number, lines: number): number {
  let line = 1;
  let used = 0;
  let placed = 0;
  for (const label of labels) {
    const chip = chipWidthOf(label);
    const next = used === 0 ? chip : used + CHIP_GAP + chip;
    if (next > width && used > 0) {
      line += 1;
      used = chip;
    } else {
      used = next;
    }
    if (line > lines) {
      return placed;
    }
    placed += 1;
  }
  return placed;
}

export function fitChips<T extends { readonly label: string }>(
  items: readonly T[],
  width: number,
  lines: number,
): { readonly shown: readonly T[]; readonly more: number } {
  const labels = items.map((item) => item.label);
  const all = packChips(labels, width, lines);
  const fitted = all === items.length ? all : packChips(labels, width - MORE_RESERVE, lines);
  const count = Math.max(1, fitted);
  return { shown: items.slice(0, count), more: items.length - Math.min(count, items.length) };
}
