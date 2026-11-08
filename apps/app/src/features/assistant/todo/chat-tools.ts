import type { AssistantMessageRow, ChatTimelineTool } from '@smarteverything/domain';
import { useMemo } from 'react';
import { useChatMessages } from '../data/chat-store';
import { replyTimeline } from '../model/reply-timeline';
import { savedTodos, type TodoList } from './todo-model';

export function chatTools(rows: readonly AssistantMessageRow[]): readonly ChatTimelineTool[] {
  return [...rows]
    .sort((left, right) =>
      left.created_at < right.created_at ? -1 : left.created_at > right.created_at ? 1 : 0,
    )
    .flatMap(
      (row) =>
        replyTimeline(row)?.parts.flatMap((part) => (part.kind === 'tool' ? [part.tool] : [])) ??
        [],
    );
}

export function useChatTools(chatId: string): readonly ChatTimelineTool[] {
  const rows = useChatMessages(chatId);
  return useMemo(() => chatTools(rows), [rows]);
}

export function useChatTodos(chatId: string): TodoList | null {
  const rows = useChatMessages(chatId);
  return useMemo(() => savedTodos(rows), [rows]);
}
