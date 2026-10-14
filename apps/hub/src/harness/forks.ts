import { z } from 'zod';
import { isSurfaceEvent } from '@deepseek-ai/dsh-session';
import { forkNativeHistory, readNativeHistory } from '@smarteverything/harness/process';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AiChatRow, DshSessionMetadata } from '@smarteverything/domain';
import { nativeHistoryPrefix } from './history-mutation';

const SELECTION = z
  .strictObject({
    kind: z.literal('fork'),
    profile_id: z.uuid(),
    parent_chat: z.uuid(),
    checkpoint: z.int().nonnegative(),
    boundary: z.int().nonnegative(),
    source_epoch: z.int().positive().nullable(),
  })
  .refine(
    (selection) => selection.boundary <= selection.checkpoint,
    'The native branch boundary must be inside its committed checkpoint.',
  );

export function nativeForkIntent(
  store: Store,
  parent: AiChatRow,
  child: AiChatRow,
  message?: string,
): void {
  if (parent.engine.kind !== 'dsh' || parent.engine.session_id === null) return;
  const id = parent.engine.session_id;
  const metadata = admittedParent(store, parent, child, id);
  const checkpoint = metadata.next_seq - 1;
  if (checkpoint < 0) return;
  const history = readHistory(store, id, parent.profile_id, checkpoint);
  const selection = SELECTION.parse({
    kind: 'fork',
    profile_id: parent.profile_id,
    parent_chat: parent.id,
    checkpoint,
    boundary:
      message === undefined
        ? checkpoint
        : forkBoundary(store, { id: parent.id, session_id: id }, message, history),
    source_epoch: store.dshSessions.writerState(id, parent.profile_id).claim?.epoch ?? null,
  });
  const operation = `fork:${child.id}`;
  store.harnessCoordination.begin(operation, id, selection);
  store.harnessRecovery.fork(child.id, id, checkpoint);
  store.harnessCoordination.finish(operation, selection);
}

function admittedParent(
  store: Store,
  parent: AiChatRow,
  child: AiChatRow,
  id: string,
): DshSessionMetadata {
  const current = store.aiChats.chat(parent.id);
  if (
    current.profile_id !== child.profile_id ||
    current.engine.kind !== 'dsh' ||
    current.engine.session_id !== id ||
    child.parent_id !== parent.id
  )
    throw new ApiError(
      'forbidden',
      'Native fork must retain its current owner and parent binding.',
    );
  const metadata = store.dshSessions.stat(id, parent.profile_id);
  if (metadata?.chat_id !== parent.id)
    throw new ApiError('forbidden', 'Native fork source belongs to another conversation.');
  return metadata;
}

export function nativeForkSeed(
  store: Store,
  chat: AiChatRow,
):
  | {
      readonly parent: string;
      readonly inherited: number;
      readonly events: ReturnType<typeof forkNativeHistory>;
    }
  | undefined {
  const fork = store.harnessRecovery.forkOf(chat.id);
  if (fork === undefined) return undefined;
  const metadata = store.dshSessions.stat(fork.parent_session, chat.profile_id);
  if (metadata === undefined || metadata.next_seq <= fork.boundary)
    throw new ApiError('conflict', 'Native fork lost its complete committed parent checkpoint.');
  const history = readHistory(store, fork.parent_session, chat.profile_id, fork.boundary);
  const events = forkNativeHistory(metadata.header, history, fork.boundary);
  const selection = forkSelection(store, chat, fork, metadata);
  if (selection === undefined)
    return { parent: fork.parent_session, inherited: fork.boundary + 1, events };
  const projected = nativeHistoryPrefix(
    readNativeHistory(metadata.header, events),
    selection.boundary,
  );
  return {
    parent: fork.parent_session,
    inherited: fork.boundary + 1,
    events: [...readNativeHistory(metadata.header, projected)],
  };
}

function forkSelection(
  store: Store,
  chat: AiChatRow,
  fork: NonNullable<ReturnType<Store['harnessRecovery']['forkOf']>>,
  metadata: DshSessionMetadata,
): z.infer<typeof SELECTION> | undefined {
  const receipt = store.harnessCoordination.operation(`fork:${chat.id}`);
  if (receipt === undefined) return undefined;
  const selection = SELECTION.parse(JSON.parse(receipt.request));
  if (
    receipt.state !== 'completed' ||
    receipt.session_id !== fork.parent_session ||
    selection.profile_id !== chat.profile_id ||
    selection.parent_chat !== metadata.chat_id ||
    selection.parent_chat !== chat.parent_id ||
    selection.checkpoint !== fork.boundary
  )
    throw new ApiError(
      'forbidden',
      'Native fork selection does not match its admitted parent snapshot.',
    );
  return selection;
}

function readHistory(
  store: Store,
  id: string,
  profile: string,
  boundary: number,
): ReturnType<typeof readNativeHistory> {
  const events = [];
  for (let offset = 0; offset <= boundary; offset += 10_000) {
    const page = store.dshSessions.read(
      {
        session_id: id,
        offset,
        limit: Math.min(10_000, boundary - offset + 1),
      },
      profile,
    );
    events.push(...page.events);
  }
  return readNativeHistory(store.dshSessions.stat(id, profile)?.header, events);
}

function forkBoundary(
  store: Store,
  parent: { readonly id: string; readonly session_id: string },
  message: string,
  history: ReturnType<typeof readNativeHistory>,
): number {
  for (const row of store.assistantSearch.upTo(parent.id, message).toReversed()) {
    const cut = store.harnessDeliveries.cutOfMessage(row.id);
    if (cut?.session_id === parent.session_id) {
      if (row.role === 'responder' && cut.end_seq !== null) return cut.end_seq;
      const event = history.find(
        (entry) =>
          entry.type === 'user/message' &&
          z.object({ id: z.literal(cut.delivery_id) }).safeParse(entry.data).success,
      );
      if (event !== undefined) return event.seq;
    }
    const imported = importedBoundary(history, row.id, row.role === 'person');
    if (imported !== undefined) return imported;
  }
  throw new ApiError('conflict', 'This branch boundary has no admitted native event identity.');
}

function importedBoundary(
  history: ReturnType<typeof readNativeHistory>,
  id: string,
  person: boolean,
): number | undefined {
  const marker = history.findIndex(
    (event) =>
      hasType(event, 'plugin:smarteverything/legacy-message') &&
      z.object({ id: z.literal(id) }).safeParse(event.data).success,
  );
  if (marker < 0) return undefined;
  const end = history.findIndex((event, index) => index > marker && event.type === 'turn/end');
  const row = history.slice(marker, end < 0 ? undefined : end + 1);
  const surfaced = row.filter(isSurfaceEvent);
  if (surfaced.length === 0) return undefined;
  return person ? surfaced[0]?.seq : end < 0 ? surfaced.at(-1)?.seq : end;
}

function hasType(event: { readonly type: string }, type: string): boolean {
  return event.type === type;
}
