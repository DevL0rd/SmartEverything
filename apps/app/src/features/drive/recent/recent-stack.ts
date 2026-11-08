import type { BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import type { RecentDay } from './recent-model';

export const PLOT_HEIGHT = 72;
const SEGMENT_GAP = 2;
const RADIUS = 3;
const GAP_SHARE = 0.25;

export function stackShapesOf(
  days: readonly RecentDay[],
  width: number,
  changedFill: string,
): BarShape[] {
  const peak = Math.max(1, ...days.map((day) => day.added + day.changed));
  const slots = barSlots(days.length, width, { gap: GAP_SHARE, min: 1 });
  const unit = (PLOT_HEIGHT - 1) / peak;
  const base = PLOT_HEIGHT - 1;
  return days.flatMap((day, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined || day.added + day.changed === 0) return [];
    const addedTop = base - day.added * unit;
    const shapes: BarShape[] = [];
    if (day.added > 0) {
      shapes.push({
        key: `${day.day}-added`,
        ...slot,
        top: addedTop,
        bottom: base,
        radii: { top: day.changed > 0 ? 0 : RADIUS, bottom: 0 },
        opacity: 1,
      });
    }
    if (day.changed > 0) {
      const bottom = day.added > 0 ? addedTop - SEGMENT_GAP : base;
      shapes.push({
        key: `${day.day}-changed`,
        ...slot,
        top: Math.min(bottom - 1, bottom - day.changed * unit),
        bottom,
        radii: { top: RADIUS, bottom: 0 },
        opacity: 1,
        fill: changedFill,
      });
    }
    return shapes;
  });
}
