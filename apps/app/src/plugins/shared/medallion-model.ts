import type { StatusTone } from '../../components/tone';
import type { WideClass } from '../../features/devices';

export type MedallionTone = StatusTone | 'neutral';

export type MedallionSize = 'hero' | 'cell' | 'widget';

export interface SquareStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

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
  readonly boxStyle: { readonly width: number; readonly height: number };
  readonly glowStyle: SquareStyle;
  readonly discStyle: SquareStyle;
  readonly dotStyle: SquareStyle;
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

const GEOMETRY = new Map<string, MedallionGeometry>();

export function medallionGeometry(size: MedallionSize, pointer: boolean): MedallionGeometry {
  const key = `${size}:${String(pointer)}`;
  const known = GEOMETRY.get(key);
  if (known !== undefined) return known;
  const geometry = buildGeometry(size, pointer);
  GEOMETRY.set(key, geometry);
  return geometry;
}

function square(left: number, top: number, span: number): SquareStyle {
  return Object.freeze({ left, top, width: span, height: span });
}

function buildGeometry(size: MedallionSize, pointer: boolean): MedallionGeometry {
  const hero = size !== 'widget';
  const px = medallionPx(size, pointer);
  const dot = hero ? 14 : 12;
  const dotLeft = px * RING_EDGE - dot / 2;
  const dotTop = px * (1 - RING_EDGE) - dot / 2;
  const discInset = px * DISC_INSET;
  const glowInset = -px * GLOW_OVERSHOOT;
  const glowSpan = px * (1 + 2 * GLOW_OVERSHOOT);
  return Object.freeze({
    px,
    thickness: hero ? 4 : 3,
    glyph: hero ? 40 : 24,
    dot,
    dotLeft,
    dotTop,
    discInset,
    glowInset,
    glowSpan,
    boxStyle: Object.freeze(boxStyle(px)),
    glowStyle: square(glowInset, glowInset, glowSpan),
    discStyle: square(discInset, discInset, px - 2 * discInset),
    dotStyle: square(dotLeft, dotTop, dot),
  });
}

export function cellMedallionSize(cls: WideClass): MedallionSize {
  return cls === 'l' || cls === 'xl' ? 'hero' : 'cell';
}

export function ringValue(ratio: number | null, offline: boolean): number {
  return offline || ratio === null ? 0 : Math.min(1, Math.max(0, ratio));
}

export function boxStyle(span: number): { readonly width: number; readonly height: number } {
  return { width: span, height: span };
}
