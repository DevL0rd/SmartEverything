import { Logger } from '@smarteverything/logging';
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
  type Engine,
  type EngineRequest,
} from '@smarteverything/domain';
import type { NewChat } from '../store/repositories/ai-chat-input';
import type { Store } from '../store/store';
import { snippetOf } from './chat-snippet';
import type { AssistantFiles } from './files';
import type { StoredAttachment } from '../store/repositories/assistant-files';
import { admitChatEngineChange, admitChatExecution, admitNativeEngine } from './native-helpers';
import { sameRemovalScope, type ChatOwner } from './chat-ownership';
import { completeEngine, defaultEngine, meteredCatalogue } from '../openrouter/metered-engine';

const log = new Logger('hub.assistant');
const CONVERSATION_SOURCE = 'conversation';
export const REPAIR_CHAT_SOURCE = 'repair:server\0hub:service';

export type { ChatOwner } from './chat-ownership';

export interface CallPlace {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly device: string;
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

  own(owner: ChatOwner, chatId: string): Promise<AiChatRow> {
    return this.store.host.read('assistantOwnedChat', { owner, chatId });
  }

  validateEngine(engine: Engine, owner: Pick<ChatOwner, 'profileId' | 'role'>): void {
    this.selections?.validate(engine, owner);
  }

  validateStandalone(engine: Engine, owner: ChatOwner): void {
    if (this.selections?.validateStandalone === undefined)
      throw new ApiError('conflict', 'Computer AI engines are starting.');
    this.selections.validateStandalone(engine, owner);
  }

  async visible(owner: ChatOwner, chats: readonly AiChatRow[]): Promise<AiChatRow[]> {
    if (owner.confinedTo === undefined) return [...chats];
    return await this.store.host.read('assistantVisibleChats', {
      confinedTo: owner.confinedTo,
      chats,
    });
  }

  attachment(owner: ChatOwner, id: string): Promise<StoredAttachment> {
    return this.store.host.read('assistantOwnedAttachment', { owner, id });
  }

  async postTarget(
    actor: ChatOwner,
    body: AssistantPost,
    ownerProfile: () => string,
  ): Promise<{ readonly profileId: string; readonly chat: AiChatRow }> {
    if (actor.role === 'owner') {
      const profileId = body.profileId ?? ownerProfile();
      await this.requirePerson(profileId);
      return { profileId, chat: await this.defaultChat(profileId) };
    }
    if (body.profileId !== undefined && body.profileId !== actor.profileId)
      throw new ApiError('forbidden', 'You can post only to your own chat.');
    for (const file of body.files)
      if ('uploadId' in file) await this.attachment(actor, file.uploadId);
    return { profileId: actor.profileId, chat: await this.chatOf(actor) };
  }

  private async requirePerson(profileId: string): Promise<void> {
    const profiles = await this.store.host.call('profiles', 'list');
    if (!profiles.some((profile) => profile.id === profileId))
      throw new ApiError(
        'invalid_request',
        'There is no person with that profileId; take it from person_read, or leave it out for the owner.',
      );
  }

  chatOf(owner: ChatOwner): Promise<AiChatRow> {
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

  async defaultChat(profileId: string): Promise<AiChatRow> {
    return (
      (await this.store.host.call('aiChats', 'latest', profileId)) ??
      (await this.store.live.chatWork.create({
        profileId,
        kind: 'chat',
        title: NEW_CHAT_TITLE,
        icon: null,
        parentId: null,
        sourceKey: null,
        engine: this.newChatEngine(profileId),
        titleAuto: true,
      }))
    );
  }

  async chatForCall(place: CallPlace, chatId: string | null): Promise<AiChatRow> {
    if (chatId !== null) {
      const chat = await this.own({ profileId: place.profileId, role: 'owner' }, chatId);
      admitChatExecution(chat);
      return chat;
    }
    return this.conversationChat(place.profileId);
  }

  conversationChat(profileId: string): Promise<AiChatRow> {
    return this.sourceChat(profileId, CONVERSATION_SOURCE, null, {
      kind: 'chat',
      titleAuto: false,
    });
  }

  async retitleConversations(): Promise<void> {
    await this.store.host.write('assistantConversationsRetitle', {
      source: CONVERSATION_SOURCE,
      title: this.assistantName(),
    });
  }

  private assistantName(): string {
    return assistantLabel(this.store.live.home.assistant.read());
  }

  repairChat(profileId: string): Promise<AiChatRow> {
    return this.sourceChat(profileId, REPAIR_CHAT_SOURCE, 'AI repair', {
      kind: 'chat',
      titleAuto: false,
    });
  }

  chatForPlugin(profileId: string, sourceKey: string, title: string): Promise<AiChatRow> {
    return this.sourceChat(profileId, sourceKey, title, { kind: 'plugin', titleAuto: false });
  }

  private async sourceChat(
    profileId: string,
    sourceKey: string,
    title: string | null,
    shape: { readonly kind: AiChatRow['kind']; readonly titleAuto: boolean },
  ): Promise<AiChatRow> {
    const found = await this.store.host.call('aiChats', 'bySource', profileId, sourceKey);
    if (found !== undefined) return found;
    return await this.store.live.chatWork.create({
      profileId,
      kind: shape.kind,
      title: (title ?? this.assistantName()).slice(0, 80),
      icon: null,
      parentId: null,
      sourceKey,
      engine: this.newChatEngine(profileId),
      titleAuto: shape.titleAuto,
    });
  }

  forTurn(
    profileId: string,
    chatId: string | undefined,
    title: string | undefined,
  ): Promise<AiChatRow> {
    if (chatId !== undefined) {
      return this.own({ profileId, role: 'owner' }, chatId);
    }
    return this.store.live.chatWork.create({
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

  private async alreadyMade(owner: ChatOwner, id: string | undefined): Promise<AiChatRow | null> {
    if (id === undefined) return null;
    const made = await this.store.host.read('assistantOwnedMadeChat', { owner, id });
    if (made === null) return null;
    log.debug('chat.duplicate_create_ignored', { chatId: made.id, profileId: owner.profileId });
    return made;
  }

  async create(owner: ChatOwner, input: AiChatNew, allowStandalone = false): Promise<AiChatRow> {
    const made = await this.alreadyMade(owner, input.id);
    if (made !== null) return made;
    return await this.store.live.chatWork.create(await this.prepare(owner, input, allowStandalone));
  }

  async prepare(owner: ChatOwner, input: AiChatNew, allowStandalone = false): Promise<NewChat> {
    const engine =
      input.engine === undefined
        ? this.newChatEngine(owner.profileId)
        : this.complete(owner.profileId, input.engine);
    const standalone = await this.admitCreation(owner, engine, input.parent_id, allowStandalone);
    return {
      ...(input.id === undefined ? {} : { id: input.id }),
      profileId: owner.profileId,
      kind: input.parent_id === undefined ? 'chat' : 'subagent',
      title: input.title ?? NEW_CHAT_TITLE,
      icon: input.icon ?? null,
      parentId: input.parent_id ?? null,
      sourceKey: null,
      engine,
      ...(standalone ? { nativeAdmission: 'standalone' } : {}),
      titleAuto: input.title === undefined,
    };
  }

  private async admitCreation(
    owner: ChatOwner,
    engine: Engine,
    parentId: string | undefined,
    allowStandalone: boolean,
  ): Promise<boolean> {
    const standalone = allowStandalone && engine.kind !== 'dsh' && parentId === undefined;
    admitNativeEngine(engine, standalone || parentId !== undefined);
    if (parentId !== undefined) {
      admitChatExecution(await this.own(owner, parentId));
    } else if (owner.confinedTo !== undefined) {
      throw new ApiError('forbidden', 'Start helper chats under your own chat only.');
    }
    if (standalone) this.validateStandalone(engine, owner);
    else this.validateEngine(engine, owner);
    return standalone;
  }

  async update(owner: ChatOwner, chatId: string, change: AiChatChangeRequest): Promise<AiChatRow> {
    const chat = await this.own(owner, chatId);
    admitChatExecution(chat);
    const { engine: requested, ...rest } = change;
    const engine = requested === undefined ? undefined : this.complete(chat.profile_id, requested);
    if (engine !== undefined) {
      admitChatEngineChange(chat, engine);
      this.validateEngine(engine, owner);
    }
    return await this.store.host.write('assistantChatChange', {
      chatId,
      change: engine === undefined ? rest : { ...rest, engine },
    });
  }

  async search(owner: ChatOwner, query: AiChatSearch): Promise<AiChatHit[]> {
    const { host } = this.store;
    const chatId = query.chatId ?? (await this.confinedChat(owner));
    if (chatId !== undefined) {
      await this.own(owner, chatId);
    }
    const base = { profileId: owner.profileId, text: query.q, archived: query.archived };
    const [titleHits, messageHits] = await Promise.all([
      chatId === undefined
        ? host.call('aiChats', 'titleHits', { ...base, limit: query.limit })
        : [],
      host.call('assistantSearch', 'hits', { ...base, chatId: chatId ?? null, limit: query.limit }),
    ]);
    const titles = titleHits.map((hit): AiChatHit => ({
      chatId: hit.id,
      title: hit.title,
      messageId: null,
      snippet: hit.title,
      at: hit.at,
      archived: hit.archived,
    }));
    const messages = messageHits.map((hit): AiChatHit => ({
      chatId: hit.chat_id,
      title: hit.title,
      messageId: hit.id,
      snippet: snippetOf(hit.text, query.q),
      at: hit.at,
      archived: hit.archived,
    }));
    return [...titles, ...messages].slice(0, query.limit);
  }

  private async confinedChat(owner: ChatOwner): Promise<string | undefined> {
    return owner.confinedTo === undefined ? undefined : (await this.chatOf(owner)).id;
  }

  holdRemoval(
    ids: readonly string[],
    work: () => Promise<void>,
    inactiveOnly = false,
  ): Promise<void> {
    const held = (): Promise<void> =>
      this.store.live.chatWork.holdRemoval(ids, async () => {
        await this.store.host.call('aiChats', 'deletion', ids, 'deleting', null);
        try {
          await work();
        } catch (cause) {
          const reason =
            cause instanceof ApiError
              ? cause.message
              : 'Managed chat files could not be completely removed. Retry deleting this chat.';
          await this.store.host.call('aiChats', 'deletion', ids, 'failed', reason);
          throw cause instanceof ApiError ? cause : new ApiError('conflict', reason);
        }
      });
    return inactiveOnly ? this.store.live.chatWork.holdQueued(ids, held) : held();
  }

  removalScope(owner: ChatOwner, chatId: string): Promise<AiChatRow[]> {
    return this.store.host.read('assistantRemovalScope', { owner, chatId });
  }

  async remove(
    owner: ChatOwner,
    chatId: string,
    expected?: readonly string[],
    committed?: () => void,
  ): Promise<void> {
    const scope = await this.removalScope(owner, chatId);
    sameRemovalScope(scope, expected);
    await this.selections?.projects?.removeRoots(scope.map((chat) => chat.id));
    const attached = (
      await Promise.all(
        scope.map((chat) => this.store.host.call('assistantChat', 'attachmentsOfChat', chat.id)),
      )
    ).flat();
    await this.files.remove(attached);
    await this.store.host.write('assistantChatRemove', { owner, chatId, expected });
    committed?.();
  }
}
