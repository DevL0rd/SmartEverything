import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type AiChatRow,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type AssistantOutFile,
  type AssistantPost,
  type AssistantReply,
  type MessageOrigin,
} from '@smarteverything/domain';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { ChatDirectory } from './chat-directory';
import type { ConversationLog } from './conversation-log';
import type { AssistantDelivery } from './delivery';
import type { AssistantFiles } from './files';
import { chatRequestText, voiceRequestText, type RequestSender } from './request-text';
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
  readonly settles: (event: StoredEvent) => boolean;
  readonly done: (event: StoredEvent, text: string, ok: boolean) => void;
}

function spokenText(task: VoiceTask, sender: RequestSender): string {
  const said = task.said === null ? '' : `\n\nIn their own words: "${task.said}"`;
  return `[Spoken by ${sender.profileName} in a voice call on ${task.device}; your final reply is read out loud, so keep it short and speakable, with no markdown] ${task.task}${said}`;
}

export class AssistantRequests {
  constructor(private readonly deps: RequestsDeps) {}

  send(sender: Sender, body: AssistantNewMessage, chat: AiChatRow): AssistantMessageRow {
    const files = this.ownFiles(sender.profileId, body.attachments);
    const from = this.sender(sender);
    const row = this.deps.conversation.person({
      chat,
      clientId: sender.clientId,
      author: from.profileName,
      text: body.text,
      files,
      origin: { source: 'app', plugin_id: null, device_id: null, name: null },
    });
    const eventId = randomUUID();
    this.deps.store.assistantEvents.add({
      id: eventId,
      kind: 'chat',
      chat_id: chat.id,
      message_id: row.id,
      profile_id: sender.profileId,
      client_id: sender.clientId,
      text: chatRequestText({
        eventId,
        sender: from,
        text: body.text,
        files: files.map((file) => ({ file, path: this.deps.files.pathOf(file) })),
      }),
    });
    this.deps.delivery().added();
    return row;
  }

  voice(task: VoiceTask & { readonly chatId: string }): string {
    const { store } = this.deps;
    const chat = store.aiChats.chat(task.chatId);
    const client =
      task.clientId === null ? store.clients.owner() : store.clients.byId(task.clientId);
    const sender: RequestSender = {
      profileName: store.profiles.byId(task.profileId).name,
      profileId: task.profileId,
      role: client?.role ?? 'owner',
      device: task.device,
    };
    const eventId = randomUUID();
    store.assistantEvents.add({
      id: eventId,
      kind: 'voice',
      chat_id: chat.id,
      message_id: task.callMessageId,
      profile_id: task.profileId,
      client_id: task.clientId,
      text:
        chat.engine.kind === 'openrouter'
          ? spokenText(task, sender)
          : voiceRequestText({ eventId, sender, task: task.task, said: task.said }),
    });
    this.deps.delivery().added();
    return eventId;
  }

  async reply(
    body: AssistantReply,
    local: boolean,
  ): Promise<{ messageId: string | null; delivered: boolean }> {
    const event = this.deps.store.assistantEvents.event(body.eventId);
    if (body.progress) {
      return { messageId: null, delivered: this.progress(event, body.text) };
    }
    const files = await Promise.all(
      body.files.map((file) => this.deps.files.fromResponder(event.profile_id, file, local)),
    );
    const row = this.deps.conversation.responderInChat({
      chat: this.deps.store.aiChats.chat(event.chat_id),
      replyTo: event.kind === 'voice' ? null : event.message_id,
      text: body.text,
      files,
    });
    this.deps.conversation.repliedTo(event.id);
    this.answered(event, body.text);
    return { messageId: row.id, delivered: true };
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
      body.files.map((file) => this.deps.files.fromResponder(profileId, file, local)),
    );
    return this.deps.conversation.responderInChat({
      chat,
      replyTo: null,
      text: body.text,
      files,
      kind: 'update',
    });
  }

  turn(chat: AiChatRow, text: string, origin: MessageOrigin): string {
    const eventId = randomUUID();
    const note = this.deps.conversation.originNote(chat, origin);
    this.deps.store.assistantEvents.add({
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

  async inbound(turn: InboundTurn): Promise<string> {
    const files = await Promise.all(
      turn.files.map((file) => this.deps.files.fromResponder(turn.chat.profile_id, file, true)),
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
    this.deps.store.assistantEvents.add({
      id: eventId,
      kind: 'plugin',
      chat_id: turn.chat.id,
      message_id: row.id,
      profile_id: turn.chat.profile_id,
      client_id: null,
      text: turn.engineText,
    });
    this.deps.delivery().added();
    return eventId;
  }

  finished(event: StoredEvent, text: string, ok: boolean): void {
    this.deps.store.assistantEvents.mark(event.id, 'answered_at');
    if (event.kind === 'voice') {
      this.deps.voiceResult()?.(event.id, text, false);
    }
    this.deps.done(event, text, ok);
  }

  private progress(event: StoredEvent, text: string): boolean {
    this.deps.conversation.step(event.id, text);
    return event.kind === 'voice'
      ? (this.deps.voiceResult()?.(event.id, text, true) ?? false)
      : true;
  }

  private answered(event: StoredEvent, text: string): void {
    this.finished(event, text, true);
    if (this.deps.settles(event)) {
      this.deps.conversation.settled(event.id);
    }
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

  private sender(sender: Sender): RequestSender {
    const { store } = this.deps;
    const client = store.clients.byId(sender.clientId);
    return {
      profileName: store.profiles.byId(sender.profileId).name,
      profileId: sender.profileId,
      role: client.role,
      device: client.name,
    };
  }
}
