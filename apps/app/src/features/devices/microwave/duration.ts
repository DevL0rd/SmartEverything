import { microwaveSeconds, type MicrowaveTimeRange } from '@smarteverything/domain';

const SECONDS_PER_MINUTE = 60;

export interface DurationBounds {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
export interface DurationSteppers {
  readonly minutes: { readonly min: number; readonly max: number; readonly step: number };
  readonly seconds: { readonly max: number; readonly step: number } | null;
}

export function durationBounds(range: MicrowaveTimeRange): DurationBounds {
  return {
    min: microwaveSeconds(range.min),
    max: microwaveSeconds(range.max),
    step: microwaveSeconds(range.resolution),
  };
}
export function snapSeconds(seconds: number, bounds: DurationBounds): number {
  const clamped = Math.min(bounds.max, Math.max(bounds.min, seconds));
  const snapped = bounds.min + Math.round((clamped - bounds.min) / bounds.step) * bounds.step;
  return snapped > bounds.max ? snapped - bounds.step : snapped;
}
export function durationSteppers(bounds: DurationBounds): DurationSteppers {
  const wholeMinutes = bounds.step % SECONDS_PER_MINUTE === 0;
  return {
    minutes: {
      min: Math.floor(bounds.min / SECONDS_PER_MINUTE),
      max: Math.floor(bounds.max / SECONDS_PER_MINUTE),
      step: wholeMinutes ? bounds.step / SECONDS_PER_MINUTE : 1,
    },
    seconds: wholeMinutes
      ? null
      : {
          max: Math.floor((SECONDS_PER_MINUTE - 1) / bounds.step) * bounds.step,
          step: bounds.step,
        },
  };
}
export function withMinutes(total: number, minutes: number): number {
  return minutes * SECONDS_PER_MINUTE + (total % SECONDS_PER_MINUTE);
}
export function withSeconds(total: number, seconds: number): number {
  return Math.floor(total / SECONDS_PER_MINUTE) * SECONDS_PER_MINUTE + seconds;
}
