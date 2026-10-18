import type { Transport } from './peer-types';
import type { SessionPhase } from './player-state';

export interface TalkWish {
  readonly wantedFor: string | null;
  readonly deviceId: string;
  readonly twoWayAudio: boolean;
  readonly transport: Transport;
  readonly phase: SessionPhase;
}

export interface TalkIntent {
  readonly talk: boolean;
  readonly active: boolean;
  readonly over: boolean;
}

export function talkIntentOf(wish: TalkWish): TalkIntent {
  const talk = wish.twoWayAudio && wish.wantedFor === wish.deviceId && wish.transport === 'webrtc';
  return {
    talk,
    active: talk && wish.phase.kind === 'connected',
    over: wish.phase.kind === 'failed' || wish.phase.kind === 'idle',
  };
}
