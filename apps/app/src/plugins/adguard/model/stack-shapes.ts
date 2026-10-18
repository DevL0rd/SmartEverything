import { scaleLinear } from 'd3-scale';
import type { BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import type { HourBar } from './chart-model';

const GAP_SHARE = 0.25;
const SEGMENT_GAP = 2;
const RADIUS = 3;
const ALLOWED_OPACITY = 0.6;
const DIMMED = 0.4;
const MIN_SEGMENT = 1;

interface StackColours {
  readonly allowed: string;
  readonly blocked: string;
}

export interface StackLayout {
  readonly ceiling: number;
  readonly width: number;
  readonly height: number;
  readonly colours: StackColours;
  readonly selected: number | null;
}

export function stackShapes(bars: readonly HourBar[], layout: StackLayout): readonly BarShape[] {
  const { ceiling, colours, selected } = layout;
  const slots = barSlots(bars.length, layout.width, { gap: GAP_SHARE, min: 1 });
  const y = scaleLinear([0, ceiling], [layout.height, 0]);
  return bars.flatMap((bar, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined) {
      return [];
    }
    const dim = selected === null || selected === index ? 1 : DIMMED;
    const blockedTop = bar.blocked > 0 ? y(bar.blocked) : layout.height;
    const allowedBottom = bar.blocked > 0 ? blockedTop - SEGMENT_GAP : layout.height;
    const allowedTop = y(bar.total);
    const hasAllowed = bar.allowed > 0 && allowedBottom - allowedTop >= MIN_SEGMENT;
    const shapes: BarShape[] = [];
    if (bar.blocked > 0) {
      shapes.push({
        key: `${bar.key}-blocked`,
        x: slot.x,
        width: slot.width,
        top: blockedTop,
        bottom: layout.height,
        radii: { top: hasAllowed ? 0 : RADIUS, bottom: 0 },
        opacity: dim,
        fill: colours.blocked,
      });
    }
    if (hasAllowed) {
      shapes.push({
        key: `${bar.key}-allowed`,
        x: slot.x,
        width: slot.width,
        top: allowedTop,
        bottom: allowedBottom,
        radii: { top: RADIUS, bottom: 0 },
        opacity: ALLOWED_OPACITY * dim,
        fill: colours.allowed,
      });
    }
    return shapes;
  });
}
