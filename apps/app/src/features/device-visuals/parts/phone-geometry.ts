import type { PhoneFold } from '../types';
import type { Bounds } from './shapes';

export const BODY_TOP = 10;
export const BODY_HEIGHT = 86;
const BEZEL = 3.2;
const LOW_LEVEL = 20;
const WARNING_LEVEL = 35;
export const BAR_HEIGHT = 3.2;
export const MOST_DOTS = 5;

export interface Slab {
  readonly x: number;
  readonly w: number;
  readonly r: number;
  readonly screenR: number;
}

const CLOSED: Slab = { x: 31, w: 38, r: 9, screenR: 6.5 };

const OPEN: Slab = { x: 14, w: 72, r: 9, screenR: 5 };

export function slabOf(fold: PhoneFold | null): Slab {
  return fold === 'open' ? OPEN : CLOSED;
}

export function bodyBounds(slab: Slab): Bounds {
  return { x: slab.x, y: BODY_TOP, w: slab.w, h: BODY_HEIGHT, r: slab.r };
}

export function screenBounds(slab: Slab): Bounds {
  return {
    x: slab.x + BEZEL,
    y: BODY_TOP + BEZEL,
    w: slab.w - 2 * BEZEL,
    h: BODY_HEIGHT - 2 * BEZEL,
    r: slab.screenR,
  };
}

export function centreOf(slab: Slab): number {
  return slab.x + slab.w / 2;
}

type BarBand = 'critical' | 'warning' | 'positive';

export function bandOf(level: number): BarBand {
  if (level <= LOW_LEVEL) return 'critical';
  return level <= WARNING_LEVEL ? 'warning' : 'positive';
}

export function fillWidth(track: number, level: number): number {
  return Math.max(BAR_HEIGHT, (track * Math.min(100, Math.max(0, level))) / 100);
}

export function dotCentres(count: number, centre: number, gap: number): readonly number[] {
  const shown = Math.min(count, MOST_DOTS);
  return Array.from({ length: shown }, (_, index) => centre + (index - (shown - 1) / 2) * gap);
}
