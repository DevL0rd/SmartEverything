import type {
  TalkFloor,
  TalkMessageKind,
  TalkServerMessage,
  TalkSpeaker,
} from '@smarteverything/domain';

export interface PacketSink {
  readonly packet: (packet: Uint8Array) => void;
  readonly end: () => void;
}

export interface TalkEndpoint {
  readonly id: string;
  readonly clientId: string;
  readonly send: (message: TalkServerMessage) => void;
  readonly audio: (frame: Uint8Array) => void;
}

export interface Transmission {
  readonly messageId: string;
  readonly channelId: string;
  readonly kind: TalkMessageKind;
  readonly speaker: TalkSpeaker;
  readonly startedAt: Date;
  readonly owner: TalkEndpoint;
  readonly sinks: PacketSink[];
  readonly stopSource: () => void;
}

export function floorOf(transmission: Transmission): TalkFloor {
  return {
    channelId: transmission.channelId,
    messageId: transmission.messageId,
    kind: transmission.kind,
    speaker: transmission.speaker,
    startedAt: transmission.startedAt.toISOString(),
  };
}
