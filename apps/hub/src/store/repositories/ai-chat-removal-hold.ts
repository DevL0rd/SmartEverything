import { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import type { StoreContext } from '../context';
import type { NewChat } from './ai-chat-input';

const DELETION = z.strictObject({ deletion_state: z.string().nullable() });
function deleting(context: StoreContext, chatId: string): boolean {
  const state = context.sql.get(DELETION, 'select deletion_state from ai_chats where id=$id', {
    id: chatId,
  })?.deletion_state;
  return state !== undefined && state !== null;
}

const held = new WeakMap<StoreContext, Set<string>>();
const queued = new WeakMap<StoreContext, Set<string>>();

export function assertSubagentCreation(context: StoreContext, input: NewChat): void {
  if (
    input.kind === 'subagent' &&
    input.parentId !== null &&
    (held.get(context)?.has(input.parentId) === true || deleting(context, input.parentId))
  )
    throw new ApiError(
      'conflict',
      'This parent conversation is being deleted; no subagent was started.',
    );
}

export function assertChatWork(context: StoreContext, chatId: string): void {
  if (held.get(context)?.has(chatId) === true || deleting(context, chatId))
    throw new ApiError(
      'conflict',
      'This conversation is being deleted; no native work was started.',
    );
}

export async function holdChatTree(
  context: StoreContext,
  ids: readonly string[],
  work: () => Promise<void>,
): Promise<void> {
  const parents = held.get(context) ?? new Set<string>();
  if (ids.some((id) => parents.has(id)))
    throw new ApiError('conflict', 'This conversation is already being deleted.');
  held.set(context, parents);
  for (const id of ids) parents.add(id);
  try {
    await work();
  } finally {
    for (const id of ids) parents.delete(id);
    if (parents.size === 0) held.delete(context);
  }
}

export function assertQueuedChatWork(context: StoreContext, chatId: string): void {
  if (queued.get(context)?.has(chatId) === true || deleting(context, chatId))
    throw new ApiError('conflict', 'Inactive conversation cleanup is pending; no work was queued.');
}

export async function holdQueuedChatWork(
  context: StoreContext,
  ids: readonly string[],
  work: () => Promise<void>,
): Promise<void> {
  const chats = queued.get(context) ?? new Set<string>();
  if (ids.some((id) => chats.has(id)))
    throw new ApiError('conflict', 'Inactive conversation cleanup is already pending.');
  queued.set(context, chats);
  for (const id of ids) chats.add(id);
  try {
    await work();
  } finally {
    for (const id of ids) chats.delete(id);
    if (chats.size === 0) queued.delete(context);
  }
}
