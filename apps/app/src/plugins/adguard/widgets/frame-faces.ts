import type {
  BoardClass,
  FrameClass,
  WidgetFrameBox,
  WidgetSize,
} from '../../../components/widget-board';

export type BlockingFace = 'tile' | 'compact' | 'tall' | 'wide';

export function blockingFaceOf(cls: FrameClass): BlockingFace {
  switch (cls) {
    case 's':
      return 'tile';
    case 'xs':
    case 'm':
      return 'compact';
    case 'l':
      return 'tall';
    case 'w':
    case 'xl':
      return 'wide';
  }
}

export const BLOCKING_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

const HEADER_TOUCH = 40;
const HEADER_POINTER = 32;
const BODY_GAP = 12;
const FIGURE_L = 44;
const FIGURE_M = 32;
const CAPTION = 18;
const ROW_GAP = 6;
const BARS_MIN = 16;
const BARS_MAX = 40;
const WIDE_BARS_MIN = 24;
const WIDE_BARS_MAX = 120;
const TOP_LABEL = 16;
const TOP_ROW = 24;
const TOP_ROWS = 5;

export function bodyHeightOf(frame: WidgetFrameBox): number {
  const header = frame.idiom === 'touch' ? HEADER_TOUCH : HEADER_POINTER;
  return Math.max(0, frame.height - header - BODY_GAP);
}

export interface CompactLayout {
  readonly figure: 'l' | 'm';
  readonly bars: number | null;
}

function barsFor(body: number, figure: number): number | null {
  const rest = body - figure - CAPTION - 2 * ROW_GAP;
  return rest >= BARS_MIN ? Math.min(BARS_MAX, rest) : null;
}

export function compactLayoutOf(body: number): CompactLayout {
  const large = barsFor(body, FIGURE_L);
  return large === null
    ? { figure: 'm', bars: barsFor(body, FIGURE_M) }
    : { figure: 'l', bars: large };
}

export function wideBarsHeightOf(body: number): number {
  return Math.min(WIDE_BARS_MAX, Math.max(WIDE_BARS_MIN, body));
}

export function topRowsOf(body: number): number {
  const rest = body - FIGURE_L - CAPTION - BARS_MAX - TOP_LABEL - 4 * ROW_GAP;
  return Math.max(0, Math.min(TOP_ROWS, Math.floor(rest / TOP_ROW)));
}
