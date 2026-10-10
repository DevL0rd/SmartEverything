import type { UsageMetadata } from '@google/genai';
import type { Logger } from '@smarteverything/logging';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { recordLiveTurn, type PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import type { OpusCodec } from './audio';
import type { CallEndpoint } from './call-link';
import type { CallRecord } from './call-record';
import type { Conversation } from './conversation';
import type { HostedSpeaking } from './outreach';
import type { Caller } from './persona';
import type { SpokenConfirmation } from './spoken-confirmation';

export interface Call {
  readonly id: string;
  readonly chatId: string;
  readonly endpoint: CallEndpoint;
  readonly caller: Caller;
  readonly conversation: Conversation;
  readonly record: CallRecord;
  readonly decoder: OpusCodec | null;
  readonly spoken: SpokenConfirmation;
  readonly outreachId: string | null;
  readonly speaking: HostedSpeaking | null;
  readonly detachers: (() => void)[];
}

export function toolCallerOf(call: Call): ToolCaller {
  return {
    profileId: call.caller.profileId,
    role: call.caller.role,
    chatId: call.chatId,
    via: 'voice',
    confirmed: false,
    clientId: call.caller.clientId,
  };
}

export interface MeterOptions {
  readonly store: Store;
  readonly prices: PriceBook;
  readonly log: Logger;
}

export function meter(
  options: MeterOptions,
  call: Call,
  usage: UsageMetadata,
  model: string,
): void {
  try {
    recordLiveTurn(options.store.ledger, options.prices, {
      profileId: call.caller.profileId,
      clientId: call.caller.clientId,
      callId: call.id,
      chatId: call.chatId,
      messageId: call.record.messageId,
      model,
      usage,
    });
  } catch (cause) {
    options.log.error('voice.usage_unrecorded', {
      callId: call.id,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
