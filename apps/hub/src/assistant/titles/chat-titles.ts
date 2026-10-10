import {
  latestGeminiFlashLite,
  type AiEffort,
  type AiModelKind,
  type AiModelRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { ChatClientPort, LedgerPort, TurnPort } from '../engines/openrouter/ports';
import { pendingUsage, usageOf, type TurnUsage } from '../engines/openrouter/turn-loop';
import { callSource, cleanTitle, exchangeSource, titleMessages } from './title-text';

export interface TitleCatalogue {
  readonly rows: (kind: AiModelKind) => readonly AiModelRow[];
  readonly effortFor: (model: AiModelRow, wanted: AiEffort) => AiEffort | null;
  readonly onChange: (listener: () => void) => () => void;
}

export interface ChatTitlesDeps {
  readonly store: Store;
  readonly client: ChatClientPort;
  readonly catalogue: TitleCatalogue;
  readonly newTurn: () => TurnPort;
  readonly ledger: LedgerPort;
  readonly now: () => Date;
  readonly log: Logger;
}

export class TitleError extends Error {
  override readonly name = 'TitleError';
}

const TITLED_EVENTS: ReadonlySet<StoredEvent['kind']> = new Set(['chat', 'plugin', 'wake']);

const BACKFILL_KEY = 'chat_titles_backfill';

const BACKFILL_MAX = 50;

const TITLE_TIMEOUT_MS = 30_000;

const TITLE_TOKENS_MAX = 60;

export class ChatTitles {
  private readonly busy = new Set<string>();

  constructor(private readonly deps: ChatTitlesDeps) {}

  readonly afterReply = (event: StoredEvent, text: string, ok: boolean): void => {
    if (ok && TITLED_EVENTS.has(event.kind)) {
      void this.name(event.chat_id, () => exchangeSource(this.personText(event), text));
    }
  };

  afterCall(chatId: string, transcript: string): void {
    if (transcript.trim() !== '') {
      void this.name(chatId, () => callSource(transcript));
    }
  }

  backfill(): void {
    if (this.deps.store.aiChats.setting(BACKFILL_KEY) !== null) {
      return;
    }
    if (this.model() !== null) {
      this.startBackfill();
      return;
    }
    const stop = this.deps.catalogue.onChange(() => {
      if (this.model() !== null) {
        stop();
        this.startBackfill();
      }
    });
  }

  private startBackfill(): void {
    this.backfillChats().catch((cause: unknown) => {
      this.deps.log.error('assistant.titles_backfill_failed', cause);
    });
  }

  private async backfillChats(): Promise<void> {
    const { aiChats } = this.deps.store;
    aiChats.saveSetting(BACKFILL_KEY, {
      started_at: this.deps.now().toISOString(),
    });
    const ids = aiChats.untitled(BACKFILL_MAX);
    this.deps.log.info('assistant.titles_backfill', { chats: ids.length });
    for (const id of ids) {
      await this.name(id, () => this.storedSource(id));
    }
  }

  private personText(event: StoredEvent): string {
    return event.message_id === null
      ? event.text
      : this.deps.store.assistantChat.message(event.message_id).text;
  }

  private storedSource(chatId: string): string | null {
    const { assistantChat } = this.deps.store;
    const person = assistantChat.firstText(chatId, 'person', 'text');
    const reply = assistantChat.firstText(chatId, 'responder', 'text');
    if (person !== null && reply !== null) {
      return exchangeSource(person, reply);
    }
    const call = assistantChat.firstText(chatId, 'system', 'call');
    return call === null ? null : callSource(call);
  }

  private async name(chatId: string, sourceOf: () => string | null): Promise<void> {
    if (this.busy.has(chatId)) {
      return;
    }
    this.busy.add(chatId);
    try {
      const source = this.deps.store.aiChats.titleAuto(chatId) ? sourceOf() : null;
      if (source !== null) {
        await this.generate(chatId, source);
      }
    } catch (cause) {
      this.deps.log.warn('assistant.title_failed', {
        chatId,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      this.busy.delete(chatId);
    }
  }

  private async generate(chatId: string, source: string): Promise<void> {
    const model = this.model();
    if (model === null) {
      throw new TitleError('There is no Gemini Flash-Lite in the model list yet.');
    }
    const text = await this.complete(chatId, model, source);
    const title = cleanTitle(text);
    if (title === null) {
      throw new TitleError('The model sent no usable title.');
    }
    this.deps.store.aiChats.autoTitle(chatId, title);
  }

  private async complete(chatId: string, model: AiModelRow, source: string): Promise<string> {
    const turn = this.deps.newTurn();
    const request = {
      model: model.id,
      messages: titleMessages(source),
      effort: this.deps.catalogue.effortFor(model, 'none'),
      maxTokens: TITLE_TOKENS_MAX,
    };
    let generationId: string | null = null;
    try {
      for await (const chunk of this.deps.client.chat(
        request,
        AbortSignal.timeout(TITLE_TIMEOUT_MS),
      )) {
        generationId = chunk.type === 'start' ? chunk.generationId : generationId;
        turn.feed(chunk);
      }
    } catch (cause) {
      if (generationId !== null) {
        this.record(chatId, pendingUsage(generationId, model.id, 'chat'));
      }
      throw cause;
    }
    const result = turn.result();
    this.record(chatId, usageOf(result, model.id, 'chat'));
    return result.text;
  }

  private record(chatId: string, usage: TurnUsage): void {
    const chat = this.deps.store.aiChats.chat(chatId);
    this.deps.ledger.record({
      ...usage,
      profile_id: chat.profile_id,
      chat_id: chatId,
    });
  }

  private model(): AiModelRow | null {
    return latestGeminiFlashLite(this.deps.catalogue.rows('chat'));
  }
}
