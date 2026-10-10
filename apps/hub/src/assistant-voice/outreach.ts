import type { VideoFrame } from './video';
import type { CallEnding } from '@smarteverything/domain';
import type { CallEndpoint } from './call-link';
import type { HostedCaller } from './persona';

export type OutreachAnswer =
  | { readonly kind: 'answer'; readonly opening: string }
  | { readonly kind: 'refused'; readonly reason: string };

export interface OutreachAnswering {
  readonly outreachId: string;
  readonly callId: string;
  readonly clientId: string;
  readonly chatId: string;
}

export interface OutreachDesk {
  readonly answered: (answering: OutreachAnswering) => OutreachAnswer;
  readonly ended: (outreachId: string, reason: CallEnding, summary: string | null) => void;
}

export interface Opening {
  readonly chatId: string;
  readonly text: string;
  readonly outreachId: string;
}

export interface HostedSpeaking {
  readonly hiddenTools: ReadonlySet<string>;
}

export interface HostedCallRequest {
  readonly callId: string;
  readonly endpoint: CallEndpoint;
  readonly caller: HostedCaller;
  readonly opening: Opening;
  readonly speaking: HostedSpeaking;
  readonly heard?: () => Int16Array;
}

export interface HostedCall {
  readonly hear: (pcm16k: Int16Array) => void;
  readonly see: (frame: VideoFrame) => void;
  readonly end: (reason: CallEnding) => Promise<void>;
}
