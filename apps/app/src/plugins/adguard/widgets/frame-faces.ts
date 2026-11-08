import type { BoardClass, WidgetSize } from '../../../components/widget-board';
import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export const BLOCKING_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

const TOP_ROW = 24;
const TOP_GAP = 4;

export function topRowsOf(height: number, idiom: Idiom): number {
  const label = TYPE_SCALE[idiom].label[1];
  return Math.max(0, Math.floor((height - label) / (TOP_ROW + TOP_GAP)));
}

export interface StoppedLines {
  readonly headline: number;
  readonly detail: number;
}

export function stoppedLinesOf(room: number, idiom: Idiom): StoppedLines {
  const headline = TYPE_SCALE[idiom]['title-3'][1];
  const detail = TYPE_SCALE[idiom].footnote[1];
  const lines = room >= 2 * headline + detail ? 2 : 1;
  return {
    headline: lines,
    detail: Math.max(1, Math.floor((room - lines * headline) / detail)),
  };
}
