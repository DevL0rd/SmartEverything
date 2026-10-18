import { formatLaundryMinutes } from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';
import type { Cycle } from './cycles';
import type { Reported } from './draft';
import type { LaundryState } from './state';

export interface StageTexts {
  readonly figure: string;
  readonly unit: string | null;
  readonly callout: string | null;
  readonly caption: string | null;
  readonly spoken: string;
}

export interface StageInput {
  readonly state: LaundryState;
  readonly shown: Reported;
  readonly estimate: number | null;
  readonly last: Cycle | null;
  readonly starting?: boolean;
  readonly now?: number;
}

const IDLE_LIKE = new Set(['idle', 'open', 'off']);

function settings(state: LaundryState, shown: Reported): string | null {
  const parts = [
    state.program,
    shown.temperature === null ? null : temperatureWord(shown.temperature),
    shown.spin === null || shown.spin === 0 ? null : `${String(shown.spin)} rpm`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

export function temperatureWord(degrees: number): string {
  return degrees === 0 ? 'Cold' : `${String(degrees)}°`;
}

function tookText(last: Cycle | null): string | null {
  const minutes = last?.minutes ?? null;
  if (last === null || minutes === null) {
    return null;
  }
  const parts = [
    `Took ${formatLaundryMinutes(minutes)}`,
    last.energy === null ? null : `${String(last.energy)} kWh`,
    last.water === null ? null : `${String(last.water)} L`,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

function timedFigure(state: LaundryState): { figure: string; unit: string } | null {
  return state.remaining === null || state.offline
    ? null
    : { figure: formatLaundryMinutes(state.remaining), unit: 'left' };
}

const DONE_KEYS: ReadonlySet<LaundryState['key']> = new Set(['finished', 'anti_crease']);

function restFigure(state: LaundryState): string {
  if (state.key === 'idle') {
    return 'Ready';
  }
  return DONE_KEYS.has(state.key) ? 'Done' : state.word;
}

function finishedText(state: LaundryState, now: number | undefined): string {
  if (now === undefined || state.finishedMs === null) {
    return `Done at ${state.finishedAt ?? ''}`;
  }
  const minutes = Math.floor((now - state.finishedMs) / MINUTE_MS);
  return minutes < 1 ? 'Done just now' : `Done ${formatLaundryMinutes(minutes)} ago`;
}

function calloutOf(input: StageInput, timed: boolean): string | null {
  const { state, estimate } = input;
  if (state.offline) {
    return `Was ${state.word.toLowerCase()}`;
  }
  if (timed && state.doneAt !== null) {
    return `Done at ${state.doneAt}`;
  }
  if (state.key === 'finished' && state.finishedAt !== null) {
    return finishedText(state, input.now);
  }
  if (state.key === 'delayed' && state.doneAt !== null) {
    return `Finishes at ${state.doneAt}`;
  }
  return IDLE_LIKE.has(state.key) && estimate !== null
    ? `Takes about ${formatLaundryMinutes(estimate)}`
    : null;
}

function captionOf(input: StageInput, timed: boolean): string | null {
  const { state, shown, last } = input;
  if (state.offline) {
    return null;
  }
  if (timed || IDLE_LIKE.has(state.key) || state.key === 'delayed') {
    return settings(state, shown);
  }
  if (state.key === 'finished') {
    return tookText(last);
  }
  return state.key === 'anti_crease' ? 'Tumbling to prevent creases' : null;
}

function startingTexts(input: StageInput): StageTexts {
  return {
    figure: 'Starting…',
    unit: null,
    callout: null,
    caption: settings(input.state, input.shown),
    spoken: 'Starting',
  };
}

function runningTexts(input: StageInput): StageTexts {
  const { state } = input;
  const timed = (state.running || state.key === 'paused') && !state.offline;
  const figure = timed ? timedFigure(state) : null;
  return {
    figure: state.offline ? 'Offline' : (figure?.figure ?? restFigure(state)),
    unit: figure?.unit ?? null,
    callout: calloutOf(input, timed),
    caption: captionOf(input, timed),
    spoken: state.offline ? 'Offline' : state.word,
  };
}

export function stageTexts(input: StageInput): StageTexts {
  return input.starting === true && !input.state.offline
    ? startingTexts(input)
    : runningTexts(input);
}
