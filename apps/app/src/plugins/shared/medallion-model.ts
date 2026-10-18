import type { StatusTone } from '../../components/tone';

export type MedallionTone = StatusTone | 'neutral';

export type MedallionSize = 'hero' | 'cell' | 'widget';

export interface MedallionGeometry {
  readonly px: number;
  readonly thickness: number;
  readonly glyph: 16 | 24 | 40;
  readonly dot: number;
  readonly dotLeft: number;
  readonly dotTop: number;
  readonly discInset: number;
  readonly glowInset: number;
  readonly glowSpan: number;
}

const HERO_TOUCH_PX = 96;
const HERO_POINTER_PX = 112;
const CELL_PX = 96;
const WIDGET_PX = 48;
const DISC_INSET = 0.07;
const GLOW_OVERSHOOT = 0.3;
const RING_EDGE = 0.853;

function medallionPx(size: MedallionSize, pointer: boolean): number {
  switch (size) {
    case 'hero':
      return pointer ? HERO_POINTER_PX : HERO_TOUCH_PX;
    case 'cell':
      return CELL_PX;
    case 'widget':
      return WIDGET_PX;
  }
}

export function medallionGeometry(size: MedallionSize, pointer: boolean): MedallionGeometry {
  const hero = size !== 'widget';
  const px = medallionPx(size, pointer);
  const dot = hero ? 14 : 12;
  return {
    px,
    thickness: hero ? 4 : 3,
    glyph: hero ? 40 : 24,
    dot,
    dotLeft: px * RING_EDGE - dot / 2,
    dotTop: px * (1 - RING_EDGE) - dot / 2,
    discInset: px * DISC_INSET,
    glowInset: -px * GLOW_OVERSHOOT,
    glowSpan: px * (1 + 2 * GLOW_OVERSHOOT),
  };
}

export function ringValue(ratio: number | null, offline: boolean): number {
  return offline || ratio === null ? 0 : Math.min(1, Math.max(0, ratio));
}

export function boxStyle(span: number): { readonly width: number; readonly height: number } {
  return { width: span, height: span };
}
