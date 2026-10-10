import {
  latestGeminiFlashLite,
  type AiEffort,
  type AiModelKind,
  type AiModelRow,
} from '@smarteverything/domain';
import type { ChatMessage } from '../openrouter/chat-types';
import type { Store } from '../store/store';
import type { ChatClientPort, LedgerPort, TurnPort } from './engines/openrouter/ports';
import { pendingUsage, usageOf, type TurnUsage } from './engines/openrouter/turn-loop';

export interface SideCatalogue {
  readonly rows: (kind: AiModelKind) => readonly AiModelRow[];
  readonly effortFor: (model: AiModelRow, wanted: AiEffort) => AiEffort | null;
  readonly onChange: (listener: () => void) => () => void;
}

export interface SideCompletionDeps {
  readonly store: Store;
  readonly client: ChatClientPort;
  readonly catalogue: SideCatalogue;
  readonly newTurn: () => TurnPort;
  readonly ledger: LedgerPort;
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

  async complete(model: AiModelRow, request: SideRequest): Promise<string> {
    const turn = this.deps.newTurn();
    const chat = {
      model: model.id,
      messages: [...request.messages],
      effort: this.deps.catalogue.effortFor(model, 'none'),
      maxTokens: request.maxTokens,
    };
    let generationId: string | null = null;
    try {
      for await (const chunk of this.deps.client.chat(chat, AbortSignal.timeout(SIDE_TIMEOUT_MS))) {
        generationId = chunk.type === 'start' ? chunk.generationId : generationId;
        turn.feed(chunk);
      }
    } catch (cause) {
      if (generationId !== null) {
        this.record(request.chatId, pendingUsage(generationId, model.id, 'chat'));
      }
      throw cause;
    }
    const result = turn.result();
    this.record(request.chatId, usageOf(result, model.id, 'chat'));
    return result.text;
  }

  private record(chatId: string, usage: TurnUsage): void {
    const chat = this.deps.store.aiChats.chat(chatId);
    this.deps.ledger.record({ ...usage, profile_id: chat.profile_id, chat_id: chatId });
  }
}
