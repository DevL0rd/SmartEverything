import { outputAuthority } from './output-authority';
import { issueEventAuthority, eventAuthority } from './execution-authority';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type AiChatRow,
  type AiEdit,
  type AiRetryFrom,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type AssistantOutFile,
  type AssistantPost,
  type MessageOrigin,
} from '@smarteverything/domain';
import {
  summaryOf,
  type AssistantMessageChange,
  type StoredAttachment,
} from '../store/repositories/assistant-chat';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { ChatDirectory } from './chat-directory';
import type { ConversationLog } from './conversation-log';
import type { AssistantDelivery } from './delivery';
import type { AssistantFiles } from './files';
import type { VoiceResultHandler, VoiceTask } from './voice-link';

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

interface FileReplacement {
  readonly kept: StoredAttachment[];
  readonly removed: StoredAttachment[];
}

const KEPT_FILES: FileReplacement = { kept: [], removed: [] };

interface Rearmed {
  readonly row: AssistantMessageRow;
  readonly files: readonly StoredAttachment[];
  readonly queued: boolean;
}

export class AssistantRequests {
  constructor(private readonly deps: RequestsDeps) {}

  send(sender: Sender, body: AssistantNewMessage, chat: AiChatRow): AssistantMessageRow {
    const { store } = this.deps;
    const sent =
      body.client_message_id === undefined
        ? undefined
        : store.assistantSearch.byClientMessageId(chat.id, body.client_message_id);
    if (sent !== undefined) {
      return sent;
    }
    const row = store.write(() => this.accept(sender, body, chat));
    this.deps.delivery().added();
    return row;
  }

  private accept(sender: Sender, body: AssistantNewMessage, chat: AiChatRow): AssistantMessageRow {
    const { store } = this.deps;
    const files = this.ownFiles(sender.profileId, body.attachments);
    const row = this.deps.conversation.person({
      chat,
      clientId: sender.clientId,
      author: store.profiles.byId(sender.profileId).name,
      text: body.text,
      files,
      origin: { source: 'app', plugin_id: null, device_id: null, name: null },
      ...(body.client_message_id === undefined ? {} : { clientMessageId: body.client_message_id }),
    });
    this.queued(
      {
        id: randomUUID(),
        kind: 'chat',
        chat_id: chat.id,
        message_id: row.id,
        profile_id: sender.profileId,
        client_id: sender.clientId,
        text: body.text,
      },
      false,
    );
    store.aiChats.update(chat.id, { read: true });
    return row;
  }

  async retry(
    chat: AiChatRow,
    messageId: string,
    from: AiRetryFrom,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    return this.replayed(() => this.rearm(chat, messageId, from, clientId));
  }

  async edit(
    chat: AiChatRow,
    messageId: string,
    body: AiEdit,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    return this.replayed(() => this.reword(chat, messageId, body, clientId));
  }

  private async replayed(work: () => Rearmed): Promise<AssistantMessageRow> {
    const { row, files, queued } = this.deps.store.write(work);
    await this.deps.files.remove(files);
    if (queued) {
      this.deps.delivery().added();
    }
    return row;
  }

  private rearm(
    chat: AiChatRow,
    messageId: string,
    from: AiRetryFrom,
    clientId: string | null | undefined,
  ): Rearmed {
    const { message, event } = this.askedMessage(chat, messageId);
    if (message.state !== from) {
      return { row: message, files: [], queued: false };
    }
    this.requireLatest(chat, message, 'retried');
    return this.replay(chat, { message, event }, {}, clientId);
  }

  private reword(
    chat: AiChatRow,
    messageId: string,
    body: AiEdit,
    clientId: string | null | undefined,
  ): Rearmed {
    const { message, event } = this.askedMessage(chat, messageId);
    if (message.origin !== null && message.origin.source !== 'app') {
      throw new ApiError('invalid_request', 'Only a message written in the app can be edited.');
    }
    if (message.state !== 'answered' && message.state !== 'failed') {
      throw new ApiError('conflict', 'Wait for the AI to finish, or stop it, before editing.');
    }
    this.requireLatest(chat, message, 'edited');
    const replaced =
      body.attachments === undefined ? KEPT_FILES : this.replaceFiles(message, body.attachments);
    const change: AssistantMessageChange = {
      text: body.text,
      ...(body.attachments === undefined ? {} : { attachments: replaced.kept.map(summaryOf) }),
    };
    const done = this.replay(chat, { message, event }, change, clientId);
    return { ...done, files: [...done.files, ...replaced.removed] };
  }

  private replaceFiles(message: AssistantMessageRow, ids: readonly string[]): FileReplacement {
    const { assistantChat } = this.deps.store;
    const kept = this.ownFiles(message.profile_id, ids);
    const removed = assistantChat.attachmentsOf(message.id);
    assistantChat.removeAttachments(removed.map((file) => file.id));
    assistantChat.attachTo(
      message.id,
      kept.map((file) => file.id),
    );
    return { kept, removed };
  }

  private askedMessage(
    chat: AiChatRow,
    messageId: string,
  ): { readonly message: AssistantMessageRow; readonly event: StoredEvent } {
    const { assistantChat: messages, assistantEvents: events } = this.deps.store;
    const message = messages.message(messageId);
    const event = events.ofMessage(messageId);
    if (message.chat_id !== chat.id || message.role !== 'person' || event === undefined) {
      throw new ApiError(
        'invalid_request',
        'Only a message of a person that the AI was asked about can be retried or edited.',
      );
    }
    return { message, event };
  }

  assertReplay(chat: AiChatRow, messageId: string, edit?: AiEdit): void {
    const { message } = this.askedMessage(chat, messageId);
    this.requireLatest(chat, message, 'changed');
    if (edit !== undefined && message.origin !== null && message.origin.source !== 'app')
      throw new ApiError('invalid_request', 'Only an app message can be edited.');
    if (edit?.attachments !== undefined) this.ownFiles(message.profile_id, edit.attachments);
  }

  private requireLatest(chat: AiChatRow, message: AssistantMessageRow, verb: string): void {
    if (this.deps.store.assistantChat.latestPersonText(chat.id)?.id !== message.id) {
      throw new ApiError('conflict', `Only the latest message of a chat can be ${verb}.`);
    }
  }

  private replay(
    chat: AiChatRow,
    asked: { readonly message: AssistantMessageRow; readonly event: StoredEvent },
    change: AssistantMessageChange,
    clientId: string | null | undefined,
  ): Rearmed {
    const { message, event } = asked;
    const original = eventAuthority(this.deps.store, event);
    const { assistantChat: messages } = this.deps.store;
    const files = messages.removeMessages(messages.repliesTo(message.id).map((reply) => reply.id));
    const row = messages.updateMessage(message.id, {
      ...change,
      state: 'queued',
      reason: null,
      reason_code: null,
    });
    this.queued(
      {
        id: randomUUID(),
        kind: event.kind,
        chat_id: chat.id,
        message_id: message.id,
        profile_id: event.profile_id,
        client_id: clientId === undefined ? event.client_id : clientId,
        text: change.text ?? event.text,
        report_to: event.report_to,
        hops: event.hops,
      },
      original.kind === 'service',
      original,
    );

    return { row, files, queued: true };
  }

  voice(task: VoiceTask & { readonly chatId: string }): string {
    const { store } = this.deps;
    const chat = store.aiChats.chat(task.chatId);
    const eventId = randomUUID();
    this.queued(
      {
        id: eventId,
        kind: 'voice',
        chat_id: chat.id,
        message_id: task.callMessageId,
        profile_id: task.profileId,
        client_id: task.clientId,
        text: spokenText(task, store.profiles.byId(task.profileId).name),
      },
      true,
    );
    this.deps.delivery().added();
    return eventId;
  }

  async post(
    body: AssistantPost,
    local: boolean,
    ownerProfile: () => string,
  ): Promise<AssistantMessageRow> {
    const profileId = body.profileId ?? ownerProfile();
    if (!this.deps.store.profiles.list().some((profile) => profile.id === profileId)) {
      throw new ApiError(
        'invalid_request',
        'There is no person with that profileId; take it from list_people, or leave it out for the owner.',
      );
    }
    const chat = this.deps.chats.defaultChat(profileId);
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
    });
  }

  previewError(
    id: string,
    scope: { readonly chatId: string; readonly profileId: string; readonly clientId: string },
    text: string,
  ): void {
    const added = this.deps.store.write(() => {
      if (this.deps.store.assistantEvents.find(id) !== undefined) return false;
      const event = this.deps.store.assistantEvents.add({
        id,
        kind: 'wake',
        chat_id: scope.chatId,
        message_id: null,
        profile_id: scope.profileId,
        client_id: scope.clientId,
        text,
      });
      issueEventAuthority(this.deps.store, event, false);
      return true;
    });
    if (added) this.deps.delivery().added();
  }

  turn(chat: AiChatRow, text: string, origin: MessageOrigin): string {
    const eventId = randomUUID();
    const note = this.deps.conversation.originNote(chat, origin);
    this.queued(
      {
        id: eventId,
        kind: 'wake',
        chat_id: chat.id,
        message_id: note.id,
        profile_id: chat.profile_id,
        client_id: null,
        text,
      },
      true,
    );
    this.deps.delivery().added();
    return eventId;
  }

  async inbound(turn: InboundTurn): Promise<{ eventId: string; messageId: string }> {
    const files = await Promise.all(
      turn.files.map((file) =>
        this.deps.files.fromOutFile(turn.chat.profile_id, file, {
          local: true,
          chatId: turn.chat.id,
          authorize: outputAuthority(this.deps.store, turn.chat.id),
        }),
      ),
    );
    const row = this.deps.conversation.person({
      chat: turn.chat,
      clientId: null,
      author: turn.author.slice(0, 120),
      text: turn.text,
      files,
      origin: turn.origin,
    });
    const eventId = randomUUID();
    this.queued(
      {
        id: eventId,
        kind: 'plugin',
        chat_id: turn.chat.id,
        message_id: row.id,
        profile_id: turn.chat.profile_id,
        client_id: null,
        text: turn.engineText,
      },
      true,
    );
    this.deps.delivery().added();
    return { eventId, messageId: row.id };
  }

  finished(event: StoredEvent, text: string, ok: boolean): void {
    this.deps.store.assistantEvents.mark(event.id, 'answered_at');
    if (event.kind === 'voice') {
      this.deps.voiceResult()?.(event.id, text, false);
    }
    this.deps.done(event, text, ok);
  }

  private queued(
    input: Parameters<Store['assistantEvents']['add']>[0],
    service: boolean,
    source?: ConversationAuthority,
  ): StoredEvent {
    return this.deps.store.write(() => {
      const event = this.deps.store.assistantEvents.add(input);
      issueEventAuthority(this.deps.store, event, service, source);
      return event;
    });
  }
  private ownFiles(profileId: string, ids: readonly string[]): StoredAttachment[] {
    return ids.map((id) => {
      const file = this.deps.store.assistantChat.attachment(id);
      if (file.profile_id !== profileId || file.message_id !== null) {
        throw new ApiError(
          'invalid_request',
          `The attachment ${id} is not an unsent upload of yours.`,
        );
      }
      return file;
    });
  }
}
