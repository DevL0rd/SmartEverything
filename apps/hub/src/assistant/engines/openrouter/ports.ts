import type {
  AiEffort,
  AiModelChoice,
  AiModelRow,
  AiResolvedModel,
  AiUsageRow,
  UsageEntry,
} from '@smarteverything/domain';
import type { ChatChunk, ChatRequest, ChatUsage, ToolCall } from '../../../openrouter/chat-types';
import type { JsonValue, WebSource } from '@smarteverything/domain';

export interface ChatClientPort {
  readonly chat: (request: ChatRequest, signal: AbortSignal) => AsyncIterable<ChatChunk>;
}

export interface CataloguePort {
  readonly resolve: (choice: AiModelChoice | null, effort: AiEffort | null) => AiResolvedModel;
  readonly model: (id: string) => AiModelRow;
}

export interface LedgerPort {
  readonly record: (entry: UsageEntry) => AiUsageRow;
}

export interface TurnResult {
  readonly generationId: string | null;
  readonly model: string | null;
  readonly text: string;
  readonly reasoningDetails: readonly JsonValue[];
  readonly toolCalls: readonly ToolCall[];
  readonly citations: readonly WebSource[];
  readonly finishReason: string | null;
  readonly usage: ChatUsage | null;
}

export interface TurnPort {
  readonly feed: (chunk: ChatChunk) => void;
  readonly result: () => TurnResult;
}
