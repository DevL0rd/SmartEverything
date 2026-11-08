import { ORALB_MODES, type BrushActivity, type OralbMode } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import type { ToothbrushFacts, VisualTone } from '../types';

export const QUARTERS = 4;
const LOW_BATTERY = 20;
const WARN_BATTERY = 40;

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
