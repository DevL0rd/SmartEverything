import { ApiError, type AiChatChange, type AiChatRow, type Role } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import type { StoredAttachment } from '../store/repositories/assistant-files';
import { NothingToMarkUnreadError } from '../store/repositories/ai-chats';

export interface ChatOwner {
  readonly profileId: string;
  readonly role: Role;
  readonly confinedTo?: string | null;
}

export function reachesChat(
  store: Pick<HostStore, 'aiChats'>,
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
  store: Pick<HostStore, 'aiChats'>,
  owner: ChatOwner,
  chatId: string,
): AiChatRow {
  const chat = store.aiChats.chat(chatId);
  if (chat.profile_id !== owner.profileId || !reachesChat(store, owner.confinedTo, chat))
    throw new ApiError('forbidden', 'That chat belongs to someone else.');
  return chat;
}

export function ownedAttachment(
  store: Pick<HostStore, 'aiChats' | 'assistantChat'>,
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

export interface OwnedChatRequest {
  readonly owner: ChatOwner;
  readonly chatId: string;
}

export interface VisibleChatsRequest {
  readonly confinedTo: string | null | undefined;
  readonly chats: readonly AiChatRow[];
}

export interface OwnedAttachmentRequest {
  readonly owner: ChatOwner;
  readonly id: string;
}

export interface OwnedSourceChatRequest {
  readonly owner: ChatOwner;
  readonly id: string;
}

function removalScope(store: HostStore, input: OwnedChatRequest): AiChatRow[] {
  return store.aiChats.removalIds(input.chatId).map((id) => ownedChat(store, input.owner, id));
}

export function sameRemovalScope(
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

export interface ChatRemoval extends OwnedChatRequest {
  readonly expected: readonly string[] | undefined;
}

function removeChats(store: HostStore, input: ChatRemoval): void {
  store.write(() => {
    const current = removalScope(store, input);
    sameRemovalScope(current, input.expected);
    for (const chat of current) store.aiChats.remove(chat.id);
  });
}

export interface ChatChange {
  readonly chatId: string;
  readonly change: AiChatChange;
}

function changeChat(store: HostStore, input: ChatChange): AiChatRow {
  try {
    return store.aiChats.update(input.chatId, input.change);
  } catch (cause) {
    if (cause instanceof NothingToMarkUnreadError)
      throw new ApiError('conflict', 'This chat has no incoming message to mark unread.');
    throw cause;
  }
}

export interface RetitleRequest {
  readonly source: string;
  readonly title: string;
}

function retitle(store: HostStore, input: RetitleRequest): void {
  store.write(() => {
    for (const profile of store.profiles.list()) {
      const chat = store.aiChats.bySource(profile.id, input.source);
      if (chat !== undefined && chat.title !== input.title)
        store.aiChats.update(chat.id, { title: input.title });
    }
  });
}

export const OWNED_CHAT_UNIT = storeUnit((store, input: OwnedChatRequest) =>
  ownedChat(store, input.owner, input.chatId),
);
export const VISIBLE_CHATS_UNIT = storeUnit((store, input: VisibleChatsRequest) =>
  input.chats.filter((chat) => reachesChat(store, input.confinedTo, chat)),
);
export const OWNED_ATTACHMENT_UNIT = storeUnit((store, input: OwnedAttachmentRequest) =>
  ownedAttachment(store, input.owner, input.id),
);
export const OWNED_MADE_CHAT_UNIT = storeUnit((store, input: OwnedSourceChatRequest) => {
  const made = store.aiChats.find(input.id);
  return made === undefined ? null : ownedChat(store, input.owner, made.id);
});
export const REMOVAL_SCOPE_UNIT = storeUnit(removalScope);
export const CHAT_REMOVE_UNIT = storeUnit(removeChats);
export const CHAT_CHANGE_UNIT = storeUnit(changeChat);
export const CONVERSATIONS_RETITLE_UNIT = storeUnit(retitle);
