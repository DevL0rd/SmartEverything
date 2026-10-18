import {
  latestGeminiFlashLite,
  microsOfUsd,
  type AiModelRow,
  type UsageEntry,
} from '@smarteverything/domain';
import { tokenMeters } from '../ledger/media-notes';
import type { ChatMessage } from '../openrouter/chat-types';
import type { Catalogue } from '../openrouter/catalogue';
import type { OpenRouterClient } from '../openrouter/client';
import { TurnAccumulator } from '../openrouter/turn';
import type { OrUsage } from '../openrouter/wire';
import type { Store } from '../store/store';

export interface SideParts {
  readonly client: Pick<OpenRouterClient, 'chat'>;
  readonly catalogue: Pick<Catalogue, 'rows' | 'effortFor' | 'onChange'>;
}

export interface SideCompletionDeps extends SideParts {
  readonly store: Store;
}

export interface SideRequest {
  readonly chatId: string;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens: number;
}

const SIDE_TIMEOUT_MS = 30_000;

export class SideCompletion {
  constructor(private readonly deps: SideCompletionDeps) {}

  model(): AiModelRow | null {
    return latestGeminiFlashLite(this.deps.catalogue.rows('chat'));
  }

  onModels(listener: () => void): () => void {
    return this.deps.catalogue.onChange(listener);
  }

  async complete(model: AiModelRow, request: SideRequest): Promise<string> {
    const turn = new TurnAccumulator();
    let generationId: string | null = null;
    try {
      const chat = {
        model: model.id,
        messages: request.messages,
        effort: this.deps.catalogue.effortFor(model, 'none'),
        maxTokens: request.maxTokens,
      };
      for await (const chunk of this.deps.client.chat(chat, AbortSignal.timeout(SIDE_TIMEOUT_MS))) {
        generationId ??= chunk.id;
        turn.feed(chunk);
      }
    } catch (cause) {
      if (generationId !== null) this.record(request.chatId, model.id, generationId, null);
      throw cause;
    }
    const result = turn.result();
    this.record(request.chatId, result.model, result.generationId, result.usage);
    return result.text;
  }

  private record(chatId: string, model: string, generationId: string, usage: OrUsage | null): void {
    const chat = this.deps.store.aiChats.chat(chatId);
    this.deps.store.ledger.record(
      usageOf({ profile_id: chat.profile_id, chat_id: chatId }, model, generationId, usage),
    );
  }
}

function usageOf(
  links: Pick<UsageEntry, 'profile_id' | 'chat_id'>,
  model: string,
  generationId: string,
  usage: OrUsage | null,
): UsageEntry {
  const cost = usage?.cost ?? null;
  return {
    ...links,
    source: 'openrouter',
    work: 'chat',
    model_id: model,
    generation_id: generationId,
    ...tokenMeters(usage),
    cost_micros: cost === null ? 0 : microsOfUsd(cost),
    cost_state: cost === null ? 'estimated' : 'reported',
  };
}
