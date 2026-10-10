import {
  DEFAULT_ENGINE,
  NEW_CHAT_TITLE,
  ApiError,
  type AiChatChange,
  type AiChatHit,
  type AiChatNew,
  type AiChatRow,
  type AiChatSearch,
  type Role,
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
  ) {}

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
        engine: DEFAULT_ENGINE,
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
      engine: DEFAULT_ENGINE,
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
      engine: DEFAULT_ENGINE,
      titleAuto: title === undefined,
    });
  }

  create(owner: ChatOwner, input: AiChatNew): AiChatRow {
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
      engine: input.engine ?? DEFAULT_ENGINE,
      titleAuto: input.title === undefined,
    });
  }

  update(owner: ChatOwner, chatId: string, change: AiChatChange): AiChatRow {
    this.own(owner, chatId);
    try {
      return this.store.aiChats.update(chatId, change);
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

  async remove(owner: ChatOwner, chatId: string): Promise<void> {
    this.own(owner, chatId);
    const files = this.store.assistantChat.removeMessages(
      this.store.assistantChat.messageIdsOf(chatId),
    );
    await this.files.remove(files);
    this.store.aiChats.remove(chatId);
  }
}
