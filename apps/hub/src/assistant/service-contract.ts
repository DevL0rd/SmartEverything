import type { z } from 'zod';
import type {
  AiUsageRow,
  AI_CHAT_RUNTIME_PROVIDER_NOTICE,
  AssistantStatus,
  ChatActivityNotice,
  MessageOrigin,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { StreamEmit } from './conversation/stream';
import type { AiChatProviderNotice } from '@smarteverything/domain';

export interface TurnActivity {
  readonly eventId: string;
  readonly state: ChatActivityNotice['state'];
  readonly steps: readonly string[];
}

export type TurnActivityListener = (activity: TurnActivity) => void;

export type TurnEnded = (event: StoredEvent, text: string, ok: boolean) => void;

export interface AssistantServiceOptions {
  readonly store: Store;
  readonly dataDirectory: string;
  readonly announce: (status: AssistantStatus) => void;
  readonly emit: StreamEmit;
  readonly runtimeNotice?: (
    notice: z.infer<typeof AI_CHAT_RUNTIME_PROVIDER_NOTICE>,
    profileId: string,
  ) => void;
  readonly providerNotice?: (notice: AiChatProviderNotice, profileId: string) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface TurnRequest {
  readonly profileId: string;
  readonly chatId?: string;
  readonly title?: string;
  readonly text: string;
  readonly origin: MessageOrigin;
}

export interface LedgerRollup {
  readonly rollup: (sink: (row: AiUsageRow, deltaMicros: number) => void) => () => void;
}
