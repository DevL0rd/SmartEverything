import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { SideCompletion, type SideParts } from '../side-completion';
import type { Store } from '../../store/store';
import { admitsChatExecution } from '../native-helpers';
import { exchangeSource } from '../exchange-text';
import { callSource, cleanTitle, titlePrompt } from './title-text';
import { background, messageOf } from '@smarteverything/logging';

export interface ChatTitlesDeps extends SideParts {
  readonly store: Store;
  readonly now: () => Date;
  readonly log: Logger;
}

class TitleError extends Error {
  override readonly name = 'TitleError';
}

const TITLED_EVENTS: ReadonlySet<StoredEvent['kind']> = new Set(['chat', 'plugin', 'wake']);

const BACKFILL_KEY = 'chat_titles_backfill';

const BACKFILL_MAX = 50;

export class ChatTitles {
  private readonly busy = new Set<string>();
  private readonly running = new Set<Promise<void>>();
  private readonly side: SideCompletion;

  constructor(private readonly deps: ChatTitlesDeps) {
    this.side = new SideCompletion(deps);
  }

  readonly afterReply = (event: StoredEvent, text: string, ok: boolean): void => {
    if (ok && TITLED_EVENTS.has(event.kind)) {
      this.track(
        this.name(event.chat_id, async () => exchangeSource(await this.personText(event), text)),
        'chat_titles.name_failed',
      );
    }
  };

  afterCall(chatId: string, transcript: string): void {
    if (transcript.trim() !== '') {
      this.track(
        this.name(chatId, () => Promise.resolve(callSource(transcript))),
        'chat_titles.name_failed',
      );
    }
  }

  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  private track(work: Promise<void>, failure: string): void {
    this.running.add(work);
    background(
      work.finally(() => {
        this.running.delete(work);
      }),
      failure,
    );
  }

  backfill(): void {
    this.track(this.backfillOnce(), 'chat_titles.backfill_failed');
  }

  private async backfillOnce(): Promise<void> {
    if ((await this.deps.store.host.call('settingsKv', 'read', BACKFILL_KEY)) !== null) {
      return;
    }
    if (this.side.model() !== null) {
      this.startBackfill();
      return;
    }
    const stop = this.side.onModels(() => {
      if (this.side.model() !== null) {
        stop();
        this.startBackfill();
      }
    });
  }

  private startBackfill(): void {
    this.track(
      this.backfillChats().catch((cause: unknown) => {
        this.deps.log.error('assistant.titles_backfill_failed', cause);
      }),
      'chat_titles.backfill_failed',
    );
  }

  private async backfillChats(): Promise<void> {
    const { host } = this.deps.store;
    await host.call('settingsKv', 'save', BACKFILL_KEY, {
      started_at: this.deps.now().toISOString(),
    });
    const ids = await host.call('aiChats', 'untitled', BACKFILL_MAX);
    this.deps.log.info('assistant.titles_backfill', { chats: ids.length });
    for (const id of ids) {
      await this.name(id, () => this.storedSource(id));
    }
  }

  private async personText(event: StoredEvent): Promise<string> {
    return event.message_id === null
      ? event.text
      : (await this.deps.store.host.call('assistantChat', 'message', event.message_id)).text;
  }

  private async storedSource(chatId: string): Promise<string | null> {
    const { host } = this.deps.store;
    const person = await host.call('assistantSearch', 'firstText', chatId, 'person', 'text');
    const reply = await host.call('assistantSearch', 'firstText', chatId, 'responder', 'text');
    if (person !== null && reply !== null) {
      return exchangeSource(person, reply);
    }
    const call = await host.call('assistantSearch', 'firstText', chatId, 'system', 'call');
    return call === null ? null : callSource(call);
  }

  private async name(chatId: string, sourceOf: () => Promise<string | null>): Promise<void> {
    if (this.busy.has(chatId)) {
      return;
    }
    this.busy.add(chatId);
    try {
      const { host } = this.deps.store;
      const chat = await host.call('aiChats', 'chat', chatId);
      if (!admitsChatExecution(chat) || chat.native_admission === 'standalone') return;
      const source = (await host.call('aiChats', 'titleAuto', chatId)) ? await sourceOf() : null;
      if (source !== null) {
        await this.generate(chatId, source);
      }
    } catch (cause) {
      this.deps.log.warn('assistant.title_failed', {
        chatId,
        reason: messageOf(cause),
      });
    } finally {
      this.busy.delete(chatId);
    }
  }

  private async generate(chatId: string, source: string): Promise<void> {
    const model = this.side.model();
    if (model === null) {
      throw new TitleError('There is no Gemini Flash-Lite in the model list yet.');
    }
    const text = await this.side.complete(model, {
      chatId,
      purpose: 'session-title',
      ...titlePrompt(source),
    });
    const title = cleanTitle(text);
    if (title === null) {
      throw new TitleError('The model sent no usable title.');
    }
    await this.deps.store.host.call('aiChats', 'autoTitle', chatId, title);
  }
}
