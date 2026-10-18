import type { PresentedCapability } from './presentation/types';

const PERCENT = 100;
const FIRST_PERCENT = 1;
const NATIVE_SCALE_MAX = 100;

export interface LevelRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string | null;
}

function clampPercent(value: number): number {
  return Math.min(PERCENT, Math.max(FIRST_PERCENT, Math.round(value)));
}

function nativePercent(range: LevelRange): boolean {
  return range.unit === '%' || (range.max === NATIVE_SCALE_MAX && range.min <= FIRST_PERCENT);
}

export function levelRangeOf(presented: PresentedCapability): LevelRange | null {
  const descriptor = presented.capability.value;
  if (descriptor.kind !== 'number') return null;
  return {
    min: descriptor.min,
    max: descriptor.max,
    step: descriptor.step,
    unit: presented.unit ?? descriptor.unit ?? null,
  };
}

export function levelPercent(range: LevelRange, value: number): number {
  if (nativePercent(range)) return clampPercent(value);
  if (range.max <= range.min) return PERCENT;
  return clampPercent(((value - range.min) / (range.max - range.min)) * PERCENT);
}

function onStep(range: LevelRange, raw: number): number {
  const stepped = Math.round((raw - range.min) / range.step) * range.step + range.min;
  return Math.min(range.max, Math.max(range.min, Number(stepped.toFixed(6))));
}

export function levelValue(range: LevelRange, percent: number): number {
  if (nativePercent(range)) return onStep(range, percent);
  return onStep(range, range.min + (percent / PERCENT) * (range.max - range.min));
}
