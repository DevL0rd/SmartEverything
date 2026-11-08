import type { Idiom } from '../../design/tokens';
import type { Frame } from './board-geometry';
import { SHORTEST_TIER_INNER } from './tier';

export type FrameClass = 'xs' | 's' | 'm' | 'l' | 'w' | 'xl';

export interface WidgetFrameBox {
  readonly width: number;
  readonly height: number;
  readonly idiom: Idiom;
  readonly surface?: 'device-grid';
}

const WIDE_FROM = 560;
const NARROW_BELOW = 200;
const TALL_FROM = 200;

export function frameClassOf({ width, height }: WidgetFrameBox): FrameClass {
  if (width >= WIDE_FROM) {
    return height < TALL_FROM ? 'w' : 'xl';
  }
  if (height < SHORTEST_TIER_INNER) {
    return 'xs';
  }
  if (width < NARROW_BELOW) {
    return 's';
  }
  return height < TALL_FROM ? 'm' : 'l';
}

export function frameBoxOf(frame: Frame, padding: number, idiom: Idiom): WidgetFrameBox {
  return {
    width: frame.width - 2 * padding,
    height: frame.height - 2 * padding,
    idiom,
  };
}
