import type { PhotoErase, PhotoPoint } from '@smarteverything/domain';
import type { Rect } from './geometry';

export type Stroke = PhotoErase['strokes'][number];

export const DEFAULT_BRUSH = 6;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function pointIn(rect: Rect, x: number, y: number): PhotoPoint {
  return { x: clamp(x / Math.max(1, rect.width)), y: clamp(y / Math.max(1, rect.height)) };
}

export function brushPx(size: number, rect: Rect): number {
  return size * Math.min(rect.width, rect.height);
}

export function erasedSummary(count: number, pointer: boolean): string {
  if (count === 0) return `Brush over what to remove, then ${pointer ? 'click' : 'tap'} Erase.`;
  return count === 1 ? 'One area erased.' : `${String(count)} areas erased.`;
}
