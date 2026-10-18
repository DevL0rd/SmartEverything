import {
  dialPrograms,
  isLaundryRunning,
  laundryFault,
  laundryPhase,
  laundryRunPhase,
  laundryStage,
  reportedFault,
  type JsonValue,
  type LaundryPhase,
  type LaundryValues,
} from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import type { LaundryDoor, LaundryFacts, LaundryGlow } from '../types';

export const LAUNDRY_GLOW_ROLE: Readonly<Record<LaundryGlow, ColourRole>> = {
  rest: 'on-surface-faint',
  wash: 'laundry-cool',
  rinse: 'laundry-rinse',
  spin: 'viz-violet',
  dry: 'laundry-warm',
  delay: 'viz-6',
  paused: 'warning',
  done: 'positive',
  fault: 'critical',
};

type Look = Pick<
  LaundryFacts,
  | 'motion'
  | 'glow'
  | 'display'
  | 'water'
  | 'suds'
  | 'drops'
  | 'rinse'
  | 'blur'
  | 'drain'
  | 'heat'
  | 'puffs'
  | 'tint'
>;

const BARE: Look = {
  motion: 'none',
  glow: 'rest',
  display: 'program',
  water: 0,
  suds: false,
  drops: false,
  rinse: false,
  blur: false,
  drain: false,
  heat: false,
  puffs: false,
  tint: null,
};

function look(changes: Partial<Look>): Look {
  return { ...BARE, ...changes };
}

const TUMBLING = { motion: 'tumble', glow: 'wash', display: 'time' } as const;
const DRYING = { motion: 'slow', glow: 'dry', display: 'time' } as const;

const LOOKS: Readonly<Record<LaundryPhase, Look>> = {
  off: look({ display: 'blank' }),
  idle: BARE,
  delayed: look({ glow: 'delay', display: 'clock' }),
  weighing: look({ motion: 'weigh', glow: 'wash', display: 'time' }),
  prewash: look({ ...TUMBLING, water: 0.35, suds: true }),
  wash: look({ ...TUMBLING, water: 0.35, suds: true }),
  soak: look({ glow: 'wash', display: 'time', water: 0.45, suds: true }),
  rinse: look({ ...TUMBLING, glow: 'rinse', water: 0.4, drops: true, rinse: true }),
  spin: look({ motion: 'spin', glow: 'spin', display: 'time', blur: true, drain: true }),
  dry: look({ ...DRYING, heat: true, tint: 'warm' }),
  cool: look({ ...DRYING, tint: 'cool' }),
  steam: look({ motion: 'steam', glow: 'dry', display: 'time', puffs: true, tint: 'mist' }),
  care: look({ ...DRYING, tint: 'cool' }),
  anti_crease: look({ motion: 'anti', glow: 'done', display: 'done' }),
  paused: look({ glow: 'paused', display: 'time' }),
  finished: look({ glow: 'done', display: 'done' }),
  drum_clean_done: look({ glow: 'done', display: 'clean' }),
};

const MAX_SPIN = 1400;

function numberOf(value: JsonValue | undefined): number | null {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

const HOT_DOOR = /high water temperature/i;

function doorOf(value: JsonValue | undefined): LaundryDoor {
  if (value === 'Open') {
    return 'open';
  }
  if (value === 'Closed And Can Be Opened') {
    return 'closed';
  }
  return typeof value === 'string' && HOT_DOOR.test(value) ? 'hot' : 'locked';
}

function dialOf(values: LaundryValues): number | null {
  const program = typeof values.laundry_program === 'string' ? values.laundry_program : null;
  const entries = dialPrograms(values.laundry_dial);
  const index = entries.findIndex((entry) => entry.raw === program);
  if (index < 0 || entries.length < 2) {
    return null;
  }
  return index / (entries.length - 1);
}

function lowOf(value: JsonValue | undefined): boolean {
  return value === 'Low';
}

function underlying(phase: LaundryPhase, values: LaundryValues): LaundryPhase {
  if (phase !== 'paused') {
    return phase;
  }
  const run = laundryRunPhase(values);
  return run === null || run === 'delayed' ? 'idle' : run;
}

function lookOf(phase: LaundryPhase, values: LaundryValues, fault: string | null): Look {
  const shown = underlying(phase, values);
  const base = fault !== null && !isLaundryRunning(shown) ? BARE : LOOKS[shown];
  if (fault !== null) {
    return { ...base, glow: 'fault', display: 'error' };
  }
  return phase === 'paused' ? { ...base, glow: 'paused', display: 'time' } : base;
}

function panelOf(
  values: LaundryValues,
): Pick<LaundryFacts, 'drumLight' | 'childLock' | 'lowSupply' | 'remoteOff'> {
  return {
    drumLight: values.drum_light === true,
    childLock: values.child_lock === true,
    lowSupply: lowOf(values.detergent_level) || lowOf(values.softener_level),
    remoteOff: values.remote_control === false,
  };
}

function spinOf(value: JsonValue | undefined): number | null {
  const rpm = numberOf(value);
  return rpm === null ? null : Math.min(MAX_SPIN, rpm);
}

function minutesOf(value: JsonValue | undefined): number | null {
  const minutes = numberOf(value);
  return minutes === null || minutes < 0 ? null : Math.round(minutes);
}

export function laundryFacts(values: LaundryValues): LaundryFacts | null {
  const phase = laundryPhase(values);
  if (phase === null) {
    return null;
  }
  const fault = laundryFault(values);
  const door = doorOf(values.door_state);
  const open = door === 'open' && fault === null;
  const stopped = phase === 'paused' || fault !== null;
  return {
    ...(open ? BARE : lookOf(phase, values, fault)),
    stage: laundryStage(phase, fault !== null),
    phase,
    running: !open && fault === null && isLaundryRunning(phase),
    paused: phase === 'paused',
    frozen: stopped && !open,
    remaining: minutesOf(values.remaining_minutes),
    progress: null,
    door,
    ...panelOf(values),
    faultCode: fault === null ? null : reportedFault(fault).code,
    finished: phase === 'finished' || phase === 'drum_clean_done',
    cleaned: phase === 'drum_clean_done',
    spin: spinOf(values.spin_speed),
    dial: dialOf(values),
  };
}

export function startingFacts(facts: LaundryFacts): LaundryFacts {
  return {
    ...facts,
    ...LOOKS.weighing,
    stage: laundryStage('weighing', false),
    phase: 'weighing',
    running: true,
    paused: false,
    frozen: false,
    remaining: null,
    progress: null,
    faultCode: null,
    finished: false,
    cleaned: false,
  };
}

export const LAUNDRY_UNKNOWN: LaundryFacts = {
  stage: 'rest',
  phase: 'idle',
  motion: 'none',
  glow: 'rest',
  display: 'program',
  running: false,
  paused: false,
  frozen: false,
  remaining: null,
  progress: null,
  water: 0,
  suds: false,
  drops: false,
  rinse: false,
  blur: false,
  drain: false,
  heat: false,
  puffs: false,
  tint: null,
  door: 'closed',
  drumLight: false,
  childLock: false,
  lowSupply: false,
  remoteOff: false,
  faultCode: null,
  finished: false,
  cleaned: false,
  spin: null,
  dial: null,
};
