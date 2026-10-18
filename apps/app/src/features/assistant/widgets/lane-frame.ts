import type { WidgetFrameBox } from '../../../components/widget-board';
import type { Idiom } from '../../../design/tokens';
import type { Placed } from './lane-layout';

export interface LaneFrameContext {
  readonly idiom: Idiom;
  readonly padding: number;
}

export const NOMINAL_CHAT_FRAME = { width: 280, height: 160 } as const;

export function frameOfPlaced(
  placed: Pick<Placed, 'width' | 'height'>,
  { idiom, padding }: LaneFrameContext,
): WidgetFrameBox {
  if (placed.width === null || placed.height === null) {
    return { ...NOMINAL_CHAT_FRAME, idiom };
  }
  return {
    width: placed.width - 2 * padding,
    height: placed.height - 2 * padding,
    idiom,
  };
}
