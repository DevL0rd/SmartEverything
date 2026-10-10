import {
  TALK_FRAME_MS,
  audioFrameOf,
  type AssistantVoiceServerMessage,
  type CallState,
} from '@smarteverything/domain';

export type Speaker = 'person' | 'assistant' | 'tool';

export interface CallLink {
  readonly audio: (frames: readonly Buffer[]) => void;
  readonly cut: () => void;
  readonly playing: () => boolean;
  readonly state: (state: CallState) => void;
  readonly caption: (who: Speaker, text: string) => void;
}

export interface SocketLink extends CallLink {
  readonly restate: () => void;
}

export interface VoiceEndpoint {
  readonly id: string;
  readonly clientId: string;
  readonly send: (message: AssistantVoiceServerMessage) => void;
  readonly audio: (frame: Uint8Array) => void;
}

export const PLAYOUT_SLACK_MS = { app: 250, hosted: 2500, open: 0 } as const;

export type CallEndpoint = Pick<VoiceEndpoint, 'id' | 'send' | 'audio'>;

export interface CallLinkTarget {
  readonly callId: string;
  readonly chatId: string;
}

export function socketCallLink(
  endpoint: CallEndpoint,
  target: CallLinkTarget,
  now: () => number,
  slackMs: number = PLAYOUT_SLACK_MS.app,
): SocketLink {
  const { callId, chatId } = target;
  let playingUntil = 0;
  let current: CallState | null = null;
  const tell = (state: CallState): void => {
    current = state;
    endpoint.send({ type: 'call_state', callId, state, chatId });
  };
  return {
    audio: (frames): void => {
      frames.forEach((frame) => {
        endpoint.audio(audioFrameOf(frame));
      });
      playingUntil = Math.max(now(), playingUntil) + frames.length * TALK_FRAME_MS;
    },
    cut: (): void => {
      if (playingUntil > now()) {
        endpoint.send({ type: 'interrupted', callId });
      }
      playingUntil = 0;
    },
    playing: () => now() < playingUntil + slackMs,
    state: tell,
    restate: (): void => {
      if (current !== null) {
        tell(current);
      }
    },
    caption: (who, text): void => {
      endpoint.send({ type: 'caption', callId, who, text: text.slice(0, 2000) });
    },
  };
}
