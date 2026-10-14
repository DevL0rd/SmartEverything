import type { ProjectFilesService } from '../projects/service';
import {
  NEW_CHAT_TITLE,
  ApiError,
  type AiChatChange,
  type AiChatHit,
  type AiChatNew,
  type AiChatRow,
  type AiChatSearch,
  type Role,
  type Engine,
} from '@smarteverything/domain';
import { NothingToMarkUnreadError } from '../store/repositories/ai-chats';
import type { Store } from '../store/store';
import { snippetOf } from './chat-snippet';
import type { AssistantFiles } from './files';

const CONVERSATION_SOURCE = 'conversation';

const MINUTE_MS = 60_000;

export interface ChatOwner {
  readonly profileId: string;
  readonly role: Role;
}

export interface CallPlace {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly device: string;
}

function callTitle(device: string, at: Date): string {
  const time = at.toISOString().slice(11, 16);
  return `Voice · ${device} · ${time}`.slice(0, 80);
}

export class ChatDirectory {
  constructor(
    private readonly store: Store,
    private readonly files: AssistantFiles,
    private readonly now: () => Date,
    private readonly selections?: {
      readonly projects?: ProjectFilesService;
      readonly default: (profileId: string, background: boolean) => Engine;
      readonly select: (profileId: string, engine: Engine) => Engine;
      readonly validate: (engine: Engine, role: Role) => void;
    },
  ) {}

  private defaultEngine(profileId: string, background = false): Engine {
    if (this.selections === undefined)
      throw new ApiError('conflict', 'SmartEverything model routes are starting.');
    return this.selections.default(profileId, background);
  }
  select(profileId: string, engine: Engine): Engine {
    if (this.selections === undefined)
      throw new ApiError('conflict', 'SmartEverything model routes are starting.');
    return this.selections.select(profileId, engine);
  }
  own(owner: ChatOwner, chatId: string): AiChatRow {
    const chat = this.store.aiChats.chat(chatId);
    if (chat.profile_id !== owner.profileId) {
      throw new ApiError('forbidden', 'That chat belongs to someone else.');
    }
    return chat;
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
        engine: this.defaultEngine(profileId),
        titleAuto: true,
      })
    );
  }

  chatForCall(place: CallPlace, chatId: string | null): AiChatRow {
    if (chatId !== null) {
      return this.own({ profileId: place.profileId, role: 'owner' }, chatId);
    }
    return this.conversationChat(place.profileId, callTitle(place.device, this.now()));
  }

  conversationChat(profileId: string, title: string): AiChatRow {
    return this.sourceChat(profileId, CONVERSATION_SOURCE, title, {
      kind: 'chat',
      titleAuto: true,
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
    const minutes = this.store.assistantChat.settings().reuse_chat_minutes;
    const latest = this.store.aiChats.bySource(profileId, sourceKey);
    const since = this.now().getTime() - minutes * MINUTE_MS;
    if (latest !== undefined && Date.parse(latest.last_message_at ?? latest.created_at) > since) {
      return latest;
    }
    return this.store.aiChats.create({
      profileId,
      kind: shape.kind,
      title: title.slice(0, 80),
      icon: null,
      parentId: null,
      sourceKey,
      engine: this.defaultEngine(profileId, true),
      titleAuto: shape.titleAuto,
    });
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
      engine: this.defaultEngine(profileId, true),
      titleAuto: title === undefined,
    });
  }

  create(owner: ChatOwner, input: AiChatNew): AiChatRow {
    const engine =
      input.engine === undefined
        ? this.defaultEngine(owner.profileId)
        : this.select(owner.profileId, input.engine);
    this.selections?.validate(engine, owner.role);
    if (input.parent_id !== undefined) {
      this.own(owner, input.parent_id);
    }
    return this.store.aiChats.create({
      profileId: owner.profileId,
      kind: input.parent_id === undefined ? 'chat' : 'subagent',
      title: input.title ?? NEW_CHAT_TITLE,
      icon: input.icon ?? null,
      parentId: input.parent_id ?? null,
      sourceKey: null,
      engine,
      titleAuto: input.title === undefined,
    });
  }

  update(owner: ChatOwner, chatId: string, change: AiChatChange): AiChatRow {
    this.own(owner, chatId);
    const selected =
      change.engine === undefined
        ? change
        : { ...change, engine: this.select(owner.profileId, change.engine) };
    if (selected.engine !== undefined) this.selections?.validate(selected.engine, owner.role);
    try {
      return this.store.aiChats.update(chatId, selected);
    } catch (cause) {
      if (cause instanceof NothingToMarkUnreadError) {
        throw new ApiError('conflict', 'This chat has no incoming message to mark unread.');
      }
      throw cause;
    }
  }

  search(owner: ChatOwner, query: AiChatSearch): AiChatHit[] {
    const { aiChats, assistantSearch } = this.store;
    if (query.chatId !== undefined) {
      this.own(owner, query.chatId);
    }
    const base = { profileId: owner.profileId, text: query.q, archived: query.archived };
    const titles =
      query.chatId === undefined
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
      .hits({ ...base, chatId: query.chatId ?? null, limit: query.limit })
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
