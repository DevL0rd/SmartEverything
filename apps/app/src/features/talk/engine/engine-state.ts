import { IDLE_TALK_SESSION, IDLE_TRANSMIT, type TalkSession } from '@smarteverything/domain';
import { ValueStore, useSelected, useValue } from '../../../design/external-store';

export { IDLE_TRANSMIT };

export type TalkLink = 'off' | 'connecting' | 'ready' | 'offline' | 'unsupported';

export interface TalkEngineState extends TalkSession {
  readonly link: TalkLink;
  readonly problem: string | null;
  readonly level: number;
}

export function sessionOf(state: TalkEngineState): TalkSession {
  return {
    transmit: state.transmit,
    receive: state.receive,
    live: state.live,
    lastDenial: state.lastDenial,
    lastEnding: state.lastEnding,
  };
}

export const engineState = new ValueStore<TalkEngineState>({
  ...IDLE_TALK_SESSION,
  link: 'off',
  problem: null,
  level: 0,
});

export function useTalkEngine(): TalkEngineState {
  return useValue(engineState);
}

export function useTalkEngineValue<T extends string | number | boolean | null>(
  select: (state: TalkEngineState) => T,
): T {
  return useSelected(engineState, select);
}

export interface TalkConnection {
  readonly url: string;
  readonly token: string;
}

export interface TalkEngine {
  readonly supported: () => string | null;
  readonly start: (connection: TalkConnection) => void;
  readonly stop: () => void;
  readonly press: (channelId: string) => void;
  readonly listen: (channelId: string, cameraId: string) => void;
  readonly release: () => void;
  readonly leaveLive: () => void;
}
