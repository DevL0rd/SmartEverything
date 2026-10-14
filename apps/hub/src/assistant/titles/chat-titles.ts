import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { SideCompletion, type SideCompletionDeps } from '../side-completion';
import { callSource, cleanTitle, exchangeSource, titleMessages } from './title-text';

export interface ChatTitlesDeps extends SideCompletionDeps {
  readonly now: () => Date;
  readonly log: Logger;
}

export class TitleError extends Error {
  override readonly name = 'TitleError';
}

const TITLED_EVENTS: ReadonlySet<StoredEvent['kind']> = new Set(['chat', 'plugin', 'wake']);

const BACKFILL_KEY = 'chat_titles_backfill';

const BACKFILL_MAX = 50;

const TITLE_TOKENS_MAX = 60;

export class ChatTitles {
  private readonly busy = new Set<string>();
  private readonly side: SideCompletion;

  constructor(private readonly deps: ChatTitlesDeps) {
    this.side = new SideCompletion(deps);
  }

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
    this.startBackfill();
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
    const { assistantSearch } = this.deps.store;
    const person = assistantSearch.firstText(chatId, 'person', 'text');
    const reply = assistantSearch.firstText(chatId, 'responder', 'text');
    if (person !== null && reply !== null) {
      return exchangeSource(person, reply);
    }
    const call = assistantSearch.firstText(chatId, 'system', 'call');
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
    if (!this.side.nativeAvailable(chatId))
      throw new TitleError('The selected engine supplies no title completion.');
    const text = await this.side.complete({
      chatId,
      messages: titleMessages(source),
      maxTokens: TITLE_TOKENS_MAX,
    });
    const title = cleanTitle(text);
    if (title === null) {
      throw new TitleError('The model sent no usable title.');
    }
    this.deps.store.aiChats.autoTitle(chatId, title);
  }
}
