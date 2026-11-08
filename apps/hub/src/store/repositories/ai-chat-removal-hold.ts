import { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import type { StoreContext } from '../context';
import type { NewChat } from './ai-chat-input';

const WORK_STATE = z.strictObject({
  deletion_state: z.string().nullable(),
  native_admission: z.enum(['standalone', 'retired']).nullable(),
});

function workState(context: StoreContext, chatId: string): z.output<typeof WORK_STATE> | undefined {
  return context.sql.get(
    WORK_STATE,
    'select deletion_state, native_admission from ai_chats where id=$id',
    { id: chatId },
  );
}

function assertWritable(state: z.output<typeof WORK_STATE> | undefined): void {
  if (state?.native_admission === 'retired')
    throw new ApiError('conflict', 'This retired chat history is read-only.');
}

export function assertChatNotRetired(context: StoreContext, chatId: string): void {
  assertWritable(workState(context, chatId));
}

function deleting(state: z.output<typeof WORK_STATE> | undefined): boolean {
  return state !== undefined && state.deletion_state !== null;
}

const held = new WeakMap<StoreContext, Set<string>>();
const queued = new WeakMap<StoreContext, Set<string>>();

export function assertSubagentCreation(context: StoreContext, input: NewChat): void {
  if (
    input.kind === 'subagent' &&
    input.parentId !== null &&
    (held.get(context)?.has(input.parentId) === true ||
      deleting(workState(context, input.parentId)))
  )
    throw new ApiError(
      'conflict',
      'This parent conversation is being deleted; no subagent was started.',
    );
}

export function assertChatWork(
  context: StoreContext,
  chatId: string,
  mode: 'read' | 'write' = 'write',
): void {
  const state = workState(context, chatId);
  if (mode === 'write') assertWritable(state);
  if (held.get(context)?.has(chatId) === true || deleting(state))
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
  const state = workState(context, chatId);
  assertWritable(state);
  if (queued.get(context)?.has(chatId) === true || deleting(state))
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
