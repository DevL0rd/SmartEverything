import { REPLY_SUGGESTIONS_KIND, type AssistantMessageRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { SideCompletion, type SideCompletionDeps } from '../side-completion';
import { cleanSuggestions, suggestionMessages } from './suggestion-text';
import { messageOf } from '@smarteverything/logging';

export interface ReplySuggestionsDeps extends SideCompletionDeps {
  readonly log: Logger;
}

const SUGGESTION_TOKENS_MAX = 120;

function withoutSuggestions(row: AssistantMessageRow): AssistantMessageRow['embeds'] {
  return row.embeds.filter((embed) => embed.kind !== REPLY_SUGGESTIONS_KIND);
}

export class ReplySuggestions {
  private readonly side: SideCompletion;

  constructor(private readonly deps: ReplySuggestionsDeps) {
    this.side = new SideCompletion(deps);
  }

  readonly afterReply = (event: StoredEvent, text: string, ok: boolean): void => {
    if (ok && event.kind === 'chat' && this.deps.store.assistantChat.settings().reply_suggestions) {
      this.suggest(event, text).catch((cause: unknown) => {
        this.deps.log.warn('assistant.suggestions_failed', {
          chatId: event.chat_id,
          reason: messageOf(cause),
        });
      });
    }
  };

  private async suggest(event: StoredEvent, text: string): Promise<void> {
    const model = this.side.model();
    const reply = this.latestReply(event);
    const person =
      event.message_id === null ? null : this.deps.store.assistantChat.message(event.message_id);
    if (model === null || reply === null || person?.origin?.source !== 'app') {
      return;
    }
    const raw = await this.side.complete(model, {
      chatId: event.chat_id,
      messages: suggestionMessages(person.text, text),
      maxTokens: SUGGESTION_TOKENS_MAX,
    });
    const embed = cleanSuggestions(raw);
    if (embed !== null && this.isLatest(reply)) {
      this.deps.store.assistantChat.updateMessage(reply.id, {
        embeds: [...withoutSuggestions(reply), embed],
      });
    }
  }

  private latestReply(event: StoredEvent): AssistantMessageRow | null {
    const { assistantChat } = this.deps.store;
    return event.message_id === null
      ? null
      : (assistantChat.repliesTo(event.message_id).at(-1) ?? null);
  }

  private isLatest(reply: AssistantMessageRow): boolean {
    const [newest] = this.deps.store.assistantChat.messages({ chatId: reply.chat_id, limit: 1 });
    return newest?.id === reply.id;
  }
}
