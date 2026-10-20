import { percent } from '../format/number';
import type { StatusTone } from './tone';

export const LEVEL_SEGMENTS = 4;
export const LOW_LEVEL = 20;

export type LevelTone = StatusTone | 'neutral';

export interface LevelLook {
  readonly lit: number;
  readonly tone: LevelTone;
  readonly word: string;
}

export function levelLook(reading: number): LevelLook {
  const level = Math.min(100, Math.max(0, reading));
  const low = level <= LOW_LEVEL;
  return {
    lit: Math.ceil((level / 100) * LEVEL_SEGMENTS),
    tone: low ? 'warning' : 'positive',
    word: low ? `Low · ${percent(level / 100)}` : percent(level / 100),
  };
}

export const SEGMENT_WIDTH = 10;
export const SEGMENT_HEIGHT = 8;
export const SEGMENT_GAP = 2;
export const SEGMENT_RADIUS = 4;
export const SEGMENTS_WIDTH = LEVEL_SEGMENTS * SEGMENT_WIDTH + (LEVEL_SEGMENTS - 1) * SEGMENT_GAP;

function segmentPath(index: number): string {
  const left = index * (SEGMENT_WIDTH + SEGMENT_GAP);
  const right = left + SEGMENT_WIDTH;
  const inset = SEGMENT_RADIUS;
  const flat = SEGMENT_HEIGHT - 2 * inset;
  const arc = `A${String(inset)} ${String(inset)} 0 0 1`;
  return [
    `M${String(left + inset)} 0H${String(right - inset)}`,
    `${arc} ${String(right)} ${String(inset)}V${String(inset + flat)}`,
    `${arc} ${String(right - inset)} ${String(SEGMENT_HEIGHT)}H${String(left + inset)}`,
    `${arc} ${String(left)} ${String(inset + flat)}V${String(inset)}`,
    `${arc} ${String(left + inset)} 0Z`,
  ].join('');
}

export function segmentsPath(first: number, last: number): string {
  return Array.from({ length: Math.max(0, last - first) }, (_, offset) =>
    segmentPath(first + offset),
  ).join('');
}
