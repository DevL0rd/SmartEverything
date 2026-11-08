import type { FigureSize } from '../../../components/figure';
import type { WidgetFrameBox } from '../../../components/widget-board/frame-class';
import { widgetBodyHeight } from '../../../components/widget-board/widget-frame-metrics';
import { TYPE_SCALE, type TypeRole } from '../../../design/tokens';

const SMALLEST_RING = 56;
const ROW_INNER_GAP = 2;
const BAR = 6;
const THICK_BAR = 10;
const ROWS_GAP = 12;
const CHEER_GAP = 8;
const BLOCK_GAP = 12;

function lineOf(frame: WidgetFrameBox, role: TypeRole): number {
  return TYPE_SCALE[frame.idiom][role][1];
}

export function ringSizeOf(frame: WidgetFrameBox): number {
  return Math.max(SMALLEST_RING, Math.floor(widgetBodyHeight(frame)));
}

function ringRowHeight(frame: WidgetFrameBox): number {
  return lineOf(frame, 'footnote') + ROW_INNER_GAP + BAR;
}

export function tallRingOf(frame: WidgetFrameBox, count: number): number {
  const rows = count * ringRowHeight(frame) + Math.max(0, count - 1) * ROWS_GAP;
  const taken = lineOf(frame, 'callout') + CHEER_GAP + BLOCK_GAP + rows;
  return Math.max(SMALLEST_RING, Math.floor(widgetBodyHeight(frame) - taken));
}

export function stripFigureOf(frame: WidgetFrameBox): FigureSize {
  const lines = 2 * lineOf(frame, 'footnote') + THICK_BAR + 3 * ROW_INNER_GAP;
  return lines + lineOf(frame, 'figure-m') <= widgetBodyHeight(frame) ? 'm' : 's';
}
