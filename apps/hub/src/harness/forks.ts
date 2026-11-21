import { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import SessionStore, {
  isSurfaceEvent,
  SessionId,
  SessionLogOffset,
  SessionSeq,
} from '@deepseek-ai/dsh-session';
import type { CreateSessionOptions, SessionEvent } from '@deepseek-ai/dsh-session';
import SessionProjection from '@deepseek-ai/dsh-session-projection';
import { readNativeHistory } from '@smarteverything/harness/process';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AiChatRow, DshSessionMetadata } from '@smarteverything/domain';
import { nativeHistoryPrefix, SESSION_MESSAGE_PROJECTIONS } from './history-mutation';
import type { ForkCandidate } from './fork-units';
import type { NativeForkPlan } from './fork-record';

const SELECTION = z.object({ boundary: z.int().nonnegative() });
const FORK_TAIL = 'smarteverything/fork-tail';
const FORK_TAIL_STATE = z.object({ events: z.array(z.custom<SessionEvent>()) });

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'smarteverything/fork-tail': z.infer<typeof FORK_TAIL_STATE>;
  }
}

export async function planNativeFork(
  store: Store,
  parent: AiChatRow,
  message: string,
): Promise<NativeForkPlan | undefined> {
  if (parent.engine.kind !== 'dsh' || parent.engine.session_id === null) return undefined;
  const id = parent.engine.session_id;
  const read = await store.host.read('harnessForkPlanRead', {
    session_id: id,
    profile_id: parent.profile_id,
    chat_id: parent.id,
    message,
  });
  const checkpoint = read.metadata.next_seq - 1;
  if (checkpoint < 0) return undefined;
  const history = readNativeHistory(read.metadata.header, read.events);
  return { session_id: id, checkpoint, boundary: forkBoundary(id, read.candidates, history) };
}

export async function nativeForkSeed(
  store: Store,
  chat: AiChatRow,
): Promise<
  | {
      readonly parent: string;
      readonly inherited: number;
      readonly events: readonly SessionEvent[];
    }
  | undefined
> {
  const fork = await store.host.read('harnessForkSeedRead', chat);
  if (fork === undefined) return undefined;
  const { metadata } = fork;
  const history = readNativeHistory(metadata.header, fork.events);
  const events = forkedPrefix(metadata, history, fork.boundary);
  const selection = SELECTION.parse(JSON.parse(fork.request));
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

function forkedPrefix(
  metadata: DshSessionMetadata,
  history: ReturnType<typeof readNativeHistory>,
  boundary: number,
): readonly SessionEvent[] {
  const ctx = forkContext(boundary);
  const parent = ctx.sessions.create(SessionId(metadata.header.id), {
    seed: history,
    inheritedEventCount: SessionLogOffset(metadata.inherited_event_count),
    meta: parentLineage(metadata.header),
  });
  const child = ctx.sessions.fork(parent, SessionSeq(boundary));
  const tail = ctx.sessionProjections.stateOf(child, FORK_TAIL);
  if (tail === undefined)
    throw new ApiError('conflict', 'Native fork lost its inherited history closers.');
  return [...history.slice(0, boundary + 1), ...tail.events];
}

function forkContext(boundary: number): Context {
  const ctx = new Context();
  new SessionStore(ctx);
  new SessionProjection(ctx);
  for (const projection of SESSION_MESSAGE_PROJECTIONS)
    ctx.sessions.registerMessageProjection(projection);
  ctx.sessionProjections.register({
    key: FORK_TAIL,
    stateVersion: 1,
    stateSchema: FORK_TAIL_STATE,
    init: () => ({ events: [] }),
    apply: (state, event) => (event.seq <= boundary ? state : { events: [...state.events, event] }),
  });
  return ctx;
}

function parentLineage(
  header: DshSessionMetadata['header'],
): NonNullable<CreateSessionOptions['meta']> {
  return {
    createdAt: header.createdAt,
    isSeeded: header.isSeeded,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    ...(header.parentSession === undefined
      ? {}
      : { parentSession: SessionId(header.parentSession) }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    ...(header.delegationDepth === undefined ? {} : { delegationDepth: header.delegationDepth }),
    ...(header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
  };
}

function forkBoundary(
  sessionId: string,
  candidates: readonly ForkCandidate[],
  history: ReturnType<typeof readNativeHistory>,
): number {
  for (const { cut, ...row } of candidates) {
    if (cut?.session_id === sessionId) {
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
