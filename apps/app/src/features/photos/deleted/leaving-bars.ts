import type { BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import type { LeavingMonth } from './model';

export const BARS_HEIGHT = 40;
const RADIUS = 3;
const GAP_SHARE = 0.25;

export function leavingShapes(
  months: readonly LeavingMonth[],
  width: number,
  fills: { readonly critical: string; readonly rest: string },
): readonly BarShape[] {
  const slots = barSlots(months.length, width, { gap: GAP_SHARE, min: 1 });
  const peak = months.reduce((most, month) => Math.max(most, month.count), 1);
  return months.flatMap((month, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined || month.count === 0) return [];
    return [
      {
        key: month.key,
        x: slot.x,
        width: slot.width,
        top: BARS_HEIGHT - (month.count / peak) * BARS_HEIGHT,
        bottom: BARS_HEIGHT,
        radii: { top: RADIUS, bottom: RADIUS },
        opacity: 1,
        fill: month.critical ? fills.critical : fills.rest,
      },
    ];
  });
}
