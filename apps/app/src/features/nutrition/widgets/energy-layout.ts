import type { FrameClass } from '../../../components/widget-board';
import { isTile } from '../../../components/widget-board/all-sizes';
import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export type EnergyLayout = 'dial' | 'rows' | 'strip';

export type EnergyWell = 'size-5' | 'size-6' | 'size-7';

const WELLS: readonly (readonly [EnergyWell, number])[] = [
  ['size-7', 28],
  ['size-6', 24],
  ['size-5', 20],
];

const ENERGY_ROW_GAP = 4;

export function energyLayoutOf(cls: FrameClass): EnergyLayout {
  if (isTile(cls)) {
    return 'dial';
  }
  return cls === 'w' ? 'strip' : 'rows';
}

export function energyWellOf(room: number, rows: number, idiom: Idiom): EnergyWell {
  const line = TYPE_SCALE[idiom].callout[1];
  const gaps = (rows - 1) * ENERGY_ROW_GAP;
  const fit = WELLS.find(([, px]) => rows * Math.max(px, line) + gaps <= room);
  return fit === undefined ? 'size-5' : fit[0];
}
