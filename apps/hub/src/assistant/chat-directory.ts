import {
  DEFAULT_ENGINE,
  NEW_CHAT_TITLE,
  ApiError,
  type AiChatChange,
  type AiChatNew,
  type AiChatRow,
  type Engine,
  type Role,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AssistantFiles } from './files';

const OWNER_ENGINES: ReadonlySet<Engine['kind']> = new Set(['claude-session', 'codex-thread']);

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
        engine: this.ownerEngine(profileId),
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
    const minutes = this.store.assistantChat.settings().reuse_chat_minutes;
    const latest = this.store.aiChats.bySource(profileId, CONVERSATION_SOURCE);
    const since = this.now().getTime() - minutes * MINUTE_MS;
    if (latest !== undefined && Date.parse(latest.last_message_at ?? latest.created_at) > since) {
      return latest;
    }
    return this.store.aiChats.create({
      profileId,
      kind: 'chat',
      title: title.slice(0, 80),
      icon: null,
      parentId: null,
      sourceKey: CONVERSATION_SOURCE,
      engine: this.ownerEngine(profileId),
      titleAuto: true,
    });
  }

  chatForPlugin(profileId: string, sourceKey: string, title: string): AiChatRow {
    return (
      this.store.aiChats.bySource(profileId, sourceKey) ??
      this.store.aiChats.create({
        profileId,
        kind: 'plugin',
        title: title.slice(0, 80),
        icon: null,
        parentId: null,
        sourceKey,
        engine: this.ownerEngine(profileId),
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
      engine: this.ownerEngine(profileId),
      titleAuto: title === undefined,
    });
  }

  create(owner: ChatOwner, input: AiChatNew): AiChatRow {
    const engine = input.engine ?? this.ownerEngine(owner.profileId);
    this.mayUse(owner, engine);
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
    if (change.engine !== undefined) {
      this.mayUse(owner, change.engine);
    }
    return this.store.aiChats.update(chatId, change);
  }

  async remove(owner: ChatOwner, chatId: string): Promise<void> {
    this.own(owner, chatId);
    const files = this.store.assistantChat.removeMessages(
      this.store.assistantChat.messageIdsOf(chatId),
    );
    await this.files.remove(files);
    this.store.aiChats.remove(chatId);
  }

  private mayUse(owner: ChatOwner, engine: Engine): void {
    if (owner.role !== 'owner' && OWNER_ENGINES.has(engine.kind)) {
      throw new ApiError('forbidden', 'Only the owner can use Claude Code or Codex for a chat.');
    }
  }

  private ownerEngine(profileId: string): Engine {
    const kind = this.store.assistantChat.settings().default_engine;
    const owner = this.store.clients
      .list()
      .some((client) => client.profile_id === profileId && client.role === 'owner');
    return owner && OWNER_ENGINES.has(kind) ? { ...DEFAULT_ENGINE, kind } : DEFAULT_ENGINE;
  }
}
