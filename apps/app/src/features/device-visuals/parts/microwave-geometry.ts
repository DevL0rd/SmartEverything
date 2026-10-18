import { rounded } from './shapes';
import type { Box } from './frame';

export const BODY = rounded({ x: 4, y: 22, w: 92, h: 58, r: 6 });
export const DOOR = rounded({ x: 9, y: 27, w: 62, h: 48, r: 4 });
export const WELL = rounded({ x: 12, y: 30, w: 56, h: 42, r: 3 });
export const HANDLE = rounded({ x: 68.4, y: 38, w: 1.8, h: 26, r: 0.9 });
export const PANEL = rounded({ x: 75, y: 26.5, w: 18, h: 10, r: 2.2 });
export const CAVITY: Box = { x: 12, y: 30, w: 56, h: 42 };

const RING_BOUNDS = { x: 7.4, y: 25.4, w: 65.2, h: 51.2, r: 5 } as const;
export const RING = rounded(RING_BOUNDS);

const HALF_TURN = Math.PI;

function roundedLength({ w, h, r }: { w: number; h: number; r: number }): number {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * HALF_TURN * r;
}

export const RING_LENGTH = roundedLength(RING_BOUNDS);

export const DIAL = { cx: 84, cy: 52 } as const;
export const DIAL_STEPS = 7;
const DIAL_START = 135;
const DIAL_SWEEP = 270;
const TICK_INNER = 6.6;
const TICK_OUTER = 8.8;

function tickAt(step: number): string {
  const angle = ((DIAL_START + (step * DIAL_SWEEP) / (DIAL_STEPS - 1)) * Math.PI) / 180;
  const point = (radius: number): string =>
    `${(DIAL.cx + radius * Math.cos(angle)).toFixed(2)} ${(DIAL.cy + radius * Math.sin(angle)).toFixed(2)}`;
  return `M${point(TICK_INNER)}L${point(TICK_OUTER)}`;
}

export function litStep(power: number | null): number {
  return power === null ? -1 : Math.round(power * (DIAL_STEPS - 1));
}

export function ticksPath(from: number, to: number): string {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) =>
    tickAt(from + index),
  ).join('');
}

export function pointerPath(step: number): string {
  const angle = ((DIAL_START + (step * DIAL_SWEEP) / (DIAL_STEPS - 1)) * Math.PI) / 180;
  const x = DIAL.cx + 3.6 * Math.cos(angle);
  const y = DIAL.cy + 3.6 * Math.sin(angle);
  return `M${String(DIAL.cx)} ${String(DIAL.cy)}L${x.toFixed(2)} ${y.toFixed(2)}`;
}
