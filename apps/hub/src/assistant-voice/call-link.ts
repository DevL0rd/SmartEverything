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

export interface VoiceEndpoint {
  readonly id: string;
  readonly clientId: string;
  readonly send: (message: AssistantVoiceServerMessage) => void;
  readonly audio: (frame: Uint8Array) => void;
}

export const PLAYOUT_SLACK_MS = { app: 250, hosted: 2500 } as const;

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
): CallLink {
  const { callId, chatId } = target;
  let playingUntil = 0;
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
    state: (state): void => {
      endpoint.send({ type: 'call_state', callId, state, chatId });
    },
    caption: (who, text): void => {
      endpoint.send({ type: 'caption', callId, who, text: text.slice(0, 2000) });
    },
  };
}
