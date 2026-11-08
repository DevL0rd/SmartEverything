import type { WidgetFrameBox } from '../../../components/widget-board';
import { tierInnerHeight } from '../../../components/widget-board/tier';
import type { Density, Idiom } from '../../../design/tokens';
import type { Placed } from './lane-layout';

export interface LaneFrameContext {
  readonly idiom: Idiom;
  readonly density: Density;
  readonly padding: number;
}

export const NOMINAL_CHAT_WIDTH = 280;

export function frameOfPlaced(
  placed: Pick<Placed, 'width' | 'height'>,
  { idiom, density, padding }: LaneFrameContext,
): WidgetFrameBox {
  if (placed.width === null || placed.height === null) {
    return { width: NOMINAL_CHAT_WIDTH, height: tierInnerHeight('M', idiom, density), idiom };
  }
  return {
    width: placed.width - 2 * padding,
    height: placed.height - 2 * padding,
    idiom,
  };
}
