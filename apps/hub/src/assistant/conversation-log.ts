import {
  COMPACTION_EMBED,
  ApiError,
  assistantLabel,
  type AiChatRow,
  type AiMessageReference,
  type SettledStep,
  type AssistantMessageRow,
  type AssistantReasonCode,
  type ChatTimelineEmbed,
  type ChatTodosEmbed,
  type AssistantRequestState,
  type MessageOrigin,
  type HelperDialogue,
  type MessageQuote,
  HELPER_INPUT_KIND,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { summaryOf, type StoredAttachment } from '../store/repositories/assistant-chat';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { HarnessDelivery } from '../store/repositories/harness-deliveries';
import { keptSteps, type ReplyDone, type ReplyFailure, type ReplyStart } from './reply-records';
import { noteMessage } from './note-message';
import { ReplyQueue } from './reply-queue';
import type { NativeAdmission, NativeCompletionRecord } from './reply-units';

export interface PersonMessage {
  readonly chat: AiChatRow;
  readonly clientId: string | null;
  readonly author: string;
  readonly text: string;
  readonly files: readonly StoredAttachment[];
  readonly origin: MessageOrigin;
  readonly clientMessageId?: string;
  readonly references?: readonly AiMessageReference[];
  readonly helperDialogue?: HelperDialogue;
  readonly helperInput?: true;
  readonly quote?: MessageQuote | null;
  readonly messageId?: string;
  readonly queued?: true;
}

export interface ResponderMessage {
  readonly chat: AiChatRow;
  readonly replyTo: string | null;
  readonly text: string;
  readonly files?: readonly StoredAttachment[];
  readonly kind?: 'text' | 'update';
  readonly model?: string | null;
  readonly messageId?: string;
  readonly steps?: readonly SettledStep[];
  readonly helperDialogue?: HelperDialogue;
  readonly quote?: MessageQuote | null;
}

const log = new Logger('hub.assistant-conversation');

const NO_EXTRAS = { origin: null, embeds: [], cost_micros: 0, model: null, quote: null };

function quoteOrNull(quote: MessageQuote | null | undefined): MessageQuote | null {
  return quote ?? null;
}

function personEmbeds(input: PersonMessage): NewAssistantMessage['embeds'] {
  if (input.helperDialogue !== undefined) return [input.helperDialogue];
  return input.helperInput === true ? [{ kind: HELPER_INPUT_KIND }] : [];
}

export function personMessage(input: PersonMessage): NewAssistantMessage {
  return {
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
    state: input.helperDialogue === undefined || input.queued === true ? 'queued' : null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: quoteOrNull(input.quote),
    origin: input.origin,
    embeds: personEmbeds(input),
    ...(input.clientMessageId === undefined ? {} : { client_message_id: input.clientMessageId }),
  };
}

class ReplyRowMissingError extends Error {
  override readonly name = 'ReplyRowMissingError';

  constructor(readonly replyId: string) {
    super(`The finished reply ${replyId} came back without its row.`);
  }
}

export function responderMessage(
  input: ResponderMessage,
  assistant: () => string,
): NewAssistantMessage {
  const files = input.files ?? [];
  if (input.text === '' && files.length === 0) {
    throw new ApiError('invalid_request', 'Send some text or at least one file.');
  }
  return {
    ...NO_EXTRAS,
    profile_id: input.chat.profile_id,
    client_id: null,
    chat_id: input.chat.id,
    role: 'responder',
    kind: input.kind ?? 'text',
    author: input.helperDialogue?.helper_name ?? assistant(),
    text: input.text,
    embeds: input.helperDialogue === undefined ? [] : [input.helperDialogue],
    attachments: files.map(summaryOf),
    state: null,
    reason: null,
    ...keptSteps(input.steps ?? []),
    reply_to: input.replyTo,
    quote: quoteOrNull(input.quote),
    model: input.model ?? null,
  };
}

export class ConversationLog {
  private readonly replies: ReplyQueue;

  constructor(private readonly store: Store) {
    this.replies = new ReplyQueue(() => store.host);
  }

  onMessage(chatId: string, listener: (messageId: string) => void): () => void {
    return this.store.feed.subscribe((change) => {
      if (
        change.table === 'assistant_messages' &&
        change.operation === 'INSERT' &&
        change.record !== null &&
        change.record.chat_id === chatId
      )
        listener(change.record.id);
    });
  }

  private add(
    row: NewAssistantMessage,
    files: readonly StoredAttachment[],
    messageId?: string,
  ): Promise<AssistantMessageRow> {
    const ids = files.map((file) => file.id);
    const message = {
      row,
      files: ids,
      ...(messageId === undefined ? {} : { messageId }),
    };
    this.replies.flush();
    if (ids.length === 0) return this.store.host.write('assistantMessageAdd', message);
    return this.store.live.attachments.attach(ids, () =>
      this.store.host.write('assistantMessageAdd', message),
    );
  }

  private assistantName(): string {
    return assistantLabel(this.store.live.home.assistant.read());
  }

  person(input: PersonMessage): Promise<AssistantMessageRow> {
    return this.add(personMessage(input), input.files, input.messageId);
  }

  responderInChat(input: ResponderMessage): Promise<AssistantMessageRow> {
    return this.add(
      responderMessage(input, () => this.assistantName()),
      input.files ?? [],
      input.messageId,
    );
  }

  startReply(start: ReplyStart & { readonly id?: string }): Promise<AssistantMessageRow> {
    log.debug('reply.started', {
      chatId: start.chat.id,
      profileId: start.chat.profile_id,
      replyTo: start.replyTo,
      model: start.model,
    });
    this.replies.flush();
    return this.store.host.write('assistantReplyStart', start);
  }

  admitNative(admission: NativeAdmission): Promise<HarnessDelivery> {
    this.replies.flush();
    return this.store.host.write('assistantNativeAdmit', admission);
  }

  async completeNative(record: NativeCompletionRecord): Promise<void> {
    this.replies.flush();
    await this.store.host.write('assistantNativeComplete', record);
  }

  settled(): Promise<void> {
    return this.replies.settled();
  }

  async flushReply(id: string, text: string): Promise<void> {
    await this.replies.write({ kind: 'text', id, text });
  }

  async timeline(id: string, timeline: ChatTimelineEmbed): Promise<void> {
    await this.replies.write({ kind: 'timeline', id, timeline });
  }

  async progress(id: string, text: string, timeline: ChatTimelineEmbed): Promise<void> {
    await this.replies.write({ kind: 'progress', id, text, timeline });
  }

  async todos(id: string, todos: ChatTodosEmbed): Promise<void> {
    await this.replies.write({ kind: 'todos', id, todos });
  }

  async finishReply(id: string, text: string, done: ReplyDone): Promise<AssistantMessageRow> {
    const row = await this.replies.write({ kind: 'finish', id, text, done });
    if (row === null) throw new ReplyRowMissingError(id);
    return row;
  }

  async failReply(id: string, failure: ReplyFailure, steps: readonly SettledStep[]): Promise<void> {
    await this.replies.write({ kind: 'fail', id, failure, steps });
  }

  originNote(chat: AiChatRow, origin: MessageOrigin): Promise<AssistantMessageRow> {
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
  ): Promise<AssistantMessageRow> {
    return this.add(noteMessage(chat, author, text, origin), []);
  }

  async noteIn(chatId: string, author: string, text: string): Promise<AssistantMessageRow> {
    const chat = await this.store.host.call('aiChats', 'chat', chatId);
    return await this.note(chat, author, text, null);
  }

  compaction(chat: AiChatRow, summary: string, through: string): Promise<AssistantMessageRow> {
    return this.add(
      {
        ...NO_EXTRAS,
        embeds: [COMPACTION_EMBED.parse({ kind: 'compaction', through_at: through })],
        profile_id: chat.profile_id,
        client_id: null,
        chat_id: chat.id,
        role: 'system',
        kind: 'update',
        author: this.assistantName(),
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

  async stateOf(
    messageId: string | null,
    state: AssistantRequestState,
    reason: string | null = null,
  ): Promise<void> {
    await this.replies.write({ kind: 'state', messageId, state, reason });
  }

  async failedMessage(
    messageId: string | null,
    reason: string,
    code: AssistantReasonCode,
  ): Promise<void> {
    await this.replies.write({ kind: 'failedMessage', messageId, reason, code });
  }

  async interrupted(reason: string): Promise<void> {
    await this.replies.write({ kind: 'interrupted', reason });
  }

  async delivered(eventId: string): Promise<void> {
    await this.replies.write({ kind: 'delivered', eventId });
  }

  async failed(
    event: StoredEvent,
    reason: string,
    code: AssistantReasonCode = 'unknown',
  ): Promise<void> {
    await this.replies.write({
      kind: 'failedEvent',
      eventId: event.id,
      messageId: event.message_id,
      reason,
      code,
    });
  }
}
