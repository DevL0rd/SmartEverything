import { REPLY_SUGGESTIONS_KIND, type AssistantMessageRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { SideCompletion, type SideParts } from '../side-completion';
import type { Store } from '../../store/store';
import { cleanSuggestions, suggestionPrompt } from './suggestion-text';
import { messageOf } from '@smarteverything/logging';

export interface ReplySuggestionsDeps extends SideParts {
  readonly store: Store;
  readonly log: Logger;
}

function withoutSuggestions(row: AssistantMessageRow): AssistantMessageRow['embeds'] {
  return row.embeds.filter((embed) => embed.kind !== REPLY_SUGGESTIONS_KIND);
}

export class ReplySuggestions {
  private readonly side: SideCompletion;
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly deps: ReplySuggestionsDeps) {
    this.side = new SideCompletion(deps);
  }

  readonly afterReply = (event: StoredEvent, text: string, ok: boolean): void => {
    if (
      ok &&
      event.kind === 'chat' &&
      this.deps.store.live.home.assistant.read().reply_suggestions
    ) {
      const work = this.suggest(event, text)
        .catch((cause: unknown) => {
          this.deps.log.warn('assistant.suggestions_failed', {
            chatId: event.chat_id,
            reason: messageOf(cause),
          });
        })
        .finally(() => {
          this.running.delete(work);
        });
      this.running.add(work);
    }
  };

  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  private async suggest(event: StoredEvent, text: string): Promise<void> {
    const { host } = this.deps.store;
    const model = this.side.model();
    const reply = await this.latestReply(event);
    const person =
      event.message_id === null
        ? null
        : await host.call('assistantChat', 'message', event.message_id);
    if (model === null || reply === null || person?.origin?.source !== 'app') {
      return;
    }
    const raw = await this.side.complete(model, {
      chatId: event.chat_id,
      ...suggestionPrompt(person.text, text),
    });
    const embed = cleanSuggestions(raw);
    if (embed !== null && (await this.isLatest(reply))) {
      await host.call('assistantChat', 'updateMessage', reply.id, {
        embeds: [...withoutSuggestions(reply), embed],
      });
    }
  }

  private async latestReply(event: StoredEvent): Promise<AssistantMessageRow | null> {
    if (event.message_id === null) return null;
    const replies = await this.deps.store.host.call('assistantChat', 'repliesTo', event.message_id);
    return replies.at(-1) ?? null;
  }

  private async isLatest(reply: AssistantMessageRow): Promise<boolean> {
    const [newest] = await this.deps.store.host.call('assistantChat', 'messages', {
      chatId: reply.chat_id,
      limit: 1,
    });
    return newest?.id === reply.id;
  }
}
