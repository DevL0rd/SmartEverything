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

export function assertSubagentCreation(context: StoreContext, input: NewChat): void {
  if (
    input.kind === 'subagent' &&
    input.parentId !== null &&
    deleting(workState(context, input.parentId))
  )
    throw subagentRefused();
}

export function assertChatWork(
  context: StoreContext,
  chatId: string,
  mode: 'read' | 'write' = 'write',
): void {
  const state = workState(context, chatId);
  if (mode === 'write') assertWritable(state);
  if (deleting(state)) throw workRefused();
}

export function assertQueuedChatWork(context: StoreContext, chatId: string): void {
  const state = workState(context, chatId);
  assertWritable(state);
  if (deleting(state)) throw queueRefused();
}

function subagentRefused(): ApiError {
  return new ApiError(
    'conflict',
    'This parent conversation is being deleted; no subagent was started.',
  );
}

function workRefused(): ApiError {
  return new ApiError(
    'conflict',
    'This conversation is being deleted; no native work was started.',
  );
}

function queueRefused(): ApiError {
  return new ApiError('conflict', 'Inactive conversation cleanup is pending; no work was queued.');
}

async function holding(
  holds: Set<string>,
  ids: readonly string[],
  refusal: string,
  work: () => Promise<void>,
): Promise<void> {
  if (ids.some((id) => holds.has(id))) throw new ApiError('conflict', refusal);
  for (const id of ids) holds.add(id);
  try {
    await work();
  } finally {
    for (const id of ids) holds.delete(id);
  }
}

export interface HeldChats {
  readonly removing: readonly string[];
  readonly cleaning: readonly string[];
}

export function assertHeldSubagentCreation(held: HeldChats, input: NewChat): void {
  if (
    input.kind === 'subagent' &&
    input.parentId !== null &&
    held.removing.includes(input.parentId)
  )
    throw subagentRefused();
}

export function assertHeldWork(held: HeldChats, chatId: string): void {
  if (held.removing.includes(chatId)) throw workRefused();
}

export function assertHeldQueued(held: HeldChats, chatId: string): void {
  if (held.cleaning.includes(chatId)) throw queueRefused();
}

export class ChatWorkHolds {
  private readonly removing = new Set<string>();
  private readonly cleaning = new Set<string>();

  held(): HeldChats {
    return { removing: [...this.removing], cleaning: [...this.cleaning] };
  }

  assertSubagentCreation(input: NewChat): void {
    if (input.kind === 'subagent' && input.parentId !== null && this.removing.has(input.parentId))
      throw subagentRefused();
  }

  assertWork(chatId: string): void {
    if (this.removing.has(chatId)) throw workRefused();
  }

  assertQueued(chatId: string): void {
    if (this.cleaning.has(chatId)) throw queueRefused();
  }

  holdRemoval(ids: readonly string[], work: () => Promise<void>): Promise<void> {
    return holding(this.removing, ids, 'This conversation is already being deleted.', work);
  }

  holdQueued(ids: readonly string[], work: () => Promise<void>): Promise<void> {
    return holding(this.cleaning, ids, 'Inactive conversation cleanup is already pending.', work);
  }
}
