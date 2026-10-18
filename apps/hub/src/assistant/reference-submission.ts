import {
  ApiError,
  type AiChatRow,
  type AiEdit,
  type AssistantMessageRow,
  type AssistantNewMessage,
} from '@smarteverything/domain';
import { effectiveClientById } from '../server/person-access';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { ReferenceService } from '../references/service';
import type { ChatDirectory } from './chat-directory';
import type { AssistantRequests, Sender, RequestsDeps } from './requests';
import type { EngineRegistry } from './engines/registry';

export type ReplayActor =
  string | null | { readonly clientId: string | null; readonly caller: Caller };
export function replayClient(actor: ReplayActor | undefined): string | null | undefined {
  return typeof actor === 'object' && actor !== null ? actor.clientId : actor;
}
interface ReferenceSubmissionDeps {
  readonly store: Store;
  readonly references: ReferenceService;
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
  readonly requests: AssistantRequests;
}
export class ReferenceSubmissions {
  constructor(private readonly deps: ReferenceSubmissionDeps) {}
  plain(sender: Sender, body: AssistantNewMessage, chatId?: string): AssistantMessageRow {
    if ((body.references?.length ?? 0) > 0)
      throw new ApiError(
        'conflict',
        'Structured references require authenticated reference submission.',
      );
    return this.deps.requests.send(sender, body, this.chat(sender, chatId));
  }
  async send(
    caller: Caller,
    sender: Sender,
    body: AssistantNewMessage,
    chatId?: string,
  ): Promise<AssistantMessageRow> {
    if ((body.references?.length ?? 0) === 0) return this.plain(sender, body, chatId);
    const chat = this.chat(sender, chatId);
    const sent =
      body.client_message_id === undefined
        ? undefined
        : this.deps.store.assistantSearch.byClientMessageId(chat.id, body.client_message_id);
    if (sent !== undefined) return sent;
    const references = await this.deps.references.resolve(
      caller,
      chat.id,
      body.text,
      body.references ?? [],
    );
    return this.deps.requests.send(sender, { ...body, references }, this.chat(sender, chat.id));
  }
  private chat(sender: Sender, chatId: string | undefined): AiChatRow {
    const owner = {
      profileId: sender.profileId,
      role: effectiveClientById(this.deps.store, sender.clientId).role,
    };
    const chat =
      chatId === undefined
        ? this.deps.chats.defaultChat(sender.profileId)
        : this.deps.chats.own(owner, chatId);
    this.deps.store.aiChats.assertWorkAllowed(chat.id);
    this.deps.engines.forMutation(chat, owner.role);
    return chat;
  }
  async replay(
    actor: ReplayActor | undefined,
    chat: AiChatRow,
    message: AssistantMessageRow,
  ): Promise<void> {
    await this.resolve(actor, chat, { text: message.text, references: message.references ?? [] });
  }
  async edit(
    actor: ReplayActor | undefined,
    chat: AiChatRow,
    message: AssistantMessageRow,
    body: AiEdit,
  ): Promise<AiEdit> {
    if (message.chat_id !== chat.id)
      throw new ApiError('invalid_request', 'That message does not belong to this chat.');
    const references = body.references ?? message.references ?? [];
    await this.resolve(actor, chat, { text: body.text, references });
    return { ...body, references };
  }
  private async resolve(
    actor: ReplayActor | undefined,
    chat: AiChatRow,
    input: {
      readonly text: string;
      readonly references: NonNullable<AssistantMessageRow['references']>;
    },
  ): Promise<void> {
    if (input.references.length === 0) return;
    if (typeof actor !== 'object' || actor === null)
      throw new ApiError('conflict', 'Reference replay requires its current authenticated actor.');
    await this.deps.references.resolve(actor.caller, chat.id, input.text, input.references);
  }
}

export function referenceSubmissions(
  deps: Pick<RequestsDeps, 'store' | 'chats'>,
  references: ReferenceService,
  engines: EngineRegistry,
  requests: AssistantRequests,
): ReferenceSubmissions {
  return new ReferenceSubmissions({
    store: deps.store,
    chats: deps.chats,
    references,
    engines,
    requests,
  });
}
