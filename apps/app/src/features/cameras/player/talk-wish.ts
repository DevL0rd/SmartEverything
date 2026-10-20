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
  const carriesTalk = wish.transport === 'webrtc';
  const talk = wish.twoWayAudio && wish.wantedFor === wish.deviceId && carriesTalk;
  return {
    talk,
    active: talk && wish.phase.kind === 'connected',
    over: wish.phase.kind === 'failed' || wish.phase.kind === 'idle',
  };
}

export interface TalkOffer {
  readonly twoWayAudio: boolean;
  readonly relay: boolean;
  readonly live: boolean;
  readonly talking: boolean;
  readonly talkPending: boolean;
}

export function talkOffered(offer: TalkOffer): boolean {
  const carriesTalk = !offer.relay;
  return offer.twoWayAudio && carriesTalk && (offer.live || offer.talking || offer.talkPending);
}
