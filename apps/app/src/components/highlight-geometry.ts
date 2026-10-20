import type { Rect } from './anchor';

export const RING_GAP = 4;
export const GLOW_SPREAD = 6;
export const LABEL_GAP = 8;
export const LABEL_HEIGHT = 28;

export interface Pane {
  readonly side: 'top' | 'bottom' | 'left' | 'right';
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function ringAround(box: Rect): Rect {
  return {
    x: box.x - RING_GAP,
    y: box.y - RING_GAP,
    width: box.width + RING_GAP * 2,
    height: box.height + RING_GAP * 2,
  };
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export function panesAround(ring: Rect, viewport: Viewport): readonly Pane[] {
  const left = Math.max(0, ring.x);
  const top = Math.max(0, ring.y);
  const right = Math.min(viewport.width, ring.x + ring.width);
  const bottom = Math.min(viewport.height, ring.y + ring.height);
  return [
    { side: 'top', left: 0, top: 0, width: viewport.width, height: top },
    {
      side: 'bottom',
      left: 0,
      top: bottom,
      width: viewport.width,
      height: Math.max(0, viewport.height - bottom),
    },
    { side: 'left', left: 0, top, width: left, height: Math.max(0, bottom - top) },
    {
      side: 'right',
      left: right,
      top,
      width: Math.max(0, viewport.width - right),
      height: Math.max(0, bottom - top),
    },
  ];
}

export function labelFrame(
  ring: Rect,
  viewport: Viewport,
): { readonly left: number; readonly top: number } {
  const below = ring.y + ring.height + LABEL_GAP;
  const fits = below + LABEL_HEIGHT <= viewport.height;
  return {
    left: Math.max(LABEL_GAP, ring.x),
    top: fits ? below : Math.max(0, ring.y - LABEL_GAP - LABEL_HEIGHT),
  };
}

export function frameOf(box: Rect, spread = 0): Omit<Pane, 'side'> {
  return {
    left: box.x - spread,
    top: box.y - spread,
    width: box.width + spread * 2,
    height: box.height + spread * 2,
  };
}
