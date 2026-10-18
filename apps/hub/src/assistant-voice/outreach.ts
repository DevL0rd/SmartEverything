import type { VideoFrame } from './video';
import type { CallEnding, PluginOrigin } from '@smarteverything/domain';
import type { CallEndpoint } from './call-link';
import type { HostedCaller } from './persona';

export type OutreachAnswer =
  | { readonly kind: 'answer'; readonly opening: string; readonly origin: PluginOrigin | null }
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
  readonly outreachId: string | null;
}

export interface ReachOpening extends Opening {
  readonly outreachId: string;
}

export interface HostedSpeaking {
  readonly hiddenTools: ReadonlySet<string>;
  readonly ending?: string;
}

export interface HostedListening {
  readonly echoFree?: boolean;
  readonly playoutSlackMs?: number;
  readonly idleSeconds?: number;
  readonly pauseMs?: number;
}

export interface HostedCallRequest {
  readonly callId: string;
  readonly endpoint: CallEndpoint;
  readonly caller: HostedCaller;
  readonly opening: Opening;
  readonly speaking: HostedSpeaking;
  readonly place?: string;
  readonly deviceId?: string;
  readonly pluginId?: string;
  readonly heard?: () => Int16Array;
  readonly listening?: HostedListening;
}

export interface HostedCall {
  readonly hear: (pcm16k: Int16Array) => void;
  readonly see: (frame: VideoFrame) => void;
  readonly note: (text: string) => void;
  readonly say: (text: string) => void;
  readonly mute: (muted: boolean) => void;
  readonly end: (reason: CallEnding) => Promise<void>;
}
