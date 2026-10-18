import type { FrameClass } from '../../../components/widget-board';
import { isTile } from '../../../components/widget-board/all-sizes';

export type EnergyLayout = 'dial' | 'rows' | 'narrow-rows' | 'strip';

const ROWS_ROOM = 200;
const SMALL_DIAL = 88;
const DIAL_GAP = 20;

export function energyLayoutOf(cls: FrameClass, width: number): EnergyLayout {
  if (isTile(cls)) {
    return 'dial';
  }
  if (cls === 'w') {
    return 'strip';
  }
  return width - SMALL_DIAL - DIAL_GAP < ROWS_ROOM ? 'narrow-rows' : 'rows';
}
