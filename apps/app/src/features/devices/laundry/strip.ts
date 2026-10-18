import {
  LAUNDRY_PHASE_STEP_LABELS,
  LaundryValueError,
  plannedPhases,
  type LaundryPhase,
  type LaundryValues,
} from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';
import type { LaundryState } from './state';

interface StripStep {
  readonly phase: LaundryPhase;
  readonly label: string;
}

export interface Strip {
  readonly steps: readonly StripStep[];
  readonly current: number;
}

function plannedOf(values: LaundryValues): readonly LaundryPhase[] {
  try {
    return plannedPhases(values.laundry_phases);
  } catch (error) {
    if (error instanceof LaundryValueError) {
      return [];
    }
    throw error;
  }
}

function shown(state: LaundryState): boolean {
  if (state.running || state.key === 'paused' || state.key === 'anti_crease') {
    return true;
  }
  return state.offline || state.key === 'fault';
}

export function stripOf(values: LaundryValues, state: LaundryState): Strip | null {
  const planned = [...plannedOf(values)];
  if (!shown(state) || planned.length === 0) {
    return null;
  }
  const phase = state.underlying;
  if (phase === 'anti_crease' && !planned.includes(phase)) {
    planned.push(phase);
  } else if (phase !== 'anti_crease' && phase !== 'idle' && !planned.includes(phase)) {
    planned.splice(phase === 'steam' ? 0 : 1, 0, phase);
  }
  const current = planned.indexOf(phase);
  return current < 0
    ? null
    : {
        steps: planned.map((entry) => ({
          phase: entry,
          label: LAUNDRY_PHASE_STEP_LABELS[entry] ?? entry,
        })),
        current,
      };
}

export function stepSpoken(strip: Strip, index: number): string {
  const step = strip.steps[index];
  const place = `Step ${String(index + 1)} of ${String(strip.steps.length)}`;
  const mark = index === strip.current ? ', current' : index < strip.current ? ', done' : '';
  return `${place}, ${step?.label ?? ''}${mark}`;
}

const WEIGHT: Readonly<Partial<Record<LaundryPhase, number>>> = {
  weighing: 1,
  prewash: 6,
  soak: 10,
  wash: 12,
  rinse: 7,
  spin: 5,
  dry: 20,
  cool: 4,
  steam: 4,
  care: 3,
};

export interface UpNext {
  readonly label: string;
  readonly atMs: number;
}

export function upNextOf(strip: Strip, remaining: number | null, nowMs: number): UpNext | null {
  const next = strip.steps[strip.current + 1];
  if (next === undefined || remaining === null || remaining <= 0) {
    return null;
  }
  const ahead = strip.steps.slice(strip.current);
  const weights = ahead.map((step) => WEIGHT[step.phase] ?? 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const current = weights[0] ?? 0;
  if (total <= 0) {
    return null;
  }
  const wait = (remaining * (current / 2)) / (total - current / 2);
  return { label: next.label, atMs: nowMs + Math.round(wait * MINUTE_MS) };
}
