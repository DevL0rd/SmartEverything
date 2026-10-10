import type { CallEnding, CallState } from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';
import type { OrbState } from './orb';

export type CallPhase = 'idle' | CallState | 'ended';

const TOOL_LINES_KEPT = 4;

export type CallFix = 'microphone';

export interface CallView {
  readonly phase: CallPhase;
  readonly callId: string | null;
  readonly chatId: string | null;
  readonly fix: CallFix | null;
  readonly startedAt: number | null;
  readonly muted: boolean;
  readonly heard: string;
  readonly said: string;
  readonly tools: readonly string[];
  readonly ending: CallEnding | null;
  readonly problem: string | null;
}

export const IDLE_CALL: CallView = {
  phase: 'idle',
  callId: null,
  chatId: null,
  fix: null,
  startedAt: null,
  muted: false,
  heard: '',
  said: '',
  tools: [],
  ending: null,
  problem: null,
};

export const callState = new ValueStore<CallView>(IDLE_CALL);

export function changeCall(change: (call: CallView) => Partial<CallView>): void {
  callState.update((call) => ({ ...call, ...change(call) }));
}

export function addToolLine(line: string): void {
  changeCall((call) => ({ tools: [...call.tools, line].slice(-TOOL_LINES_KEPT) }));
}

export interface CallEnd {
  readonly ending: CallEnding;
  readonly problem: string | null;
  readonly fix?: CallFix;
}

export function markEnded(end: CallEnd): void {
  if (callActive(callState.get())) {
    changeCall(() => ({
      phase: 'ended',
      ending: end.ending,
      problem: end.problem,
      fix: end.fix ?? null,
    }));
  }
}

export function callActive(call: CallView): boolean {
  return call.phase !== 'idle' && call.phase !== 'ended';
}

export function useCall(): CallView {
  return useValue(callState);
}

export function orbStateOf(call: CallView): OrbState {
  if (call.phase === 'listening' || call.phase === 'thinking' || call.phase === 'speaking') {
    return call.phase;
  }
  return call.phase === 'connecting' ? 'thinking' : 'idle';
}
