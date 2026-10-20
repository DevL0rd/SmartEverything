import {
  BOTTLE_CLOCK_SLACK_MS,
  BOTTLE_DRINK_MIN_ML,
  BOTTLE_FILL_MIN_ML,
  BOTTLE_FIRST_VALID_YEAR,
  type BottleClassifierState,
  type BottleCurve,
  type BottleVerdict,
} from '@smarteverything/domain';
import { volumeOf } from './volume';

export const SIGNAL_GOOD_KCPS = 5000;

export const SIGNAL_ACCEPTABLE_KCPS = 1000;

const WEAK_SIGNAL_KCPS = 100;

const NEIGHBOUR_JUMP_MM = 6;

const MS_PER_SECOND = 1000;

const FIRST_VALID_SECONDS = Date.UTC(BOTTLE_FIRST_VALID_YEAR, 0, 1) / MS_PER_SECOND;

export const EMPTY_CLASSIFIER: BottleClassifierState = {
  lastCalc: null,
  lastCounted: null,
  lastSkipped: null,
  previousDistanceMm: null,
  afterFill: false,
};

export interface ClassifierRow {
  readonly at: number;
  readonly trigger: string;
  readonly distanceMm: number;
  readonly kcps: number;
}

export type ReadingEvent =
  | { readonly kind: 'none' }
  | { readonly kind: 'seed' }
  | { readonly kind: 'small' }
  | { readonly kind: 'drink'; readonly ml: number }
  | {
      readonly kind: 'fill';
      readonly fromMl: number;
      readonly toMl: number;
      readonly drunkMl: number;
    };

export interface ClassifiedRow {
  readonly row: ClassifierRow;
  readonly verdict: BottleVerdict;
  readonly volumeMl: number | null;
  readonly event: ReadingEvent;
}

export interface Classification {
  readonly rows: readonly ClassifiedRow[];
  readonly state: BottleClassifierState;
  readonly undecided: ClassifierRow | null;
}

export type SignalQuality = 'good' | 'acceptable' | 'weak';

export function signalQualityOf(kcps: number): SignalQuality {
  if (kcps > SIGNAL_GOOD_KCPS) {
    return 'good';
  }
  return kcps >= SIGNAL_ACCEPTABLE_KCPS ? 'acceptable' : 'weak';
}

interface Applied {
  readonly state: BottleClassifierState;
  readonly event: ReadingEvent;
}

function seeded(state: BottleClassifierState, volume: number, distanceMm: number): Applied {
  return {
    state: {
      ...state,
      lastCalc: volume,
      lastCounted: volume,
      lastSkipped: null,
      previousDistanceMm: distanceMm,
      afterFill: false,
    },
    event: { kind: 'seed' },
  };
}

interface Reading {
  readonly volume: number;
  readonly distanceMm: number;
}

interface Before {
  readonly lastCalc: number;
  readonly lastCounted: number;
}

function filled(state: BottleClassifierState, reading: Reading, before: Before): Applied {
  const drunk =
    state.lastSkipped === null
      ? 0
      : Math.max(0, Math.round(before.lastCounted - state.lastSkipped));
  return {
    state: {
      lastCalc: reading.volume,
      lastCounted: reading.volume,
      lastSkipped: null,
      previousDistanceMm: reading.distanceMm,
      afterFill: true,
    },
    event: {
      kind: 'fill',
      fromMl: Math.round(before.lastCalc),
      toMl: Math.round(reading.volume),
      drunkMl: drunk,
    },
  };
}

function apply(state: BottleClassifierState, volume: number, distanceMm: number): Applied {
  const { lastCalc, lastCounted } = state;
  if (lastCalc === null || lastCounted === null) {
    return seeded(state, volume, distanceMm);
  }
  if (volume - lastCalc > BOTTLE_FILL_MIN_ML) {
    return filled(state, { volume, distanceMm }, { lastCalc, lastCounted });
  }
  const drunk = lastCounted - volume;
  if (Math.abs(drunk) > BOTTLE_DRINK_MIN_ML) {
    return {
      state: {
        lastCalc: volume,
        lastCounted: volume,
        lastSkipped: null,
        previousDistanceMm: distanceMm,
        afterFill: false,
      },
      event: drunk > 0 ? { kind: 'drink', ml: Math.round(drunk) } : { kind: 'small' },
    };
  }
  return {
    state: {
      ...state,
      lastCalc: volume,
      lastSkipped: volume,
      previousDistanceMm: distanceMm,
    },
    event: { kind: 'small' },
  };
}

function isFlap(trigger: string): boolean {
  return trigger === 'cap_on_flap' || trigger === 'cap_on_flap_open_sip';
}

function isWeakCandidate(row: ClassifierRow, state: BottleClassifierState): boolean {
  const before = state.previousDistanceMm;
  return (
    row.kcps < WEAK_SIGNAL_KCPS &&
    before !== null &&
    Math.abs(row.distanceMm - before) > NEIGHBOUR_JUMP_MM
  );
}

function isWeak(
  row: ClassifierRow,
  next: ClassifierRow | undefined,
  state: BottleClassifierState,
): boolean {
  return (
    isWeakCandidate(row, state) &&
    next !== undefined &&
    Math.abs(row.distanceMm - next.distanceMm) > NEIGHBOUR_JUMP_MM
  );
}

function isSlosh(
  row: ClassifierRow,
  next: ClassifierRow | undefined,
  state: BottleClassifierState,
): boolean {
  return (
    state.afterFill &&
    row.trigger === 'cap' &&
    next !== undefined &&
    isFlap(next.trigger) &&
    Math.abs(row.distanceMm - next.distanceMm) > NEIGHBOUR_JUMP_MM
  );
}

function rejection(
  row: ClassifierRow,
  next: ClassifierRow | undefined,
  state: BottleClassifierState,
): BottleVerdict | null {
  if (isWeak(row, next, state)) {
    return 'weak';
  }
  return isSlosh(row, next, state) ? 'slosh' : null;
}

function clockValid(row: ClassifierRow, now: Date): boolean {
  return (
    row.at >= FIRST_VALID_SECONDS && row.at * MS_PER_SECOND <= now.getTime() + BOTTLE_CLOCK_SLACK_MS
  );
}

function skipped(
  row: ClassifierRow,
  verdict: BottleVerdict,
  volumeMl: number | null,
): ClassifiedRow {
  return { row, verdict, volumeMl, event: { kind: 'none' } };
}

export function classifyReadings(
  rows: readonly ClassifierRow[],
  curve: BottleCurve,
  start: BottleClassifierState,
  now: Date,
): Classification {
  let state = start;
  let undecided: ClassifierRow | null = null;
  const classified: ClassifiedRow[] = [];
  rows.forEach((row, index) => {
    if (!clockValid(row, now)) {
      classified.push(skipped(row, 'clock_invalid', null));
      return;
    }
    if (row.distanceMm >= curve.tofMaxMm) {
      classified.push(skipped(row, 'out_of_range', null));
      return;
    }
    const next = rows[index + 1];
    if (next === undefined && isWeakCandidate(row, state)) {
      undecided = row;
      return;
    }
    const volume = volumeOf(curve, row.distanceMm);
    const rejected = rejection(row, next, state);
    if (rejected !== null) {
      classified.push(skipped(row, rejected, Math.round(volume)));
      return;
    }
    const applied = apply(state, volume, row.distanceMm);
    state = applied.state;
    classified.push({
      row,
      verdict: 'accepted',
      volumeMl: Math.round(volume),
      event: applied.event,
    });
  });
  return { rows: classified, state, undecided };
}
