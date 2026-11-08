import type { VisualState } from '../types';
import type { SignalEntry } from './signals-of-units';

type IrFacts = NonNullable<VisualState['ir']>;
type IrCategory = IrFacts['category'];

type LitSignal = 'screenOn' | 'playing' | 'lamp';

const LIT_SIGNAL: Readonly<Partial<Record<IrCategory, LitSignal>>> = {
  tv: 'screenOn',
  projector: 'screenOn',
  speaker: 'playing',
  light: 'lamp',
};

function litEntries(facts: IrFacts, state: VisualState): readonly SignalEntry[] {
  const signal = LIT_SIGNAL[facts.category];
  return signal === undefined ? [] : [[signal, facts.on === true && state.online]];
}

function remoteFacts(facts: IrFacts, state: VisualState): readonly SignalEntry[] {
  return [
    ['power', facts.on ?? undefined],
    ['mode', facts.category],
    ['fault', facts.failed],
    ...litEntries(facts, state),
  ];
}

export function irRemoteEntries(state: VisualState): readonly SignalEntry[] {
  return state.ir === undefined ? [] : remoteFacts(state.ir, state);
}

export function irBlasterEntries(state: VisualState): readonly SignalEntry[] {
  return state.ir === undefined ? [] : [['fault', state.ir.failed]];
}
