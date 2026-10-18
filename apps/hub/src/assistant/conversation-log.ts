import {
  COMPACTION_EMBED,
  ASSISTANT_STEPS_KEPT,
  WEB_SOURCES_KIND,
  type WebSource,
  ApiError,
  assistantLabel,
  isChatActivity,
  type AiChatRow,
  type AiMessageReference,
  type ChatStepOutcome,
  type SettledStep,
  type AssistantMessageRow,
  type AssistantReasonCode,
  type ChatTimelineEmbed,
  type AssistantRequestState,
  type MessageOrigin,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { StoreNotFoundError } from '../store/context';
import { summaryOf, type StoredAttachment } from '../store/repositories/assistant-chat';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';

export interface PersonMessage {
  readonly chat: AiChatRow;
  readonly clientId: string | null;
  readonly author: string;
  readonly text: string;
  readonly files: readonly StoredAttachment[];
  readonly origin: MessageOrigin;
  readonly clientMessageId?: string;
  readonly references?: readonly AiMessageReference[];
}

export interface ResponderMessage {
  readonly chat: AiChatRow;
  readonly replyTo: string | null;
  readonly text: string;
  readonly files?: readonly StoredAttachment[];
  readonly kind?: 'text' | 'update';
  readonly model?: string | null;
  readonly messageId?: string;
}

const log = new Logger('hub.assistant-conversation');

function activityLine(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 200);
}

const NO_EXTRAS = { origin: null, embeds: [], cost_micros: 0, model: null };

function keptSteps(steps: readonly SettledStep[]): {
  readonly steps: string[];
  readonly step_states: ChatStepOutcome[];
} {
  const kept = steps
    .map((step) => ({ title: activityLine(step.title), outcome: step.outcome }))
    .filter((step) => step.title !== '')
    .slice(-ASSISTANT_STEPS_KEPT);
  return { steps: kept.map((step) => step.title), step_states: kept.map((step) => step.outcome) };
}

export class ConversationLog {
  constructor(private readonly store: Store) {}

  private get messages(): Store['assistantChat'] {
    return this.store.assistantChat;
  }

  private add(
    row: NewAssistantMessage,
    files: readonly StoredAttachment[],
    messageId?: string,
  ): AssistantMessageRow {
    return this.store.write(() => {
      const added = this.messages.addMessage(row, undefined, messageId);
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
        references: [...(input.references ?? [])],
        state: 'queued',
        reason: null,
        steps: [],
        step_states: [],
        reply_to: null,
        origin: input.origin,
        ...(input.clientMessageId === undefined
          ? {}
          : { client_message_id: input.clientMessageId }),
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
        step_states: [],
        reply_to: input.replyTo,
        model: input.model ?? null,
      },
      files,
      input.messageId,
    );
  }

  startReply(chat: AiChatRow, replyTo: string | null, model: string): AssistantMessageRow {
    log.debug('reply.started', { chatId: chat.id, profileId: chat.profile_id, replyTo, model });
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
        step_states: [],
        reply_to: replyTo,
        model,
      },
      [],
    );
  }

  flushReply(id: string, text: string): void {
    this.messages.updateMessage(id, { text });
  }

  timeline(id: string, timeline: ChatTimelineEmbed): void {
    this.messages.updateMessage(id, { embeds: this.withTimeline(id, timeline) });
  }

  progress(id: string, text: string, timeline: ChatTimelineEmbed): void {
    this.messages.updateMessage(id, { text, embeds: this.withTimeline(id, timeline) });
  }

  private withTimeline(id: string, timeline: ChatTimelineEmbed): AssistantMessageRow['embeds'] {
    const kept = this.messages.message(id).embeds.filter((embed) => embed.kind !== 'chat_timeline');
    return [...kept, timeline];
  }

  finishReply(
    id: string,
    text: string,
    done: {
      readonly model: string;
      readonly steps: readonly SettledStep[];
      readonly sources: readonly WebSource[];
    },
  ): AssistantMessageRow {
    const kept = this.messages
      .message(id)
      .embeds.filter((embed) => embed.kind !== WEB_SOURCES_KIND);
    log.debug('reply.finished', {
      messageId: id,
      model: done.model,
      textChars: text.length,
      steps: done.steps.length,
      sources: done.sources.length,
    });
    return this.messages.updateMessage(id, {
      embeds:
        done.sources.length === 0
          ? kept
          : [...kept, { kind: WEB_SOURCES_KIND, sources: done.sources }],
      text,
      model: done.model,
      state: 'answered',
      ...keptSteps(done.steps),
    });
  }

  failReply(
    id: string,
    failure: { readonly text: string; readonly reason: string; readonly code: AssistantReasonCode },
    steps: readonly SettledStep[],
  ): void {
    log.warn('reply.failed', {
      messageId: id,
      reasonCode: failure.code,
      reason: failure.reason.slice(0, 200),
      textChars: failure.text.length,
      steps: steps.length,
    });
    this.messages.updateMessage(id, {
      text: failure.text,
      state: 'failed',
      reason: failure.reason.slice(0, 400),
      reason_code: failure.code,
      ...keptSteps(steps),
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
        step_states: [],
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
        text,
        attachments: [],
        state: null,
        reason: null,
        steps: [],
        step_states: [],
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
        text: summary,
        attachments: [],
        state: null,
        reason: null,
        steps: [],
        step_states: [],
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
        step_states: [],
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
      log.trace('message.state_unchanged', { messageId, state, current: message?.state });
      return;
    }
    log.debug('message.state_changed', {
      messageId: message.id,
      chatId: message.chat_id,
      from: message.state,
      to: state,
      hasReason: reason !== null,
    });
    this.messages.updateMessage(message.id, { state, reason });
  }

  failedMessage(messageId: string | null, reason: string, code: AssistantReasonCode): void {
    const message = this.message(messageId);
    if (message !== null) {
      log.warn('message.failed', {
        messageId: message.id,
        chatId: message.chat_id,
        from: message.state,
        reasonCode: code,
        reason: reason.slice(0, 200),
      });
      this.messages.updateMessage(message.id, {
        state: 'failed',
        reason: reason.slice(0, 400),
        reason_code: code,
      });
    }
  }

  interrupted(reason: string): void {
    log.info('turns.interrupted', { reason: reason.slice(0, 200) });
    this.store.write(() => {
      this.messages.failWorking(reason, 'interrupted');
      for (const event of this.store.assistantEvents.abandoned()) {
        this.store.assistantEvents.mark(event.id, 'answered_at');
        if (this.message(event.message_id)?.role === 'person') {
          this.failedMessage(event.message_id, reason, 'interrupted');
        }
      }
    });
  }

  delivered(eventId: string): void {
    const message = this.message(this.store.assistantEvents.event(eventId).message_id);
    if (message?.state === 'queued') {
      this.messages.updateMessage(message.id, { state: 'delivered' });
    }
  }

  failed(event: StoredEvent, reason: string): void {
    this.failedMessage(event.message_id, `Assistant unavailable: ${reason}`, 'unknown');
  }
}
