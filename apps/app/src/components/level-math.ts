export const LEVEL_MIN = 1;
export const LEVEL_MAX = 100;
export const LEVEL_SLOP = 12;
const LEVEL_KEY_STEP = 5;
const LEVEL_KEY_STEP_LARGE = 25;
const LEVEL_ACTION_STEP = 10;
export const WHITE_MIN_KELVIN = 2200;
export const WHITE_MAX_KELVIN = 6500;
const WHITE_STEP = 100;
const WHITE_STEP_LARGE = 500;
const MIXED_TICKS_MOST = 8;

const TICK_BUCKET = 10;
const PERCENT = 100;

interface MixedTick {
  readonly value: number;
  readonly colour: string;
}

export interface Mixed {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly MixedTick[];
}

export interface MixedBand {
  readonly left: number;
  readonly width: number;
  readonly ticks: readonly { readonly left: number; readonly colour: string }[];
}

function clampLevel(value: number): number {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(value)));
}

export function levelAt(x: number, width: number): number {
  return clampLevel((x / Math.max(1, width)) * PERCENT);
}

export function levelAfterKey(key: string, shift: boolean, current: number): number | null {
  const step = shift ? LEVEL_KEY_STEP_LARGE : LEVEL_KEY_STEP;
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    return clampLevel(current + step);
  }
  if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return clampLevel(current - step);
  }
  if (key === 'Home') {
    return LEVEL_MIN;
  }
  return key === 'End' ? LEVEL_MAX : null;
}

export function levelAfterAction(action: 'increment' | 'decrement', current: number): number {
  return clampLevel(current + (action === 'increment' ? LEVEL_ACTION_STEP : -LEVEL_ACTION_STEP));
}

function tickBucket(value: number): number {
  return Math.floor(value / TICK_BUCKET);
}

export function crossedTick(previous: number | null, next: number): boolean {
  return previous !== null && tickBucket(previous) !== tickBucket(next);
}

function snapKelvin(kelvin: number): number {
  const clamped = Math.min(WHITE_MAX_KELVIN, Math.max(WHITE_MIN_KELVIN, kelvin));
  return Math.round(clamped / WHITE_STEP) * WHITE_STEP;
}

export function kelvinAt(x: number, width: number): number {
  const share = Math.min(1, Math.max(0, x / Math.max(1, width)));
  return snapKelvin(WHITE_MIN_KELVIN + share * (WHITE_MAX_KELVIN - WHITE_MIN_KELVIN));
}

export function kelvinShare(kelvin: number): number {
  const share = (kelvin - WHITE_MIN_KELVIN) / (WHITE_MAX_KELVIN - WHITE_MIN_KELVIN);
  return Math.round(Math.min(1, Math.max(0, share)) * PERCENT);
}

export function kelvinAfterKey(key: string, shift: boolean, current: number): number | null {
  const step = shift ? WHITE_STEP_LARGE : WHITE_STEP;
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    return snapKelvin(current + step);
  }
  if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return snapKelvin(current - step);
  }
  if (key === 'Home') {
    return WHITE_MIN_KELVIN;
  }
  return key === 'End' ? WHITE_MAX_KELVIN : null;
}

function distinctTicks(
  ticks: readonly MixedTick[],
  share: (value: number) => number,
): MixedBand['ticks'] {
  const seen = new Map(
    ticks.map((tick) => {
      const left = share(tick.value);
      return [`${String(left)}-${tick.colour}`, { left, colour: tick.colour }] as const;
    }),
  );
  return [...seen.values()];
}

export function mixedBandOf(mixed: Mixed, share: (value: number) => number): MixedBand {
  const left = share(mixed.min);
  return {
    left,
    width: Math.max(1, share(mixed.max) - left),
    ticks: mixed.ticks.length > MIXED_TICKS_MOST ? [] : distinctTicks(mixed.ticks, share),
  };
}

export function levelLabel(value: number | null, mixed: Mixed | undefined): string {
  if (value === null) {
    return 'Off';
  }
  return mixed !== undefined && mixed.min !== mixed.max
    ? `${String(mixed.min)}–${String(mixed.max)} %`
    : `${String(value)} %`;
}

export function whiteLabel(value: number | null, mixed: Mixed | undefined): string {
  if (value === null) {
    return 'No white light';
  }
  return mixed !== undefined && mixed.min !== mixed.max
    ? `${String(mixed.min)}–${String(mixed.max)} K`
    : `${String(value)} K`;
}

export function percentOf(value: number, min: number, max: number): number {
  return max > min ? clampLevel(((value - min) / (max - min)) * PERCENT) : LEVEL_MAX;
}

export function valueAtPercent(percent: number, min: number, max: number, step: number): number {
  const raw = min + (percent / PERCENT) * (max - min);
  const stepped = Math.round((raw - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
}

export function swallowNextClick(target: EventTarget): void {
  const release = (): void => {
    target.removeEventListener('click', swallow, true);
    target.removeEventListener('pointerdown', release, true);
  };
  const swallow = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
    release();
  };
  target.addEventListener('click', swallow, true);
  target.addEventListener('pointerdown', release, true);
}

export type LevelShape = 'bar' | 'slim' | 'row' | 'rowOpen' | 'chip' | 'fill';

export type ThumbForm = 'none' | 'notch' | 'bar' | 'dashed';

export type ThumbPolicy = 'full' | 'notch';

interface ShapeRule {
  readonly thumb: ThumbPolicy;
  readonly jumpsOnTap: boolean;
}

export const LEVEL_SHAPE_RULES: Readonly<Record<LevelShape, ShapeRule>> = {
  bar: { thumb: 'full', jumpsOnTap: true },
  slim: { thumb: 'full', jumpsOnTap: true },
  row: { thumb: 'notch', jumpsOnTap: false },
  rowOpen: { thumb: 'notch', jumpsOnTap: false },
  chip: { thumb: 'notch', jumpsOnTap: false },
  fill: { thumb: 'notch', jumpsOnTap: false },
};

export const THUMB_WIDTH: Readonly<Record<Exclude<ThumbForm, 'none'>, number>> = {
  bar: 8,
  dashed: 8,
  notch: 18,
};

interface ThumbState {
  readonly policy: ThumbPolicy;
  readonly off: boolean;
  readonly disabled: boolean;
  readonly dragging: boolean;
}

export function thumbFormOf({ policy, off, disabled, dragging }: ThumbState): ThumbForm {
  if (disabled) {
    return 'none';
  }
  const full = policy === 'full';
  if (dragging) {
    return 'bar';
  }
  if (off) {
    return full ? 'dashed' : 'none';
  }
  return full ? 'bar' : 'notch';
}

export interface ThumbPlacement {
  readonly left: PercentString;
  readonly marginLeft: number;
}

export type PercentString = `${number}%`;

function isPercentString(text: string): text is PercentString {
  return /^\d+(\.\d+)?%$/.test(text);
}

export function percentString(percent: number): PercentString {
  const text = `${String(Math.min(PERCENT, Math.max(0, percent)))}%`;
  if (!isPercentString(text)) {
    throw new RangeError(`Expected a finite percentage, received ${String(percent)}`);
  }
  return text;
}

export function thumbPlacement(percent: number, thumbWidth: number): ThumbPlacement {
  const clamped = Math.min(PERCENT, Math.max(0, percent));
  return { left: percentString(clamped), marginLeft: -(thumbWidth * clamped) / PERCENT };
}
