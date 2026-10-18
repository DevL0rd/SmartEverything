import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';

const FOUR_FROM = 300;
const FIVE_FACTS = 5;
const FOUR_FACTS = 4;
const THREE_FACTS = 3;

export function workoutFactCount(cls: FrameClass, frame: Pick<WidgetFrameBox, 'width'>): number {
  if (cls === 'w') {
    return FIVE_FACTS;
  }
  return frame.width >= FOUR_FROM ? FOUR_FACTS : THREE_FACTS;
}
