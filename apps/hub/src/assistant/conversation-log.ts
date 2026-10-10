import {
  COMPACTION_EMBED,
  TOOLS_CHANGED_EMBED,
  type ToolsChangedEmbed,
  ASSISTANT_STEPS_KEPT,
  ASSISTANT_TEXT_MAX,
  ApiError,
  assistantLabel,
  isChatActivity,
  type AiChatRow,
  type AssistantMessageRow,
  type AssistantRequestState,
  type MessageOrigin,
} from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import { summaryOf, type StoredAttachment } from '../store/repositories/assistant-chat';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { activityLine } from './tool-activity';

export interface PersonMessage {
  readonly chat: AiChatRow;
  readonly clientId: string | null;
  readonly author: string;
  readonly text: string;
  readonly files: readonly StoredAttachment[];
  readonly origin: MessageOrigin;
}

export interface ResponderMessage {
  readonly chat: AiChatRow;
  readonly replyTo: string | null;
  readonly text: string;
  readonly files?: readonly StoredAttachment[];
  readonly kind?: 'text' | 'update';
  readonly model?: string | null;
}

const NO_EXTRAS = { origin: null, embeds: [], cost_micros: 0, model: null };

function keptSteps(steps: readonly string[]): string[] {
  return steps
    .map((step) => activityLine(step))
    .filter((step) => step !== '')
    .slice(-ASSISTANT_STEPS_KEPT);
}

export class ConversationLog {
  private readonly replied = new Set<string>();

  constructor(private readonly store: Store) {}

  private get messages(): Store['assistantChat'] {
    return this.store.assistantChat;
  }

  private add(row: NewAssistantMessage, files: readonly StoredAttachment[]): AssistantMessageRow {
    return this.store.write(() => {
      const added = this.messages.addMessage(row);
      this.messages.attachTo(
        added.id,
        files.map((file) => file.id),
      );
      if (isChatActivity(row)) {
        this.store.aiChats.touched(row.chat_id, 0);
      }
      return added;
    });
  }

  person(input: PersonMessage): AssistantMessageRow {
    return this.add(
      {
        ...NO_EXTRAS,
        profile_id: input.chat.profile_id,
        client_id: input.clientId,
        chat_id: input.chat.id,
        role: 'person',
        kind: 'text',
        author: input.author,
        text: input.text,
        attachments: input.files.map(summaryOf),
        state: 'queued',
        reason: null,
        steps: [],
        reply_to: null,
        origin: input.origin,
      },
      input.files,
    );
  }

  responderInChat(input: ResponderMessage): AssistantMessageRow {
    const files = input.files ?? [];
    if (input.text === '' && files.length === 0) {
      throw new ApiError('invalid_request', 'Send some text or at least one file.');
    }
    return this.add(
      {
        ...NO_EXTRAS,
        profile_id: input.chat.profile_id,
        client_id: null,
        chat_id: input.chat.id,
        role: 'responder',
        kind: input.kind ?? 'text',
        author: assistantLabel(this.messages.settings()),
        text: input.text,
        attachments: files.map(summaryOf),
        state: null,
        reason: null,
        steps: [],
        reply_to: input.replyTo,
        model: input.model ?? null,
      },
      files,
    );
  }

  startReply(chat: AiChatRow, replyTo: string | null, model: string): AssistantMessageRow {
    return this.add(
      {
        ...NO_EXTRAS,
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'responder',
        kind: 'text',
        author: assistantLabel(this.messages.settings()),
        text: '',
        attachments: [],
        state: 'working',
        reason: null,
        steps: [],
        reply_to: replyTo,
        model,
      },
      [],
    );
  }

  flushReply(id: string, text: string): void {
    this.messages.updateMessage(id, { text: text.slice(0, ASSISTANT_TEXT_MAX) });
  }

  finishReply(
    id: string,
    text: string,
    model: string,
    steps: readonly string[],
  ): AssistantMessageRow {
    return this.messages.updateMessage(id, {
      text: text.slice(0, ASSISTANT_TEXT_MAX),
      model,
      state: 'answered',
      steps: keptSteps(steps),
    });
  }

  failReply(id: string, text: string, reason: string, steps: readonly string[]): void {
    this.messages.updateMessage(id, {
      text: text.slice(0, ASSISTANT_TEXT_MAX),
      state: 'failed',
      reason: reason.slice(0, 400),
      steps: keptSteps(steps),
    });
  }

  originNote(chat: AiChatRow, origin: MessageOrigin): AssistantMessageRow {
    const label = origin.name ?? origin.source;
    return this.add(
      {
        ...NO_EXTRAS,
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'system',
        kind: 'update',
        author: label.slice(0, 120),
        text: `Started by ${label}`,
        attachments: [],
        state: 'queued',
        reason: null,
        steps: [],
        reply_to: null,
        origin,
      },
      [],
    );
  }

  note(
    chat: AiChatRow,
    author: string,
    text: string,
    origin: MessageOrigin | null,
  ): AssistantMessageRow {
    return this.add(
      {
        ...NO_EXTRAS,
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'system',
        kind: 'update',
        author: author.slice(0, 120),
        text: text.slice(0, ASSISTANT_TEXT_MAX),
        attachments: [],
        state: null,
        reason: null,
        steps: [],
        reply_to: null,
        origin,
      },
      [],
    );
  }

  compaction(chat: AiChatRow, summary: string, through: string): AssistantMessageRow {
    return this.add(
      {
        ...NO_EXTRAS,
        embeds: [COMPACTION_EMBED.parse({ kind: 'compaction', through_at: through })],
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'system',
        kind: 'update',
        author: assistantLabel(this.messages.settings()),
        text: summary.slice(0, ASSISTANT_TEXT_MAX),
        attachments: [],
        state: null,
        reason: null,
        steps: [],
        reply_to: null,
      },
      [],
    );
  }

  toolsChanged(chat: AiChatRow, text: string, embed: ToolsChangedEmbed): AssistantMessageRow {
    return this.add(
      {
        ...NO_EXTRAS,
        embeds: [TOOLS_CHANGED_EMBED.parse(embed)],
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'system',
        kind: 'update',
        author: 'SmartEverything',
        text: text.slice(0, ASSISTANT_TEXT_MAX),
        attachments: [],
        state: null,
        reason: null,
        steps: [],
        reply_to: null,
      },
      [],
    );
  }

  action(chat: AiChatRow, line: string): AssistantMessageRow {
    return this.add(
      {
        ...NO_EXTRAS,
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'system',
        kind: 'action',
        author: assistantLabel(this.messages.settings()),
        text: activityLine(line),
        attachments: [],
        state: null,
        reason: null,
        steps: [],
        reply_to: null,
      },
      [],
    );
  }

  private message(id: string | null): AssistantMessageRow | null {
    if (id === null) {
      return null;
    }
    try {
      return this.messages.message(id);
    } catch (cause) {
      if (!(cause instanceof StoreNotFoundError)) {
        throw cause;
      }
      return null;
    }
  }

  stateOf(
    messageId: string | null,
    state: AssistantRequestState,
    reason: string | null = null,
  ): void {
    const message = this.message(messageId);
    if (message === null || message.state === state || message.state === 'failed') {
      return;
    }
    this.messages.updateMessage(message.id, { state, reason });
  }

  failedMessage(messageId: string | null, reason: string): void {
    const message = this.message(messageId);
    if (message !== null) {
      this.messages.updateMessage(message.id, { state: 'failed', reason });
    }
  }

  state(eventId: string, state: AssistantRequestState): void {
    this.stateOf(this.store.assistantEvents.event(eventId).message_id, state);
  }

  step(eventId: string, line: string): void {
    const message = this.message(this.store.assistantEvents.event(eventId).message_id);
    const step = activityLine(line);
    if (message === null || step === '' || message.steps.at(-1) === step) {
      return;
    }
    this.messages.updateMessage(message.id, {
      steps: [...message.steps, step].slice(-ASSISTANT_STEPS_KEPT),
    });
  }

  delivered(eventId: string): void {
    const message = this.message(this.store.assistantEvents.event(eventId).message_id);
    if (message?.state === 'queued') {
      this.messages.updateMessage(message.id, { state: 'delivered' });
    }
  }

  repliedTo(eventId: string): void {
    this.replied.add(eventId);
    this.state(eventId, 'working');
  }

  settled(eventId: string): void {
    this.state(eventId, this.replied.has(eventId) ? 'answered' : 'delivered');
    this.replied.delete(eventId);
  }

  failed(event: StoredEvent, reason: string): void {
    this.failedMessage(event.message_id, `Assistant unavailable: ${reason}`);
  }
}
