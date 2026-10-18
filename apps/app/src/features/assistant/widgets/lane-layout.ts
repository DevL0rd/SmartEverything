type SlotKind = 'tile' | 'half' | 'wide' | 'note';

export interface Slot {
  readonly kind: SlotKind;
  readonly aspect: number | null;
  readonly rows: number;
}

export interface Metrics {
  readonly gap: number;
  readonly line: number;
}

export interface Placed {
  readonly index: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly shared: boolean;
}

const TILE_MIN_WIDTH = 152;
const TILE_COLUMNS_MAX = 4;
const TWO_UP_MIN = 520;

function capacityOf(kind: SlotKind, width: number, gap: number): number {
  if (kind === 'tile') {
    const fit = Math.floor((width + gap) / (TILE_MIN_WIDTH + gap));
    return Math.min(TILE_COLUMNS_MAX, Math.max(2, fit));
  }
  return kind === 'half' && width >= TWO_UP_MIN ? 2 : 1;
}

export function rowsHeight(rows: number, metrics: Pick<Metrics, 'gap' | 'line'>): number {
  return rows * metrics.line + (rows - 1) * metrics.gap;
}

function heightOf(slot: Slot, width: number, metrics: Metrics): number | null {
  switch (slot.kind) {
    case 'tile':
    case 'half':
      return rowsHeight(slot.rows, metrics);
    case 'wide':
      return slot.aspect === null
        ? rowsHeight(slot.rows, metrics)
        : Math.round(width / slot.aspect);
    case 'note':
      return null;
  }
}

function rowOf(
  indices: readonly number[],
  slots: readonly Slot[],
  width: number,
  metrics: Metrics,
): readonly Placed[] {
  const count = indices.length;
  const each = Math.floor((width - metrics.gap * (count - 1)) / count);
  return indices.map((index) => {
    const slot = slots[index];
    if (slot === undefined) {
      throw new RangeError(
        `Lane slot ${String(index)} is out of range of ${String(slots.length)}.`,
      );
    }
    return {
      index,
      width: slot.kind === 'note' ? null : each,
      height: heightOf(slot, each, metrics),
      shared: count > 1,
    };
  });
}

interface Run {
  readonly kind: SlotKind;
  readonly rows: number;
  readonly indices: number[];
}

export function placeSlots(
  slots: readonly Slot[],
  width: number,
  metrics: Metrics,
): readonly (readonly Placed[])[] {
  const runs: Run[] = [];
  slots.forEach((slot, index) => {
    const last = runs.at(-1);
    const room = capacityOf(slot.kind, width, metrics.gap);
    if (last?.kind === slot.kind && last.rows === slot.rows && last.indices.length < room) {
      last.indices.push(index);
      return;
    }
    runs.push({ kind: slot.kind, rows: slot.rows, indices: [index] });
  });
  return runs.map((run) => rowOf(run.indices, slots, width, metrics));
}
