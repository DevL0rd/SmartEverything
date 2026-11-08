import { assertOrdinaryMessageKey } from './delegation/helper-dialogue';
import {
  ApiError,
  type AiChatRow,
  type AiEdit,
  type AssistantMessageRow,
  type AssistantNewMessage,
} from '@smarteverything/domain';
import { effectiveClientById } from '../server/person-access';
import { chatOwnerOf, directClient, type Caller } from '../server/auth';
import type { Delegation } from './delegation/delegation';
import type { Store } from '../store/store';
import type { ReferenceService } from '../references/service';
import type { ChatDirectory } from './chat-directory';
import type { AssistantRequests, RequestsDeps, Sender } from './requests';
import type { EngineRegistry } from './engines/registry';

export type ReplayActor =
  string | null | { readonly clientId: string | null; readonly caller: Caller };
export function replayClient(actor: ReplayActor | undefined): string | null | undefined {
  return typeof actor === 'object' && actor !== null ? actor.clientId : actor;
}

interface ReferenceSubmissionDeps extends Pick<RequestsDeps, 'files'> {
  readonly store: Store;
  readonly references: ReferenceService;
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
  readonly requests: AssistantRequests;
  readonly delegation: Pick<Delegation, 'sendToHelper'>;
}
export class ReferenceSubmissions {
  constructor(private readonly deps: ReferenceSubmissionDeps) {}
  plain(sender: Sender, body: AssistantNewMessage, chatId?: string): AssistantMessageRow {
    if (body.helper_target !== undefined)
      throw new ApiError('forbidden', 'Address a helper from its conversation in the app.');
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
    if (body.helper_target !== undefined) return this.sendToHelper(caller, sender, body, chatId);
    if ((body.references?.length ?? 0) === 0) return this.plain(sender, body, chatId);
    const chat = this.chat(sender, chatId);
    assertOrdinaryMessageKey(this.deps.store, chat, body.client_message_id);
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
  private sendToHelper(
    caller: Caller,
    sender: Sender,
    body: AssistantNewMessage,
    chatId: string | undefined,
  ): Promise<AssistantMessageRow> {
    if (chatId === undefined)
      throw new ApiError('invalid_request', 'Select the conversation containing this helper.');
    if (directClient(caller)?.id !== sender.clientId)
      throw new ApiError('forbidden', 'Address a helper from its conversation in the app.');
    const owner = chatOwnerOf(this.deps.store, caller);
    if (
      owner.profileId !== sender.profileId ||
      this.deps.store.profiles.activeOf(sender.clientId).id !== sender.profileId
    )
      throw new ApiError('forbidden', 'Use the active conversation profile to address a helper.');
    const chat = this.deps.chats.own(owner, chatId);
    return this.deps.delegation.sendToHelper(sender, chat, body, {
      engines: this.deps.engines,
      files: this.deps.files,
    });
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
