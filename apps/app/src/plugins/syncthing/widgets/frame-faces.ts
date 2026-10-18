import type {
  BoardClass,
  FrameClass,
  WidgetFrameBox,
  WidgetSize,
} from '../../../components/widget-board';

export type SyncFace = 'tile' | 'compact' | 'rows' | 'wide' | 'columns';

export function syncFaceOf(cls: FrameClass): SyncFace {
  switch (cls) {
    case 's':
      return 'tile';
    case 'xs':
    case 'm':
      return 'compact';
    case 'l':
      return 'rows';
    case 'w':
      return 'wide';
    case 'xl':
      return 'columns';
  }
}

export const SYNC_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

const HEADER_TOUCH = 40;
const HEADER_POINTER = 32;
const BODY_GAP = 12;
const CHIP_CHROME = 46;
const CHAR_WIDTH = 6.5;
const CHIP_MAX = 150;
const CHIP_GAP = 6;
const MORE_RESERVE = 28;

export function bodyHeightOf(frame: WidgetFrameBox): number {
  const header = frame.idiom === 'touch' ? HEADER_TOUCH : HEADER_POINTER;
  return Math.max(0, frame.height - header - BODY_GAP);
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
