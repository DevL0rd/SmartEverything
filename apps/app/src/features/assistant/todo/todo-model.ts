import { z } from 'zod';
import {
  CHAT_TODO_ITEM,
  TODO_TOOL_NAME,
  chatTodosIn,
  type AssistantMessageRow,
  type ChatTimelineTool,
} from '@smarteverything/domain';
import { reportedRecord } from '../model/tool-presentation-text';

const TODO_INPUT = z.object({ todos: z.array(CHAT_TODO_ITEM) });

export type TodoItem = z.infer<typeof TODO_INPUT>['todos'][number];

export interface TodoList {
  readonly items: readonly TodoItem[];
  readonly done: number;
}

function counted(items: readonly TodoItem[]): TodoList {
  return { items, done: items.filter((item) => item.status === 'completed').length };
}

export function latestTodos(tools: readonly ChatTimelineTool[]): TodoList | null {
  for (const tool of [...tools].reverse()) {
    if (tool.name !== TODO_TOOL_NAME || tool.state !== 'done') continue;
    const parsed = TODO_INPUT.safeParse(reportedRecord(tool.input));
    if (!parsed.success) return null;
    return counted(parsed.data.todos);
  }
  return null;
}

export function savedTodos(
  rows: readonly Pick<AssistantMessageRow, 'created_at' | 'embeds'>[],
): TodoList | null {
  const ordered = [...rows].sort((left, right) =>
    left.created_at < right.created_at ? -1 : left.created_at > right.created_at ? 1 : 0,
  );
  for (const row of ordered.reverse()) {
    const saved = chatTodosIn(row.embeds);
    if (saved !== null) return counted(saved.items);
  }
  return null;
}

export function currentTodo(list: TodoList): TodoItem | null {
  return (
    list.items.find((item) => item.status === 'in_progress') ??
    list.items.find((item) => item.status === 'pending') ??
    null
  );
}
