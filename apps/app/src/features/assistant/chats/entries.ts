import type { AiChatRow } from '@smarteverything/domain';
import type { Turns } from '../../../store/chat-turns';
import type { ChatEntry, ChatState, ChatThreadGroup } from './chat-entry';

export interface ChatPreview {
  readonly text: string;
  readonly at: string;
}

export interface EntrySources {
  readonly chats: readonly AiChatRow[];
  readonly turns: Turns;
  readonly previews: ReadonlyMap<string, ChatPreview>;
  readonly workers: boolean;
}

function stateOf(turns: Turns, chatId: string): ChatState {
  const states = Object.values(turns)
    .filter((turn) => turn.chatId === chatId)
    .map((turn) => turn.state);
  if (states.some((state) => state !== 'idle' && state !== 'failed')) {
    return 'working';
  }
  return states.includes('failed') ? 'failed' : 'idle';
}

function entryOf(chat: AiChatRow, sources: EntrySources, nested: boolean): ChatEntry {
  const preview = sources.previews.get(chat.id);
  return {
    id: chat.id,
    title: chat.title,
    preview: preview?.text ?? null,
    empty: chat.last_message_at === null && preview === undefined,
    at: chat.last_message_at ?? preview?.at ?? chat.created_at,
    pinned: chat.pinned,
    call: chat.kind === 'call',
    worker: chat.kind === 'worker',
    nested,
    state: stateOf(sources.turns, chat.id),
  };
}

export function groupsOf(sources: EntrySources): readonly ChatThreadGroup[] {
  const live = sources.chats.filter(
    (chat) => chat.archived_at === null && (sources.workers || chat.kind !== 'worker'),
  );
  const known = new Set(live.map((chat) => chat.id));
  return live
    .filter((chat) => chat.parent_id === null || !known.has(chat.parent_id))
    .map((chat) => ({
      parent: entryOf(chat, sources, false),
      children: live
        .filter((child) => child.parent_id === chat.id)
        .map((child) => entryOf(child, sources, true)),
    }));
}

export function matchesChat(group: ChatThreadGroup, needle: string): boolean {
  return [group.parent, ...group.children].some(
    (entry) =>
      entry.title.toLowerCase().includes(needle) ||
      (entry.preview?.toLowerCase().includes(needle) ?? false),
  );
}
