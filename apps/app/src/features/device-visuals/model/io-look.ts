import {
  ORALB_MODES,
  ORALB_RING_COLOURS,
  ORALB_RING_NAMES,
  oralbRingDisplayOf,
  type BrushActivity,
  type OralbMode,
} from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import type { ToothbrushFacts, VisualTone } from '../types';

export const IO_WIDTH = 40;
export const IO_HEIGHT = 240;
export const SWING_DEGREES = 9;
export const QUARTERS = 4;
export const LOW_BATTERY = 20;
export const WARN_BATTERY = 40;
export const HEAD_WARN_LEFT = 0.15;

export type IoState =
  'asleep' | 'standby' | 'brushing' | 'paused' | 'summary' | 'charging' | 'unreachable' | 'busy';

const ACTIVITY_STATE: Readonly<Record<BrushActivity, IoState>> = {
  asleep: 'asleep',
  off: 'asleep',
  charging: 'charging',
  brushing: 'brushing',
  paused: 'paused',
  standby: 'standby',
};

export function ioStateOf(facts: ToothbrushFacts, tone: VisualTone): IoState {
  if (facts.link === 'busy') {
    return 'busy';
  }
  if (tone === 'offline' || facts.link === 'bluetooth_off') {
    return 'unreachable';
  }
  const state = ACTIVITY_STATE[facts.activity];
  return state === 'standby' && facts.face !== null ? 'summary' : state;
}

export type PressureLevel = 'light' | 'good' | 'hard';

export type IoRing =
  | { readonly kind: 'unlit' }
  | { readonly kind: 'unread' }
  | { readonly kind: 'configured'; readonly hex: string }
  | { readonly kind: 'pressure'; readonly level: PressureLevel };

const UNLIT_STATES: ReadonlySet<IoState> = new Set(['asleep', 'unreachable', 'busy']);

export function pressureLevelOf(pressure: ToothbrushFacts['pressure']): PressureLevel {
  if (pressure === 'too_high') {
    return 'hard';
  }
  return pressure === 'optimal' ? 'good' : 'light';
}

export function ringOf(facts: ToothbrushFacts, state: IoState): IoRing {
  if (UNLIT_STATES.has(state)) {
    return { kind: 'unlit' };
  }
  if (state === 'brushing') {
    return { kind: 'pressure', level: pressureLevelOf(facts.pressure) };
  }
  return facts.ring === null ? { kind: 'unread' } : { kind: 'configured', hex: facts.ring };
}

export const PRESSURE_RING_ROLE: Readonly<Record<PressureLevel, ColourRole>> = {
  light: 'on-surface-variant',
  good: 'positive',
  hard: 'critical',
};

const PRESSURE_COLOUR_WORD: Readonly<Record<PressureLevel, string>> = {
  light: 'grey: light pressure',
  good: 'green: good pressure',
  hard: 'red: too hard',
};

export function ringNameOf(hex: string): string {
  const found = ORALB_RING_NAMES.find(
    (name) =>
      `#${oralbRingDisplayOf(ORALB_RING_COLOURS[name])
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}` === hex.toLowerCase(),
  );
  return found ?? 'custom';
}

export interface IoPips {
  readonly current: number;
}

export type IoDisplay =
  | { readonly kind: 'none' }
  | { readonly kind: 'dark' }
  | {
      readonly kind: 'timer';
      readonly text: string;
      readonly pips: IoPips | null;
      readonly battery: number | null;
    }
  | { readonly kind: 'summary'; readonly face: number; readonly text: string }
  | { readonly kind: 'charging'; readonly percent: number | null }
  | { readonly kind: 'standby'; readonly initials: string | null; readonly battery: number | null };

const MODE_INITIALS: Readonly<Record<OralbMode, string>> = {
  daily_clean: 'DC',
  sensitive: 'SE',
  gum_care: 'GC',
  whiten: 'WH',
  intense: 'IN',
  super_sensitive: 'SS',
  tongue_clean: 'TC',
  smart_adapt: 'SA',
  gentle_white: 'GW',
};

export function oralbModeOf(facts: ToothbrushFacts): OralbMode | null {
  return ORALB_MODES.find((mode) => mode === facts.mode) ?? null;
}

export function timerText(elapsedS: number | null): string {
  if (elapsedS === null) {
    return '-:--';
  }
  const whole = Math.floor(elapsedS);
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

export function pipsOf(facts: ToothbrushFacts): IoPips | null {
  if (facts.sector === null || facts.sector > QUARTERS || facts.mode === 'tongue_clean') {
    return null;
  }
  return { current: facts.sector - 1 };
}

function standbyDisplay(facts: ToothbrushFacts): IoDisplay {
  const mode = oralbModeOf(facts);
  return {
    kind: 'standby',
    initials: mode === null ? null : MODE_INITIALS[mode],
    battery: facts.battery,
  };
}

const DISPLAYS: Readonly<Record<IoState, (facts: ToothbrushFacts) => IoDisplay>> = {
  asleep: () => ({ kind: 'dark' }),
  unreachable: () => ({ kind: 'dark' }),
  busy: () => ({ kind: 'dark' }),
  brushing: (facts) => timerDisplay(facts),
  paused: (facts) => timerDisplay(facts),
  summary: (facts) => ({ kind: 'summary', face: facts.face ?? 0, text: timerText(facts.elapsedS) }),
  charging: (facts) => ({ kind: 'charging', percent: facts.battery }),
  standby: standbyDisplay,
};

function timerDisplay(facts: ToothbrushFacts): IoDisplay {
  return {
    kind: 'timer',
    text: timerText(facts.elapsedS),
    pips: pipsOf(facts),
    battery: facts.battery,
  };
}

export function displayOf(facts: ToothbrushFacts, state: IoState): IoDisplay {
  return facts.display ? DISPLAYS[state](facts) : { kind: 'none' };
}

export function batteryRole(percent: number): ColourRole {
  if (percent < LOW_BATTERY) {
    return 'critical';
  }
  return percent < WARN_BATTERY ? 'warning' : 'positive';
}

export function faceStars(level: number): number {
  if (level <= 1) {
    return 0;
  }
  if (level <= 4) {
    return 1;
  }
  return level <= 8 ? 2 : 3;
}

export type HeadRim = ColourRole | null;

export function headRimOf(facts: ToothbrushFacts): HeadRim {
  if (facts.head !== 'fitted' || facts.daysLeftRatio === null) {
    return null;
  }
  if (facts.daysLeftRatio <= 0) {
    return 'critical';
  }
  return facts.daysLeftRatio <= HEAD_WARN_LEFT ? 'warning' : 'positive';
}

export interface Drive {
  readonly steps: readonly number[];
  readonly stepMs: number;
  readonly restMs: number;
}

const PULSE_REST_MS = 200;
const STEADY: readonly number[] = [-SWING_DEGREES, SWING_DEGREES];
const PULSED: readonly number[] = [...STEADY, ...STEADY, ...STEADY];
const ALTERNATING: readonly number[] = [-SWING_DEGREES, SWING_DEGREES, -4, 4];

const STEP_MS: Readonly<Record<OralbMode, number>> = {
  daily_clean: 140,
  sensitive: 180,
  gum_care: 160,
  whiten: 130,
  intense: 110,
  super_sensitive: 220,
  tongue_clean: 160,
  smart_adapt: 150,
  gentle_white: 150,
};

export function driveOf(facts: ToothbrushFacts): Drive {
  const mode = oralbModeOf(facts) ?? 'daily_clean';
  const stepMs = STEP_MS[mode];
  if (mode === 'gum_care') {
    return { steps: PULSED, stepMs, restMs: PULSE_REST_MS };
  }
  return { steps: mode === 'whiten' ? ALTERNATING : STEADY, stepMs, restMs: 0 };
}

export function driveKey(drive: Drive): string {
  return `${drive.steps.join(',')}|${String(drive.stepMs)}|${String(drive.restMs)}`;
}

export interface Stop {
  readonly at: number;
  readonly degrees: number;
}

export function driveStops(drive: Drive): readonly Stop[] {
  const total = drive.steps.length * drive.stepMs + drive.restMs;
  const percent = (ms: number): number => Math.round((ms / total) * 10_000) / 100;
  const swings = drive.steps.map((degrees, index) => ({
    at: percent(index * drive.stepMs),
    degrees,
  }));
  const first = drive.steps[0] ?? 0;
  const end = drive.restMs === 0 ? first : 0;
  const rest =
    drive.restMs === 0 ? [] : [{ at: percent(drive.steps.length * drive.stepMs), degrees: 0 }];
  return [...swings, ...rest, { at: 100, degrees: end }];
}

export function driveDuration(drive: Drive): number {
  return drive.steps.length * drive.stepMs + drive.restMs;
}

export type IoMove = 'wake' | 'press';

const DORMANT: ReadonlySet<BrushActivity> = new Set(['asleep', 'off', 'charging']);

export function moveOf(previous: BrushActivity, next: BrushActivity): IoMove | null {
  if (previous === next) {
    return null;
  }
  if (DORMANT.has(previous) && !DORMANT.has(next)) {
    return 'wake';
  }
  const worked: ReadonlySet<BrushActivity> = new Set(['brushing', 'paused']);
  return worked.has(previous) || worked.has(next) ? 'press' : null;
}

export interface HandleMaterial {
  readonly shine: string;
  readonly body: string;
  readonly edge: string;
}

export const HANDLE_MATERIAL: Readonly<
  Record<NonNullable<ToothbrushFacts['handle']>, HandleMaterial>
> = {
  black: { shine: '#3B3E48', body: '#1C1D22', edge: '#0E0F12' },
  white: { shine: '#FFFFFF', body: '#E4E7EE', edge: '#B5BAC8' },
  rose: { shine: '#F9DFE5', body: '#E6A9B6', edge: '#B97889' },
  aqua: { shine: '#D3F1F6', body: '#8FCDD8', edge: '#5A98A6' },
  lavender: { shine: '#E6DCF8', body: '#B5A1E0', edge: '#8470B3' },
};

export function materialOf(facts: ToothbrushFacts): HandleMaterial {
  return HANDLE_MATERIAL[facts.handle ?? 'black'];
}

const STATE_WORD: Readonly<Record<IoState, string>> = {
  asleep: 'asleep',
  standby: 'awake',
  brushing: 'brushing',
  paused: 'paused',
  summary: 'showing the result',
  charging: 'charging',
  unreachable: 'unreachable',
  busy: 'busy',
};

function ringWords(ring: IoRing): string | null {
  switch (ring.kind) {
    case 'unlit':
      return null;
    case 'unread':
      return 'ring colour not read yet';
    case 'configured':
      return `ring ${ringNameOf(ring.hex)}`;
    case 'pressure':
      return `ring ${PRESSURE_COLOUR_WORD[ring.level]}`;
  }
}

function displayWords(display: IoDisplay): string | null {
  if (display.kind !== 'timer') {
    return null;
  }
  const quarter =
    display.pips === null
      ? ''
      : `, quarter ${String(display.pips.current + 1)} of ${String(QUARTERS)}`;
  return `${display.text}${quarter}`;
}

export function ioLabel(facts: ToothbrushFacts, tone: VisualTone): string {
  const state = ioStateOf(facts, tone);
  const display = displayOf(facts, state);
  const working = state === 'brushing' || state === 'paused';
  const battery =
    working || facts.battery === null ? null : `battery ${String(facts.battery)} percent`;
  return [
    'Oral-B iO',
    STATE_WORD[state],
    ringWords(ringOf(facts, state)),
    displayWords(display),
    battery,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
}
