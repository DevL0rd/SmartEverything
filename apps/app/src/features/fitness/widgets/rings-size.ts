import type { WidgetFrameBox } from '../../../components/widget-board';

const HEADER_HEIGHT = { touch: 40, pointer: 32 } as const;
const HEADER_GAP = 12;
const SMALLEST_RING = 56;
const LABELS_ABOVE_BELOW = 200;

const RING_GAP = 20;

export function bodyHeightOf(frame: WidgetFrameBox): number {
  return frame.height - HEADER_HEIGHT[frame.idiom] - HEADER_GAP;
}

export function ringSizeOf(frame: WidgetFrameBox, wanted: number): number {
  return Math.max(SMALLEST_RING, Math.min(wanted, bodyHeightOf(frame)));
}

export function narrowRowsOf(frame: WidgetFrameBox, ring: number): boolean {
  return frame.width - ring - RING_GAP < LABELS_ABOVE_BELOW;
}
