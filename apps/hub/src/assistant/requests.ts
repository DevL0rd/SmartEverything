import { ReferenceSubmissions } from './reference-submission';
import type { Delegation } from './delegation/delegation';
import { MessageReplay } from './message-replay';
import { admitChatExecution } from './native-helpers';
import { queueEvent, queuedLog } from './request-events';
import type { ReferenceService } from '../references/service';
import type { EngineRegistry } from './engines/registry';
import { outputAuthority } from './turn-authority';
import { authorityScope, eventAuthority } from './turn-authority';
import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import {
  type AiChatRow,
  type AiEdit,
  type AiRetryFrom,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type AssistantOutFile,
  type AssistantPost,
  type MessageOrigin,
} from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import { personMessage, type ConversationLog } from './conversation-log';
import type { SentMessage } from './store-units';
import { quoteForChat } from './message-quote';
import type { SendInputs } from './send-inputs';
import type { AssistantDelivery } from './delivery';
import type { AssistantFiles } from './files';
import type { VoiceResultHandler, VoiceTask } from './voice-link';
import type { TurnRequest } from './service-contract';

export interface Sender {
  readonly clientId: string;
  readonly profileId: string;
}

export interface InboundTurn {
  readonly chat: AiChatRow;
  readonly author: string;
  readonly text: string;
  readonly files: readonly AssistantOutFile[];
  readonly engineText: string;
  readonly origin: MessageOrigin;
}

export interface RequestsDeps {
  readonly store: Store;
  readonly files: AssistantFiles;
  readonly chats: ChatDirectory;
  readonly conversation: ConversationLog;
  readonly delivery: () => AssistantDelivery;
  readonly voiceResult: () => VoiceResultHandler | null;
  readonly done: (event: StoredEvent, text: string, ok: boolean) => void;
}

function spokenText(task: VoiceTask, profileName: string): string {
  const said = task.said === null ? '' : `\n\nIn their own words: "${task.said}"`;
  return `[Spoken by ${profileName} in a voice call on ${task.device}; your final reply is read out loud, so keep it short and speakable, with no markdown] ${task.task}${said}`;
}

const log = new Logger('hub.assistant');

export class AssistantRequests {
  private readonly replay: MessageReplay;
  constructor(private readonly deps: RequestsDeps) {
    this.replay = new MessageReplay(deps);
  }

  referenceSubmissions(
    references: ReferenceService,
    engines: EngineRegistry,
    delegation: Pick<Delegation, 'sendToHelper'>,
  ): ReferenceSubmissions {
    return new ReferenceSubmissions({
      ...this.deps,
      references,
      engines,
      requests: this,
      delegation,
    });
  }

  async send(
    sender: Sender,
    body: AssistantNewMessage,
    chat: AiChatRow,
  ): Promise<AssistantMessageRow> {
    const { store } = this.deps;
    const inputs = await store.host.read('assistantSendInputs', {
      chat,
      profileId: sender.profileId,
      clientMessageId: body.client_message_id,
      quoteMessageId: body.quote_message_id,
      attachments: body.attachments,
    });
    if (inputs.known !== null) return this.duplicate(sender, inputs.known);
    admitChatExecution(chat);
    const sent = await this.accept(sender, body, chat, inputs);
    if (sent.duplicate) return this.duplicate(sender, sent.row);
    queuedLog(sent.event, 'derived');
    log.debug('request.accepted', {
      chatId: chat.id,
      messageId: sent.row.id,
      profileId: sender.profileId,
      clientId: sender.clientId,
      textLength: body.text.length,
      attachments: body.attachments.length,
      references: body.references?.length ?? 0,
    });
    this.deps.delivery().added();
    return sent.row;
  }

  private duplicate(sender: Sender, sent: AssistantMessageRow): AssistantMessageRow {
    log.debug('request.duplicate_ignored', {
      chatId: sent.chat_id,
      messageId: sent.id,
      profileId: sender.profileId,
      clientId: sender.clientId,
    });
    return sent;
  }

  private accept(
    sender: Sender,
    body: AssistantNewMessage,
    chat: AiChatRow,
    inputs: Extract<SendInputs, { known: null }>,
  ): Promise<SentMessage> {
    const { store } = this.deps;
    const { files } = inputs;
    const key = body.client_message_id ?? null;
    const row = personMessage({
      chat,
      clientId: sender.clientId,
      author: inputs.author,
      text: body.text,
      files,
      ...(body.references === undefined ? {} : { references: body.references }),
      quote: inputs.quote,
      origin: { source: 'app', plugin_id: null, device_id: null, name: null },
      ...(body.client_message_id === undefined ? {} : { clientMessageId: body.client_message_id }),
    });
    store.live.chatWork.holds.assertQueued(chat.id);
    const ids = files.map((file) => file.id);
    return store.live.attachments.attach(ids, () =>
      store.host.write('assistantMessageSend', {
        message: { row, files: ids },
        clientMessageId: key,
        event: {
          id: randomUUID(),
          kind: 'chat',
          chat_id: chat.id,
          profile_id: sender.profileId,
          client_id: sender.clientId,
          text: body.text,
        },
        scope: authorityScope(),
      }),
    );
  }

  retry(
    chat: AiChatRow,
    messageId: string,
    from: AiRetryFrom,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    return this.replay.retry(chat, messageId, from, clientId);
  }

  edit(
    chat: AiChatRow,
    messageId: string,
    body: AiEdit,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    return this.replay.edit(chat, messageId, body, clientId);
  }

  assertReplay(chat: AiChatRow, messageId: string, edit?: AiEdit): void {
    this.replay.assertReplay(chat, messageId, edit);
  }

  voice(task: VoiceTask & { readonly chatId: string }): string {
    const { store } = this.deps;
    const chat = store.aiChats.chat(task.chatId);
    admitChatExecution(chat);
    const eventId = randomUUID();
    this.queued({
      id: eventId,
      kind: 'voice',
      chat_id: chat.id,
      message_id: task.callMessageId,
      profile_id: task.profileId,
      client_id: task.clientId,
      text: spokenText(task, store.profiles.byId(task.profileId).name),
    });
    this.deps.delivery().added();
    return eventId;
  }

  async post(
    body: AssistantPost,
    local: boolean,
    ownerProfile: () => string,
    actor: ChatOwner,
  ): Promise<AssistantMessageRow> {
    const { profileId, chat } = this.deps.chats.postTarget(actor, body, ownerProfile);
    admitChatExecution(chat);
    const quote = quoteForChat(this.deps.store, chat, body.quoteMessageId);
    log.debug('request.post_received', {
      chatId: chat.id,
      profileId,
      files: body.files.length,
      textLength: body.text.length,
      local,
    });
    const files = await Promise.all(
      body.files.map((file) =>
        this.deps.files.fromOutFile(profileId, file, {
          local,
          chatId: chat.id,
          authorize: outputAuthority(this.deps.store, chat.id),
        }),
      ),
    );
    return this.deps.conversation.responderInChat({
      chat,
      replyTo: null,
      text: body.text,
      files,
      kind: 'update',
      quote,
    });
  }

  previewError(
    id: string,
    scope: { readonly chatId: string; readonly profileId: string; readonly clientId: string },
    text: string,
  ): void {
    const added = this.deps.store.write(() => {
      if (this.deps.store.assistantEvents.find(id) !== undefined) return false;
      admitChatExecution(this.deps.store.aiChats.chat(scope.chatId));
      this.deps.store.live.chatWork.holds.assertQueued(scope.chatId);
      const event = this.deps.store.assistantEvents.add({
        id,
        kind: 'wake',
        chat_id: scope.chatId,
        message_id: null,
        profile_id: scope.profileId,
        client_id: scope.clientId,
        text,
      });
      eventAuthority(this.deps.store, event);
      return true;
    });
    log.debug('request.preview_error_queued', { eventId: id, chatId: scope.chatId, added });
    if (added) this.deps.delivery().added();
  }

  runTurn(input: TurnRequest): { chatId: string; eventId: string } {
    const chat = this.deps.chats.forTurn(input.profileId, input.chatId, input.title);
    log.debug('turn.requested', {
      chatId: chat.id,
      profileId: input.profileId,
      textLength: input.text.length,
      source: input.origin.source,
      newChat: input.chatId === undefined,
    });
    return { chatId: chat.id, eventId: this.turn(chat, input.text, input.origin) };
  }

  turn(chat: AiChatRow, text: string, origin: MessageOrigin): string {
    admitChatExecution(chat);
    const eventId = randomUUID();
    const note = this.deps.conversation.originNote(chat, origin);
    this.queued({
      id: eventId,
      kind: 'wake',
      chat_id: chat.id,
      message_id: note.id,
      profile_id: chat.profile_id,
      client_id: null,
      text,
    });
    this.deps.delivery().added();
    return eventId;
  }

  async inbound(turn: InboundTurn): Promise<{ eventId: string; messageId: string }> {
    admitChatExecution(turn.chat);
    log.debug('request.inbound_received', {
      chatId: turn.chat.id,
      profileId: turn.chat.profile_id,
      files: turn.files.length,
      textLength: turn.text.length,
      source: turn.origin.source,
    });
    const files = await Promise.all(
      turn.files.map((file) =>
        this.deps.files.fromOutFile(turn.chat.profile_id, file, {
          local: true,
          chatId: turn.chat.id,
          authorize: outputAuthority(this.deps.store, turn.chat.id),
        }),
      ),
    );
    const row = personMessage({
      chat: turn.chat,
      clientId: null,
      author: turn.author.slice(0, 120),
      text: turn.text,
      files,
      origin: turn.origin,
    });
    const { store } = this.deps;
    store.live.chatWork.holds.assertQueued(turn.chat.id);
    const ids = files.map((file) => file.id);
    const added = await store.live.attachments.attach(ids, () =>
      store.host.write('assistantMessageEvent', {
        message: { row, files: ids },
        event: {
          id: randomUUID(),
          kind: 'plugin',
          chat_id: turn.chat.id,
          profile_id: turn.chat.profile_id,
          client_id: null,
          text: turn.engineText,
        },
        scope: authorityScope(),
      }),
    );
    queuedLog(added.event, 'derived');
    this.deps.delivery().added();
    return { eventId: added.event.id, messageId: added.row.id };
  }

  finished(event: StoredEvent, text: string, ok: boolean): void {
    log.info('request.finished', {
      eventId: event.id,
      kind: event.kind,
      chatId: event.chat_id,
      profileId: event.profile_id,
      ok,
      replyLength: text.length,
    });
    if (!ok) this.deps.store.aiRepairInbox.markFailed(event.id);
    this.deps.store.assistantEvents.mark(event.id, 'answered_at');
    if (event.kind === 'voice') {
      this.deps.voiceResult()?.(event.id, text, false);
    }
    this.deps.done(event, text, ok);
  }

  private queued(
    input: Parameters<Store['assistantEvents']['add']>[0],
    source?: ConversationAuthority,
  ): StoredEvent {
    return queueEvent(this.deps.store, input, source);
  }
}
