import { playTime } from '../../../format/time';
import type { MicrowaveFacts, VisualState } from '../types';

export type MicrowaveEffect = 'wave' | 'grill' | 'fan' | 'fresh';

export interface MicrowaveDisplay {
  readonly phase: 'idle' | 'running' | 'paused' | 'finished';
  readonly lit: boolean;
  readonly open: boolean;
  readonly readout: string | null;
  readonly glyph: MicrowaveEffect | null;
  readonly effect: MicrowaveEffect | null;
  readonly progress: number | null;
  readonly power: number | null;
  readonly finishedAt: string | null;
  readonly locked: boolean;
}

const BLANK: MicrowaveDisplay = {
  phase: 'idle',
  lit: false,
  open: false,
  readout: null,
  glyph: null,
  effect: null,
  progress: null,
  power: null,
  finishedAt: null,
  locked: false,
};

const EFFECTS: Readonly<Record<string, MicrowaveEffect>> = {
  Grill: 'grill',
  MicroWaveGrill: 'grill',
  Convection: 'fan',
  MicroWaveConvection: 'fan',
  AirFryer: 'fan',
  Deodorization: 'fresh',
};

export const clockText = playTime;

export function effectOf(mode: string | null): MicrowaveEffect {
  return EFFECTS[mode ?? ''] ?? 'wave';
}

function cookingDisplay(facts: MicrowaveFacts, phase: 'running' | 'paused'): MicrowaveDisplay {
  return {
    phase,
    lit: true,
    open: facts.open,
    readout: facts.remaining === null ? null : clockText(facts.remaining),
    glyph: null,
    effect: phase === 'running' ? effectOf(facts.mode) : null,
    progress: facts.progress ?? 0,
    power: facts.power,
    finishedAt: null,
    locked: facts.locked,
  };
}

function restingDisplay(facts: MicrowaveFacts): MicrowaveDisplay {
  return {
    phase: facts.finished ? 'finished' : 'idle',
    lit: facts.open || facts.lamp,
    open: facts.open,
    readout: facts.finished ? 'Done' : null,
    glyph: facts.finished ? null : effectOf(facts.mode),
    effect: null,
    progress: null,
    power: facts.power,
    finishedAt: facts.finished ? facts.finishedAt : null,
    locked: facts.locked,
  };
}

export function microwaveDisplay(
  state: Pick<VisualState, 'online' | 'microwave'>,
): MicrowaveDisplay {
  const facts = state.microwave;
  if (!state.online || facts === undefined) {
    return BLANK;
  }
  return facts.phase === 'idle' ? restingDisplay(facts) : cookingDisplay(facts, facts.phase);
}

export function finishPlays(
  seen: string | null,
  display: Pick<MicrowaveDisplay, 'phase' | 'finishedAt'>,
  playing: boolean,
): boolean {
  return (
    playing &&
    display.phase === 'finished' &&
    display.finishedAt !== null &&
    display.finishedAt !== seen
  );
}
