export type SlotKind = 'tile' | 'half' | 'wide' | 'note';

export interface Slot {
  readonly kind: SlotKind;
  readonly aspect: number | null;
}

export interface Metrics {
  readonly gap: number;
  readonly tile: number;
  readonly line: number;
  readonly unit: number;
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

function heightOf(slot: Slot, count: number, width: number, metrics: Metrics): number | null {
  switch (slot.kind) {
    case 'tile':
      return count > 1 ? metrics.tile : metrics.line;
    case 'half':
      return metrics.unit;
    case 'wide':
      return slot.aspect === null ? metrics.unit : Math.round(width / slot.aspect);
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
      height: heightOf(slot, count, each, metrics),
      shared: count > 1,
    };
  });
}

interface Run {
  readonly kind: SlotKind;
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
    if (last?.kind === slot.kind && last.indices.length < room) {
      last.indices.push(index);
      return;
    }
    runs.push({ kind: slot.kind, indices: [index] });
  });
  return runs.map((run) => rowOf(run.indices, slots, width, metrics));
}
