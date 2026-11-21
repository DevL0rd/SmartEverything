import {
  type AiChatRow,
  type AiEdit,
  type AiRetryFrom,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { EngineRegistry } from './engines/registry';
import { mutableChat } from './remove-messages';
import { replayClient, type ReferenceSubmissions, type ReplayActor } from './reference-submission';
import type { AssistantRequests } from './requests';

export interface MessageEditPorts {
  readonly store: Store;
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
  readonly submissions: ReferenceSubmissions;
  readonly requests: AssistantRequests;
}

interface MessageTarget {
  readonly chatId: string;
  readonly messageId: string;
}

export class MessageEdits {
  constructor(private readonly ports: MessageEditPorts) {}

  async retry(
    owner: ChatOwner,
    target: MessageTarget,
    from: AiRetryFrom,
    actor?: ReplayActor,
  ): Promise<AssistantMessageRow> {
    const chat = await mutableChat(this.ports.chats, this.ports.engines, owner, target.chatId);
    return await this.ports.requests.retry(chat, target.messageId, from, replayClient(actor));
  }

  async edit(
    owner: ChatOwner,
    target: MessageTarget,
    body: AiEdit,
    actor?: ReplayActor,
  ): Promise<AssistantMessageRow> {
    const { requests, submissions, store } = this.ports;
    const chat = await mutableChat(this.ports.chats, this.ports.engines, owner, target.chatId);
    const message = await store.host.call('assistantChat', 'message', target.messageId);
    const changed = await submissions.edit(actor, chat, message, body);
    if (message.chat_id === chat.id && (message.state === 'answered' || message.state === 'failed'))
      await this.rewriteAsked(owner, chat, message, changed);
    return requests.edit(chat, target.messageId, changed, replayClient(actor));
  }

  private async rewriteAsked(
    owner: ChatOwner,
    chat: AiChatRow,
    message: AssistantMessageRow,
    edit: AiEdit,
  ): Promise<void> {
    await this.ports.requests.assertReplay(chat, message.id, edit);
    const engine = this.ports.engines.forMutation(chat, owner.role);
    await engine?.historyChanged(chat, owner);
    await engine?.historyRemoved?.(chat, [
      message,
      ...(await this.ports.store.host.call('assistantChat', 'repliesTo', message.id)),
    ]);
  }
}
