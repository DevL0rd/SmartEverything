import type { WidgetFrameBox, WidgetSize } from '../../../components/widget-board';
import { tierInnerHeight } from '../../../components/widget-board/tier';
import type { Idiom } from '../../../design/tokens';

const NOMINAL_WIDTH: Readonly<Record<Idiom, Readonly<Record<WidgetSize, number>>>> = {
  touch: { M: 326, W: 326, XL: 326 },
  pointer: { M: 508, W: 1072, XL: 1072 },
};

export function nominalFrame(size: WidgetSize, idiom: Idiom): WidgetFrameBox {
  return {
    width: NOMINAL_WIDTH[idiom][size],
    height: tierInnerHeight(size, idiom, 'comfortable'),
    idiom,
  };
}
