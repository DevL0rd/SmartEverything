import type { UsageMetadata } from '@google/genai';
import type { CallSource } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { limitsOf } from '../ai-tools/plugin-turn';
import type { VoiceResponder } from '../assistant/voice-link';
import { recordLiveTurn, type PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import type { OpusCodec } from './audio';
import type { SocketLink } from './call-link';
import type { CallRecord } from './call-record';
import type { CallSight } from './call-sight';
import type { EndpointSlot } from './call-slot';
import type { Conversation } from './conversation';
import type { VoiceProvider } from './gemini';
import type { HomeCameras } from './home-cameras';
import type { HostedListening, HostedSpeaking } from './outreach';
import type { Caller } from './persona';
import type { SpeakingMedia } from '../reach/room-media';
import { messageOf } from '@smarteverything/logging';

export interface CallDeskOptions {
  readonly store: Store;
  readonly provider: VoiceProvider;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly cameras: HomeCameras;
  readonly roomMedia?: SpeakingMedia;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface SightBudget {
  readonly reason: () => string | null;
}

export class CallLive {
  private mutedNow = false;
  private timer: NodeJS.Timeout | null = null;

  get muted(): boolean {
    return this.mutedNow;
  }

  mute(muted: boolean): void {
    this.mutedNow = muted;
  }

  hold(timer: NodeJS.Timeout): void {
    this.release();
    this.timer = timer;
  }

  release(): void {
    clearTimeout(this.timer ?? undefined);
    this.timer = null;
  }
}

export interface Call {
  readonly id: string;
  readonly chatId: string;
  readonly endpoint: EndpointSlot;
  readonly link: SocketLink;
  readonly source: CallSource | null;
  readonly startedAt: Date;
  readonly sight: CallSight | null;
  readonly live: CallLive;
  readonly caller: Caller;
  readonly conversation: Conversation;
  readonly record: CallRecord;
  readonly decoder: OpusCodec | null;
  readonly outreachId: string | null;
  readonly pluginId: string | null;
  readonly place: string | null;
  readonly deviceId: string | null;
  readonly speaking: HostedSpeaking | null;
  readonly listening: HostedListening | null;
  readonly detachers: (() => void)[];
}

export function toolCallerOf(call: Call): ToolCaller {
  return {
    profileId: call.caller.profileId,
    role: call.caller.role,
    chatId: call.chatId,
    via: 'voice',
    clientId: call.caller.clientId,
    ...limitsOf(call.caller.requester, call.caller.pluginId),
  };
}

export interface MeterOptions {
  readonly store: Store;
  readonly prices: PriceBook;
  readonly log: Logger;
}

export interface Metered {
  readonly id: string;
  readonly chatId: string;
  readonly pluginId: string | null;
  readonly caller: Pick<Caller, 'profileId' | 'clientId'>;
  readonly record: Pick<CallRecord, 'messageId'>;
}

export function meter(
  options: MeterOptions,
  call: Metered,
  usage: UsageMetadata,
  model: string,
): void {
  try {
    recordLiveTurn(options.store.ledger, options.prices, {
      profileId: call.caller.profileId,
      clientId: call.caller.clientId,
      pluginId: call.pluginId,
      callId: call.id,
      chatId: call.chatId,
      messageId: call.record.messageId,
      model,
      usage,
    });
  } catch (cause) {
    options.log.error('voice.usage_unrecorded', {
      callId: call.id,
      reason: messageOf(cause),
    });
  }
}
