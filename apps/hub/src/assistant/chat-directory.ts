import type { ProjectFilesService } from '../projects/service';
import {
  NEW_CHAT_TITLE,
  ApiError,
  assistantLabel,
  type AiChatChangeRequest,
  type AiChatHit,
  type AiChatNew,
  type AiChatRow,
  type AiChatSearch,
  type AssistantPost,
  type Role,
  type Engine,
  type EngineRequest,
} from '@smarteverything/domain';
import { NothingToMarkUnreadError } from '../store/repositories/ai-chats';
import type { Store } from '../store/store';
import { snippetOf } from './chat-snippet';
import type { AssistantFiles } from './files';
import type { StoredAttachment } from '../store/repositories/assistant-files';
import { admitChatEngineChange, admitChatExecution, admitNativeEngine } from './native-helpers';
import { completeEngine, defaultEngine, meteredCatalogue } from '../openrouter/metered-engine';

const CONVERSATION_SOURCE = 'conversation';
export const REPAIR_CHAT_SOURCE = 'repair:server\0hub:service';

export interface ChatOwner {
  readonly profileId: string;
  readonly role: Role;
  readonly confinedTo?: string | null;
}

export interface CallPlace {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly device: string;
}

export function reachesChat(
  store: Pick<Store, 'aiChats'>,
  confinedTo: string | null | undefined,
  chat: AiChatRow,
): boolean {
  if (confinedTo === undefined) return true;
  for (let at: AiChatRow | undefined = chat; at !== undefined;) {
    if (at.id === confinedTo) return true;
    at = at.parent_id === null ? undefined : store.aiChats.chat(at.parent_id);
  }
  return false;
}

export function ownedChat(
  store: Pick<Store, 'aiChats'>,
  owner: ChatOwner,
  chatId: string,
): AiChatRow {
  const chat = store.aiChats.chat(chatId);
  if (chat.profile_id !== owner.profileId || !reachesChat(store, owner.confinedTo, chat))
    throw new ApiError('forbidden', 'That chat belongs to someone else.');
  return chat;
}

export function ownedAttachment(
  store: Pick<Store, 'aiChats' | 'assistantChat'>,
  owner: ChatOwner,
  id: string,
): StoredAttachment {
  const file = store.assistantChat.attachment(id);
  if (file.profile_id !== owner.profileId)
    throw new ApiError('forbidden', 'That file belongs to someone else’s chat.');
  if (file.message_id !== null)
    ownedChat(store, owner, store.assistantChat.message(file.message_id).chat_id);
  else if (owner.confinedTo !== undefined)
    throw new ApiError('forbidden', 'That file belongs to someone else’s chat.');
  return file;
}

export class ChatDirectory {
  constructor(
    private readonly store: Store,
    private readonly files: AssistantFiles,
    private readonly selections?: {
      readonly projects?: ProjectFilesService;
      readonly validate: (engine: Engine, user: Pick<ChatOwner, 'profileId' | 'role'>) => void;
      readonly validateStandalone?: (engine: Engine, user: ChatOwner) => void;
    },
  ) {}

  complete(profileId: string, request: EngineRequest): Engine {
    return completeEngine(profileId, request, meteredCatalogue(this.store));
  }

  own(owner: ChatOwner, chatId: string): AiChatRow {
    return ownedChat(this.store, owner, chatId);
  }

  validateEngine(engine: Engine, owner: Pick<ChatOwner, 'profileId' | 'role'>): void {
    this.selections?.validate(engine, owner);
  }

  validateStandalone(engine: Engine, owner: ChatOwner): void {
    if (this.selections?.validateStandalone === undefined)
      throw new ApiError('conflict', 'Computer AI engines are starting.');
    this.selections.validateStandalone(engine, owner);
  }

  visible(owner: ChatOwner, chats: readonly AiChatRow[]): AiChatRow[] {
    return chats.filter((chat) => reachesChat(this.store, owner.confinedTo, chat));
  }

  attachment(owner: ChatOwner, id: string): StoredAttachment {
    return ownedAttachment(this.store, owner, id);
  }

  postTarget(
    actor: ChatOwner,
    body: AssistantPost,
    ownerProfile: () => string,
  ): { readonly profileId: string; readonly chat: AiChatRow } {
    if (actor.role === 'owner') {
      const profileId = body.profileId ?? ownerProfile();
      this.requirePerson(profileId);
      return { profileId, chat: this.defaultChat(profileId) };
    }
    if (body.profileId !== undefined && body.profileId !== actor.profileId)
      throw new ApiError('forbidden', 'You can post only to your own chat.');
    for (const file of body.files) if ('uploadId' in file) this.attachment(actor, file.uploadId);
    return { profileId: actor.profileId, chat: this.chatOf(actor) };
  }

  private requirePerson(profileId: string): void {
    if (!this.store.profiles.list().some((profile) => profile.id === profileId))
      throw new ApiError(
        'invalid_request',
        'There is no person with that profileId; take it from person_read, or leave it out for the owner.',
      );
  }

  chatOf(owner: ChatOwner): AiChatRow {
    if (owner.confinedTo === undefined) return this.defaultChat(owner.profileId);
    if (owner.confinedTo === null)
      throw new ApiError('forbidden', 'This request has no chat of its own to work in.');
    return this.own(owner, owner.confinedTo);
  }

  private newChatEngine(profileId: string): Engine {
    const engine = defaultEngine(this.store, profileId);
    if (engine.kind !== 'dsh')
      throw new ApiError(
        'conflict',
        'Choose a SmartEverything model for new chats in Assistant settings.',
      );
    return engine;
  }

  defaultChat(profileId: string): AiChatRow {
    return (
      this.store.aiChats.latest(profileId) ??
      this.store.aiChats.create({
        profileId,
        kind: 'chat',
        title: NEW_CHAT_TITLE,
        icon: null,
        parentId: null,
        sourceKey: null,
        engine: this.newChatEngine(profileId),
        titleAuto: true,
      })
    );
  }

  chatForCall(place: CallPlace, chatId: string | null): AiChatRow {
    if (chatId !== null) {
      const chat = this.own({ profileId: place.profileId, role: 'owner' }, chatId);
      admitChatExecution(chat);
      return chat;
    }
    return this.conversationChat(place.profileId);
  }

  conversationChat(profileId: string): AiChatRow {
    return this.sourceChat(profileId, CONVERSATION_SOURCE, this.assistantName(), {
      kind: 'chat',
      titleAuto: false,
    });
  }

  retitleConversations(): void {
    const title = this.assistantName();
    for (const profile of this.store.profiles.list()) {
      const chat = this.store.aiChats.bySource(profile.id, CONVERSATION_SOURCE);
      if (chat !== undefined && chat.title !== title) this.store.aiChats.update(chat.id, { title });
    }
  }

  private assistantName(): string {
    return assistantLabel(this.store.assistantChat.settings());
  }

  repairChat(profileId: string): AiChatRow {
    return this.sourceChat(profileId, REPAIR_CHAT_SOURCE, 'AI repair', {
      kind: 'chat',
      titleAuto: false,
    });
  }

  chatForPlugin(profileId: string, sourceKey: string, title: string): AiChatRow {
    return this.sourceChat(profileId, sourceKey, title, { kind: 'plugin', titleAuto: false });
  }

  private sourceChat(
    profileId: string,
    sourceKey: string,
    title: string,
    shape: { readonly kind: AiChatRow['kind']; readonly titleAuto: boolean },
  ): AiChatRow {
    return (
      this.store.aiChats.bySource(profileId, sourceKey) ??
      this.store.aiChats.create({
        profileId,
        kind: shape.kind,
        title: title.slice(0, 80),
        icon: null,
        parentId: null,
        sourceKey,
        engine: this.newChatEngine(profileId),
        titleAuto: shape.titleAuto,
      })
    );
  }

  forTurn(profileId: string, chatId: string | undefined, title: string | undefined): AiChatRow {
    if (chatId !== undefined) {
      return this.own({ profileId, role: 'owner' }, chatId);
    }
    return this.store.aiChats.create({
      profileId,
      kind: 'chat',
      title: (title ?? NEW_CHAT_TITLE).slice(0, 80),
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: this.newChatEngine(profileId),
      titleAuto: title === undefined,
    });
  }

  create(owner: ChatOwner, input: AiChatNew, allowStandalone = false): AiChatRow {
    const engine =
      input.engine === undefined
        ? this.newChatEngine(owner.profileId)
        : this.complete(owner.profileId, input.engine);
    const standalone = this.admitCreation(owner, engine, input.parent_id, allowStandalone);
    return this.store.aiChats.create({
      profileId: owner.profileId,
      kind: input.parent_id === undefined ? 'chat' : 'subagent',
      title: input.title ?? NEW_CHAT_TITLE,
      icon: input.icon ?? null,
      parentId: input.parent_id ?? null,
      sourceKey: null,
      engine,
      ...(standalone ? { nativeAdmission: 'standalone' } : {}),
      titleAuto: input.title === undefined,
    });
  }

  private admitCreation(
    owner: ChatOwner,
    engine: Engine,
    parentId: string | undefined,
    allowStandalone: boolean,
  ): boolean {
    const standalone = allowStandalone && engine.kind !== 'dsh' && parentId === undefined;
    admitNativeEngine(engine, standalone || parentId !== undefined);
    if (parentId !== undefined) {
      admitChatExecution(this.own(owner, parentId));
    } else if (owner.confinedTo !== undefined) {
      throw new ApiError('forbidden', 'Start helper chats under your own chat only.');
    }
    if (standalone) this.validateStandalone(engine, owner);
    else this.validateEngine(engine, owner);
    return standalone;
  }

  update(owner: ChatOwner, chatId: string, change: AiChatChangeRequest): AiChatRow {
    const chat = this.own(owner, chatId);
    admitChatExecution(chat);
    const { engine: requested, ...rest } = change;
    const engine = requested === undefined ? undefined : this.complete(chat.profile_id, requested);
    if (engine !== undefined) {
      admitChatEngineChange(chat, engine);
      this.validateEngine(engine, owner);
    }
    try {
      return this.store.aiChats.update(chatId, engine === undefined ? rest : { ...rest, engine });
    } catch (cause) {
      if (cause instanceof NothingToMarkUnreadError) {
        throw new ApiError('conflict', 'This chat has no incoming message to mark unread.');
      }
      throw cause;
    }
  }

  search(owner: ChatOwner, query: AiChatSearch): AiChatHit[] {
    const { aiChats, assistantSearch } = this.store;
    const chatId = query.chatId ?? this.confinedChat(owner);
    if (chatId !== undefined) {
      this.own(owner, chatId);
    }
    const base = { profileId: owner.profileId, text: query.q, archived: query.archived };
    const titles =
      chatId === undefined
        ? aiChats.titleHits({ ...base, limit: query.limit }).map((hit): AiChatHit => ({
            chatId: hit.id,
            title: hit.title,
            messageId: null,
            snippet: hit.title,
            at: hit.at,
            archived: hit.archived,
          }))
        : [];
    const messages = assistantSearch
      .hits({ ...base, chatId: chatId ?? null, limit: query.limit })
      .map((hit): AiChatHit => ({
        chatId: hit.chat_id,
        title: hit.title,
        messageId: hit.id,
        snippet: snippetOf(hit.text, query.q),
        at: hit.at,
        archived: hit.archived,
      }));
    return [...titles, ...messages].slice(0, query.limit);
  }

  private confinedChat(owner: ChatOwner): string | undefined {
    return owner.confinedTo === undefined ? undefined : this.chatOf(owner).id;
  }

  holdRemoval(
    ids: readonly string[],
    work: () => Promise<void>,
    inactiveOnly = false,
  ): Promise<void> {
    const held = (): Promise<void> =>
      this.store.aiChats.holdRemoval(ids, async () => {
        this.store.aiChats.deletion(ids, 'deleting', null);
        try {
          await work();
        } catch (cause) {
          const reason =
            cause instanceof ApiError
              ? cause.message
              : 'Managed chat files could not be completely removed. Retry deleting this chat.';
          this.store.aiChats.deletion(ids, 'failed', reason);
          throw cause instanceof ApiError ? cause : new ApiError('conflict', reason);
        }
      });
    return inactiveOnly ? this.store.assistantEvents.holdQueuedWork(ids, held) : held();
  }

  removalScope(owner: ChatOwner, chatId: string): AiChatRow[] {
    return this.store.aiChats.removalIds(chatId).map((id) => this.own(owner, id));
  }

  async remove(
    owner: ChatOwner,
    chatId: string,
    expected?: readonly string[],
    committed?: () => void,
  ): Promise<void> {
    const scope = this.removalScope(owner, chatId);
    this.requireRemovalScope(scope, expected);
    await this.selections?.projects?.removeRoots(scope.map((chat) => chat.id));
    const attached = scope.flatMap((chat) => this.store.assistantChat.attachmentsOfChat(chat.id));
    await this.files.remove(attached);
    this.store.write(() => {
      const current = this.removalScope(owner, chatId);
      this.requireRemovalScope(current, expected);
      for (const chat of current) this.store.aiChats.remove(chat.id);
    });
    committed?.();
  }
  private requireRemovalScope(
    scope: readonly AiChatRow[],
    expected: readonly string[] | undefined,
  ): void {
    if (
      expected !== undefined &&
      JSON.stringify(scope.map((chat) => chat.id)) !== JSON.stringify(expected)
    )
      throw new ApiError(
        'conflict',
        'The subagent tree changed while closing; its history was retained. Try deleting again.',
      );
  }
}
