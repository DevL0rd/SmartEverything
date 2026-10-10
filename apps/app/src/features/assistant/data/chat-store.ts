import { useMemo } from 'react';
import { isChatActivity, type AiChatRow, type AssistantMessageRow } from '@smarteverything/domain';
import { useRow, useRows } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import type { ChatThreadGroup } from '../chats/chat-entry';
import { groupsOf, type ChatPreview } from '../chats/entries';
import { plainText } from '../components/markdown/parse';
import { callPreviewOf } from './call-transcript';
import { liveTurnOf, type Turn } from '../../../store/chat-turns';

const PREVIEW_MAX = 120;

export function useAiChats(): readonly AiChatRow[] {
  return useRows('ai_chats');
}

export function useAiChat(chatId: string | null): AiChatRow | null {
  return useRow('ai_chats', chatId);
}

export function useChatMessages(chatId: string): readonly AssistantMessageRow[] {
  const rows = useRows('assistant_messages');
  return useMemo(() => rows.filter((row) => row.chat_id === chatId), [rows, chatId]);
}

export function useChatTurn(chatId: string): Turn | null {
  return useStoreSelector((state) => liveTurnOf(state.turns, chatId) ?? null);
}

function previewText(row: AssistantMessageRow): string {
  return row.kind === 'call' ? callPreviewOf(row) : plainText(row.text);
}

function previewsOf(rows: readonly AssistantMessageRow[]): ReadonlyMap<string, ChatPreview> {
  const previews = new Map<string, ChatPreview>();
  for (const row of rows) {
    if (!previews.has(row.chat_id) && row.text.trim() !== '' && isChatActivity(row)) {
      previews.set(row.chat_id, {
        text: previewText(row).slice(0, PREVIEW_MAX),
        at: row.created_at,
      });
    }
  }
  return previews;
}

export function useChatGroups(workers: boolean): readonly ChatThreadGroup[] {
  const chats = useAiChats();
  const rows = useRows('assistant_messages');
  const turns = useStoreSelector((state) => state.turns);
  return useMemo(
    () => groupsOf({ chats, turns, previews: previewsOf(rows), workers }),
    [chats, turns, rows, workers],
  );
}

export function useLatestChatId(): string | null {
  const chats = useAiChats();
  return chats.find((chat) => chat.archived_at === null && chat.kind !== 'subagent')?.id ?? null;
}
