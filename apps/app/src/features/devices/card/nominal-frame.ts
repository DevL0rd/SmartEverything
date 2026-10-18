import type { WidgetFrameBox, WidgetSize } from '../../../components/widget-board';
import type { Idiom } from '../../../design/tokens';

const NOMINAL: Readonly<Record<Idiom, Readonly<Record<WidgetSize, readonly [number, number]>>>> = {
  touch: { M: [326, 140], W: [326, 140], XL: [326, 324] },
  pointer: { M: [508, 120], W: [1072, 120], XL: [1072, 296] },
};

export function nominalFrame(size: WidgetSize, idiom: Idiom): WidgetFrameBox {
  const [width, height] = NOMINAL[idiom][size];
  return { width, height, idiom };
}
