import type { Device } from '../../../store/state';
import { slotsOf, type Slot } from './cell-span';
import type { Weights } from './card-weights';

export interface PackedRow {
  readonly key: string;
  readonly slots: readonly Slot[];
  readonly free: number;
}

function fillRow(taken: Slot[], waiting: Slot[], free: number): number {
  const filler = free > 0 ? waiting.shift() : undefined;
  if (filler !== undefined) {
    taken.push({ ...filler, span: 1 });
    return fillRow(taken, waiting, free - 1);
  }
  const last = taken.at(-1);
  if (free > 0 && last !== undefined && !last.half) {
    taken.splice(-1, 1, { ...last, span: last.span + free });
    return 0;
  }
  return free;
}

function nextRow(waiting: Slot[], columns: number): PackedRow {
  const taken: Slot[] = [];
  let free = columns;
  for (let index = 0; index < waiting.length && free > 0;) {
    const slot = waiting[index];
    const span = slot === undefined ? columns : Math.min(slot.span, columns);
    if (slot !== undefined && span <= free) {
      taken.push(slot);
      waiting.splice(index, 1);
      free -= span;
    } else {
      index += 1;
    }
  }
  free = fillRow(taken, waiting, free);
  return {
    key: taken.map((slot) => slot.key).join(','),
    slots: taken,
    free,
  };
}

export function packRows(
  devices: readonly Device[],
  columns: number,
  weights: Weights,
): readonly PackedRow[] {
  const waiting = [...slotsOf(devices, weights)];
  const rows: PackedRow[] = [];
  while (waiting.length > 0) {
    rows.push(nextRow(waiting, columns));
  }
  return rows;
}
