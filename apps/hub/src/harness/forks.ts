import { z } from 'zod';
import { isSurfaceEvent } from '@deepseek-ai/dsh-session';
import { forkNativeHistory, readNativeHistory } from '@smarteverything/harness/process';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AiChatRow } from '@smarteverything/domain';
import { nativeHistoryPrefix } from './history-mutation';

const SELECTION = z.object({ boundary: z.int().nonnegative() });

export function nativeForkIntent(
  store: Store,
  parent: AiChatRow,
  child: AiChatRow,
  message: string,
): void {
  if (parent.engine.kind !== 'dsh' || parent.engine.session_id === null) return;
  const id = parent.engine.session_id;
  const metadata = store.dshSessions.stat(id, parent.profile_id);
  if (metadata === undefined)
    throw new ApiError('not_found', 'The conversation being branched has no native session.');
  const checkpoint = metadata.next_seq - 1;
  if (checkpoint < 0) return;
  const history = readHistory(store, id, parent.profile_id, checkpoint);
  const boundary = forkBoundary(store, { id: parent.id, session_id: id }, message, history);
  const operation = `fork:${child.id}`;
  store.harnessCoordination.begin(operation, id, { kind: 'fork', boundary });
  store.harnessRecovery.fork(child.id, id, checkpoint);
  store.harnessCoordination.finish(operation, { kind: 'fork', boundary });
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
  const selection = forkSelection(store, chat);
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

function forkSelection(store: Store, chat: AiChatRow): z.infer<typeof SELECTION> {
  const receipt = store.harnessCoordination.operation(`fork:${chat.id}`);
  if (receipt === undefined)
    throw new ApiError('conflict', 'Native fork lost its admitted branch point.');
  return SELECTION.parse(JSON.parse(receipt.request));
}

function readHistory(
  store: Store,
  id: string,
  profile: string,
  boundary: number,
): ReturnType<typeof readNativeHistory> {
  const events = store.dshSessions.readAll(id, profile, { length: boundary + 1 });
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
