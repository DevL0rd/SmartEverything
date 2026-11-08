import { ASSISTANT_LEVEL_MAX } from '@smarteverything/domain';
import { BAR_GAP_PX, BAR_PX, resampleLevels } from './use-playhead-level';

export const WAVE_HEIGHT = 28;
export const MIN_BAR = 3;
export const SWELL_GAIN = 0.35;
export const SWELL_REACH = 4;
export const TENTHS = 10;

const TALLEST = WAVE_HEIGHT / (1 + SWELL_GAIN);
const PITCH = BAR_PX + BAR_GAP_PX;
const CAP = BAR_PX / 2;

export interface WaveSpan {
  readonly from: number;
  readonly to: number;
  readonly centre: number;
  readonly swell: number;
}

export function clamp01(value: number): number {
  'worklet';
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function barHeights(levels: readonly number[], count: number): readonly number[] {
  const peaks = resampleLevels(levels, count);
  return Array.from({ length: Math.max(0, count) }, (_, bar) =>
    Math.max(MIN_BAR, ((peaks[bar] ?? 0) / ASSISTANT_LEVEL_MAX) * TALLEST),
  );
}

export function playedBars(share: number, count: number): number {
  'worklet';
  return Math.round(clamp01(share) * count);
}

function fixed(value: number): string {
  'worklet';
  return value.toFixed(2);
}

function barAt(bar: number, height: number): string {
  'worklet';
  const top = (WAVE_HEIGHT - height) / 2 + CAP;
  return `M${fixed(bar * PITCH)} ${fixed(top)}a${fixed(CAP)} ${fixed(CAP)} 0 0 1 ${fixed(BAR_PX)} 0v${fixed(height - BAR_PX)}a${fixed(CAP)} ${fixed(CAP)} 0 0 1 ${fixed(-BAR_PX)} 0z`;
}

export function wavePath(heights: readonly number[], span: WaveSpan): string {
  'worklet';
  let path = '';
  const end = Math.min(span.to, heights.length);
  for (let bar = Math.max(0, span.from); bar < end; bar += 1) {
    const near = Math.abs(bar - span.centre) < SWELL_REACH;
    const height = Math.min(WAVE_HEIGHT, (heights[bar] ?? MIN_BAR) * (near ? span.swell : 1));
    path += barAt(bar, height);
  }
  return path;
}

export function tenthOf(share: number): number {
  'worklet';
  return Math.min(TENTHS - 1, Math.floor(clamp01(share) * TENTHS));
}

export function shareAt(x: number, width: number): number {
  'worklet';
  return width > 0 ? clamp01(x / width) : 0;
}
