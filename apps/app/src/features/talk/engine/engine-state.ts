import type { TalkDenial, TalkEnding, TalkSpeaker } from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';

export type TalkLink = 'off' | 'connecting' | 'ready' | 'offline' | 'unsupported';

export type TransmitStatus = 'idle' | 'requesting' | 'talking';

export interface Transmit {
  readonly status: TransmitStatus;
  readonly channelId: string | null;
  readonly messageId: string | null;
  readonly cameraId: string | null;
  readonly startedAt: number | null;
  readonly limitSeconds: number | null;
}

export interface Receive {
  readonly channelId: string;
  readonly messageId: string;
  readonly speaker: TalkSpeaker;
  readonly startedAt: number;
}

export interface LiveTalk {
  readonly channelId: string;
  readonly conversationId: string;
  readonly label: string;
}

export interface TalkEngineState {
  readonly link: TalkLink;
  readonly problem: string | null;
  readonly transmit: Transmit;
  readonly receive: Receive | null;
  readonly live: LiveTalk | null;
  readonly level: number;
  readonly lastDenial: { readonly channelId: string; readonly reason: TalkDenial } | null;
  readonly lastEnding: TalkEnding | null;
}

export const IDLE_TRANSMIT: Transmit = {
  status: 'idle',
  channelId: null,
  messageId: null,
  cameraId: null,
  startedAt: null,
  limitSeconds: null,
};

export const engineState = new ValueStore<TalkEngineState>({
  link: 'off',
  problem: null,
  transmit: IDLE_TRANSMIT,
  receive: null,
  live: null,
  level: 0,
  lastDenial: null,
  lastEnding: null,
});

export function useTalkEngine(): TalkEngineState {
  return useValue(engineState);
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
