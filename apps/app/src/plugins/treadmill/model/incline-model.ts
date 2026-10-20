import type { BeltState, InclineScale, TreadmillStateView } from '@smarteverything/domain';
import { decimal } from '../../../format/number';

export type InclineRange = NonNullable<TreadmillStateView['limits']['incline']>;

export type InclineGate =
  | { readonly kind: 'none' }
  | { readonly kind: 'viewer'; readonly reason: string }
  | {
      readonly kind: 'controls';
      readonly range: InclineRange;
      readonly ceiling: number;
      readonly enabled: boolean;
      readonly hold: boolean;
      readonly reason: string | null;
    };

export const FAN_DEGREES = 60;

const PRECISION = 1e6;

const CHIP_VALUES: readonly number[] = [0, 5, 10, 15];

const VIEWER_REASON = 'Only the owner or the person on the belt can change the incline.';

const UNLINKED_REASON = 'The treadmill is not linked to a phone yet.';

const REMOTE_REASON =
  'Change the incline from the phone that holds the link, or ask the owner to allow remote incline in the treadmill settings.';

const IDLE_REMOTE_REASON = 'Nobody is walking on the belt, so the incline is not changed remotely.';

const IDLE_REASON =
  'Raise the incline while walking, or hold a button for a second on the phone that holds the link.';

function rounded(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

function walking(state: BeltState): boolean {
  return state === 'running' || state === 'paused';
}

export function walkAbandoned(previous: BeltState, next: BeltState): boolean {
  return walking(previous) && !walking(next);
}

interface Allowance {
  readonly enabled: boolean;
  readonly hold: boolean;
  readonly reason: string | null;
}

function allowanceOf(view: TreadmillStateView, range: InclineRange, state: BeltState): Allowance {
  const remote = !view.link.holderIsYou;
  if (view.link.phase !== 'linked') {
    return { enabled: false, hold: false, reason: UNLINKED_REASON };
  }
  if (remote && range.remoteMax === null) {
    return { enabled: false, hold: false, reason: REMOTE_REASON };
  }
  if (walking(state)) {
    return { enabled: true, hold: false, reason: null };
  }
  return remote
    ? { enabled: false, hold: false, reason: IDLE_REMOTE_REASON }
    : { enabled: true, hold: true, reason: IDLE_REASON };
}

export function inclineGateOf(view: TreadmillStateView, state: BeltState): InclineGate {
  const range = view.limits.incline;
  if (range === null) {
    return { kind: 'none' };
  }
  if (!view.bodyVisible) {
    return { kind: 'viewer', reason: VIEWER_REASON };
  }
  const remote = !view.link.holderIsYou;
  const ceiling =
    remote && range.remoteMax !== null ? Math.min(range.max, range.remoteMax) : range.max;
  return { kind: 'controls', range, ceiling, ...allowanceOf(view, range, state) };
}

export function steppedIncline(
  current: number,
  direction: 1 | -1,
  gate: { readonly range: InclineRange; readonly ceiling: number },
): number | null {
  const next = rounded(current + direction * gate.range.step);
  const bounded = Math.min(Math.max(next, gate.range.min), Math.max(gate.ceiling, current));
  return bounded === current ? null : bounded;
}

export function walkStep(current: number, target: number, step: number): number | null {
  if (target === current) {
    return null;
  }
  return target > current
    ? Math.min(rounded(current + step), target)
    : Math.max(rounded(current - step), target);
}

export function inclineChips(gate: {
  readonly range: InclineRange;
  readonly ceiling: number;
}): readonly number[] {
  return CHIP_VALUES.filter((value) => value >= gate.range.min && value <= gate.ceiling);
}

export function chipLabel(value: number): string {
  return value === 0 ? 'Flat' : decimal(value, 0);
}

export function progressLine(current: number, target: number): string | null {
  if (target === current) {
    return null;
  }
  return `${target > current ? 'Rising' : 'Lowering'} to ${decimal(target, 0)}, now ${decimal(current, 0)}`;
}

export function movingLine(current: number | null, target: number | null): string | null {
  if (current === null || target === null || target === current) {
    return null;
  }
  return `${target > current ? 'Rising' : 'Lowering'} to ${decimal(target, 0)}`;
}

export function deckAngleLine(grade: number | null): string | null {
  if (grade === null) {
    return null;
  }
  if (grade <= 0) {
    return 'Flat';
  }
  const degrees = (Math.atan(grade / 100) * 180) / Math.PI;
  return `${decimal(degrees, 1)}° deck angle`;
}

export function climbLine(climbM: number | null): string | null {
  return climbM === null ? null : `Climb ${decimal(Math.round(climbM), 0)} m`;
}

export function unitWord(scale: InclineScale): string {
  if (scale === 'percent') {
    return '%';
  }
  return scale === 'levels' ? 'level' : 'incline';
}

export function fanAngle(value: number, range: InclineRange): number {
  const span = range.max - range.min;
  if (span <= 0) {
    return 0;
  }
  const share = Math.min(Math.max((value - range.min) / span, 0), 1);
  return share * FAN_DEGREES;
}

export function inclineLabel(value: number, scale: InclineScale, target: number | null): string {
  const base = `Incline ${decimal(value, 0)} ${unitWord(scale) === '%' ? 'percent' : unitWord(scale)}`;
  const moving = movingLine(value, target);
  return moving === null ? base : `${base}, ${moving.toLowerCase()}`;
}

export function inclineTicks(range: InclineRange): readonly number[] {
  const ticks: number[] = [];
  for (let value = range.min; value <= range.max; value = rounded(value + range.step)) {
    ticks.push(value);
  }
  return ticks;
}
