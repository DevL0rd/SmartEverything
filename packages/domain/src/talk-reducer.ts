import type { TalkClientMessage, TalkDenial, TalkEnding, TalkServerMessage } from './talk-protocol';
import type { TalkSpeaker } from './talk';

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

export interface TalkSession {
  readonly transmit: Transmit;
  readonly receive: Receive | null;
  readonly live: LiveTalk | null;
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

export const IDLE_TALK_SESSION: TalkSession = {
  transmit: IDLE_TRANSMIT,
  receive: null,
  live: null,
  lastDenial: null,
  lastEnding: null,
};

export type TalkTone = 'permit' | 'busy' | 'end' | 'roger';

export type TalkEffect =
  | { readonly kind: 'send'; readonly message: TalkClientMessage }
  | { readonly kind: 'tone'; readonly tone: TalkTone }
  | { readonly kind: 'playback_begin' }
  | { readonly kind: 'playback_end' }
  | { readonly kind: 'open_capture'; readonly purpose: 'press' }
  | { readonly kind: 'open_capture'; readonly purpose: 'live'; readonly conversationId: string }
  | { readonly kind: 'stop_capture' }
  | { readonly kind: 'flush_early_audio' };

export interface TalkStep {
  readonly session: TalkSession;
  readonly effects: readonly TalkEffect[];
}

export type TalkInput =
  | { readonly kind: 'message'; readonly message: TalkServerMessage }
  | { readonly kind: 'press'; readonly channelId: string }
  | { readonly kind: 'listen'; readonly channelId: string; readonly cameraId: string }
  | { readonly kind: 'release' }
  | { readonly kind: 'leave_live' };

const RELEASE: TalkEffect = { kind: 'send', message: { type: 'release' } };

function unchanged(session: TalkSession): TalkStep {
  return { session, effects: [] };
}

function closeLive(session: TalkSession): TalkStep {
  const idle = session.transmit.status === 'idle';
  return {
    session: { ...session, live: null },
    effects: [...(idle ? [{ kind: 'stop_capture' } as const] : []), { kind: 'playback_end' }],
  };
}

function granted(session: TalkSession, message: Message<'granted'>, now: number): TalkStep {
  const { transmit } = session;
  if (transmit.status !== 'requesting' || transmit.channelId !== message.channelId) {
    return { session, effects: [RELEASE] };
  }
  return {
    session: {
      ...session,
      transmit: {
        ...transmit,
        status: 'talking',
        messageId: message.messageId,
        startedAt: now,
        limitSeconds: message.limitSeconds,
      },
    },
    effects: [{ kind: 'tone', tone: 'permit' }, { kind: 'flush_early_audio' }],
  };
}

function liveStarted(session: TalkSession, message: Message<'live_start'>): TalkStep {
  const live = {
    channelId: message.channelId,
    conversationId: message.conversationId,
    label: message.label,
  };
  const capture: readonly TalkEffect[] =
    session.transmit.status === 'idle'
      ? [{ kind: 'open_capture', purpose: 'live', conversationId: message.conversationId }]
      : [];
  return { session: { ...session, live }, effects: [{ kind: 'playback_begin' }, ...capture] };
}

function ended(session: TalkSession, message: Message<'ended'>): TalkStep {
  if (session.transmit.messageId !== message.messageId) {
    return unchanged(session);
  }
  return {
    session: { ...session, transmit: IDLE_TRANSMIT, lastEnding: message.reason },
    effects: [{ kind: 'stop_capture' }, { kind: 'tone', tone: 'end' }],
  };
}

type Message<T extends TalkServerMessage['type']> = Extract<
  TalkServerMessage,
  { readonly type: T }
>;

type Handlers = {
  readonly [T in TalkServerMessage['type']]: (
    session: TalkSession,
    message: Message<T>,
    now: number,
  ) => TalkStep;
};

function denied(session: TalkSession, message: Message<'denied'>): TalkStep {
  return {
    session: {
      ...session,
      transmit: IDLE_TRANSMIT,
      lastDenial: { channelId: message.channelId, reason: message.reason },
    },
    effects: [{ kind: 'stop_capture' }, { kind: 'tone', tone: 'busy' }],
  };
}

function receiving(session: TalkSession, message: Message<'rx_start'>, now: number): TalkStep {
  return {
    session: {
      ...session,
      receive: {
        channelId: message.channelId,
        messageId: message.messageId,
        speaker: message.speaker,
        startedAt: now,
      },
    },
    effects: [{ kind: 'playback_begin' }],
  };
}

function received(session: TalkSession, message: Message<'rx_end'>): TalkStep {
  if (session.receive?.messageId !== message.messageId) {
    return unchanged(session);
  }
  return {
    session: { ...session, receive: null },
    effects: [{ kind: 'playback_end' }, { kind: 'tone', tone: 'roger' }],
  };
}

function liveEnded(session: TalkSession, message: Message<'live_end'>): TalkStep {
  return session.live?.conversationId === message.conversationId
    ? closeLive(session)
    : unchanged(session);
}

const HANDLERS: Handlers = {
  ready: unchanged,
  channels: unchanged,
  granted,
  denied,
  ended,
  rx_start: receiving,
  rx_end: received,
  live_start: liveStarted,
  live_end: liveEnded,
};

function reduceMessage<T extends TalkServerMessage['type']>(
  session: TalkSession,
  message: Message<T>,
  now: number,
): TalkStep {
  const handler: Handlers[T] = HANDLERS[message.type];
  return handler(session, message, now);
}

export function reduceTalk(session: TalkSession, input: TalkInput, now: number): TalkStep {
  switch (input.kind) {
    case 'message':
      return reduceMessage(session, input.message, now);
    case 'press':
      return {
        session: {
          ...session,
          transmit: { ...IDLE_TRANSMIT, status: 'requesting', channelId: input.channelId },
        },
        effects: [
          { kind: 'send', message: { type: 'press', channelId: input.channelId } },
          { kind: 'open_capture', purpose: 'press' },
        ],
      };
    case 'listen':
      return {
        session: {
          ...session,
          transmit: {
            ...IDLE_TRANSMIT,
            status: 'requesting',
            channelId: input.channelId,
            cameraId: input.cameraId,
          },
        },
        effects: [
          {
            kind: 'send',
            message: { type: 'listen', channelId: input.channelId, cameraId: input.cameraId },
          },
        ],
      };
    case 'release':
      return session.transmit.status === 'idle'
        ? unchanged(session)
        : {
            session: { ...session, transmit: IDLE_TRANSMIT },
            effects: [RELEASE, { kind: 'stop_capture' }],
          };
    case 'leave_live': {
      if (session.live === null) {
        return unchanged(session);
      }
      const closed = closeLive(session);
      return { session: closed.session, effects: [RELEASE, ...closed.effects] };
    }
  }
}
