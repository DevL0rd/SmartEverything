import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { foldSurface, isAppendSurfaceEvent, isSurfaceEvent } from '@deepseek-ai/dsh-session';
import { readNativeHistory } from '@smarteverything/harness/process';
import { ApiError, DSH_SESSION_EVENTS_WRITE, JSON_VALUE } from '@smarteverything/domain';
import type { AiChatRow, AssistantMessageRow, DshSessionEvent } from '@smarteverything/domain';
import type { HarnessService } from './service';

const DATA = z.record(z.string(), JSON_VALUE);
const REMOVAL = z.object({ removed: z.array(z.int().nonnegative()) });
const HISTORY_EDIT = 'plugin:smarteverything/history-edit';
export function nativeHistoryPrefix(
  history: ReturnType<typeof readNativeHistory>,
  boundary: number,
): readonly unknown[] {
  if (boundary >= history.length - 1) return history;
  const removed = new Set(
    history.flatMap((event) =>
      hasType(event, HISTORY_EDIT) ? REMOVAL.parse(event.data).removed : [],
    ),
  );
  for (const event of history)
    if (
      event.seq > boundary &&
      isAppendSurfaceEvent(event) &&
      DATA.parse(event.data)['historyReplay'] !== true
    )
      removed.add(event.seq);
  return [...history, ...replacementEvents(history, removed)];
}

export function rewriteNativeHistory(
  service: HarnessService,
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
): void {
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null) return;
  const id = chat.engine.session_id;
  const host = service.directory.get(chat.engine.execution_target).host;
  const metadata = service.store.dshSessions.stat(id, chat.profile_id);
  if (metadata?.chat_id !== chat.id)
    throw new ApiError('forbidden', 'Native history belongs to another conversation.');
  const history = nativeHistory(service, chat, id, metadata.next_seq);
  const removed = new Set(
    history.flatMap((event) =>
      hasType(event, HISTORY_EDIT) ? REMOVAL.parse(event.data).removed : [],
    ),
  );
  const priorRemoved = removed.size;
  for (const row of rows)
    for (const seq of removedSequences(service, id, row, history)) removed.add(seq);
  if (removed.size === priorRemoved) return;
  const replacements = replacementEvents(history, removed);
  if (replacements.length === 0) return;
  service.store.durableWrite(() => {
    const principal = service.hostPrincipal(chat.profile_id, host);
    const opened = service.store.dshSessions.acquire(
      {
        session_id: id,
        target: host.target,
        runtime_instance: host.runtime_instance,
        connection_generation: host.connection_generation,
        operation_id: randomUUID(),
        lease_ms: 120_000,
      },
      principal,
    );
    if (opened.metadata.next_seq !== metadata.next_seq)
      throw new ApiError('conflict', 'Native history changed while its edit was being admitted.');
    const appended = service.store.dshSessions.append(
      { claim: opened.claim, operation_id: randomUUID(), events: replacements },
      principal,
    );
    service.store.dshSessions.release(
      { claim: opened.claim, operation_id: randomUUID(), expected_next_seq: appended.next_seq },
      principal,
    );
  });
}
function nativeHistory(
  service: HarnessService,
  chat: AiChatRow,
  id: string,
  count: number,
): ReturnType<typeof readNativeHistory> {
  const events = [];
  for (let offset = 0; offset < count; offset += 10_000)
    events.push(
      ...service.store.dshSessions.read({ session_id: id, offset, limit: 10_000 }, chat.profile_id)
        .events,
    );
  return readNativeHistory(service.store.dshSessions.stat(id, chat.profile_id)?.header, events);
}
function removedSequences(
  service: HarnessService,
  id: string,
  row: AssistantMessageRow,
  history: ReturnType<typeof readNativeHistory>,
): readonly number[] {
  const cut = service.store.harnessDeliveries.cutOfMessage(row.id);
  if (cut?.session_id === id && cut.state !== 'completed')
    throw new ApiError(
      'conflict',
      'This native delivery has no confirmed outcome; its history cannot be rewritten or retried.',
    );
  const imported = history.findIndex(
    (event) =>
      hasType(event, 'plugin:smarteverything/legacy-message') &&
      z.object({ id: z.literal(row.id) }).safeParse(event.data).success,
  );
  let originals: readonly number[] = [];
  if (imported >= 0) {
    const next = history.findIndex(
      (event, index) => index > imported && hasType(event, 'plugin:smarteverything/legacy-message'),
    );
    originals = history
      .slice(imported, next < 0 ? undefined : next)
      .filter((event) => isSurfaceEvent(event) && originalMessage(event.data, row.id))
      .map((event) => event.seq);
  }
  if (cut?.session_id !== id || cut.start_seq === null) return originals;
  const start = cut.start_seq;
  const end = cut.end_seq ?? history.length - 1;
  const delivered = history
    .filter(
      (event) =>
        event.seq >= start &&
        event.seq <= end &&
        isAppendSurfaceEvent(event) &&
        (row.role === 'person'
          ? event.type === 'user/message' &&
            z.object({ id: z.literal(cut.delivery_id) }).safeParse(event.data).success
          : row.role === 'responder'
            ? event.type === 'assistant/message' || event.type === 'tool/result'
            : false),
    )
    .map((event) => event.seq);
  return [...originals, ...delivered];
}
function replacementEvents(
  history: ReturnType<typeof readNativeHistory>,
  removed: ReadonlySet<number>,
): readonly DshSessionEvent[] {
  const surface = foldSurface(history).nodes;
  const nodes = history[surface[0] ?? -1]?.type === 'system/message' ? surface.slice(1) : surface;
  const first = nodes[0];
  const last = nodes.at(-1);
  if (first === undefined || last === undefined) return [];
  const base = history.length;
  const time = Date.now();
  const events: unknown[] = [
    { type: HISTORY_EDIT, seq: base, time, ignorable: true, data: { removed: [...removed] } },
    {
      type: 'system/message',
      seq: base + 1,
      time,
      surfaceOp: { op: 'replace', startSeq: first, endSeq: last },
      sourceEventSeqs: nodes,
      data: {
        turn: 0,
        step: 0,
        message: {
          id: randomUUID(),
          role: 'system',
          source: { kind: 'system-prompt' },
          content: [],
        },
      },
    },
  ];
  for (const source of retainedSurface(history, nodes, removed)) {
    const event = history[source];
    if (event === undefined) continue;
    const data = DATA.parse(event.data);
    events.push({
      type: event.type,
      time: event.time,
      seq: base + events.length,
      surfaceOp: 'append',
      data: { ...data, historyReplay: true, historyReplaySource: source },
    });
  }
  return DSH_SESSION_EVENTS_WRITE.parse(events.map((event) => JSON_VALUE.parse(event)));
}

function originalMessage(input: unknown, id: string): boolean {
  const message = z.object({ id: z.string() }).safeParse(input);
  if (message.success) return message.data.id === id || message.data.id.startsWith(`${id}:`);
  const wrapped = z.object({ message: z.object({ id: z.string() }) }).safeParse(input);
  return (
    wrapped.success &&
    (wrapped.data.message.id === id || wrapped.data.message.id.startsWith(`${id}:`))
  );
}

function hasType(event: { readonly type: string }, type: string): boolean {
  return event.type === type;
}
function retainedSurface(
  history: ReturnType<typeof readNativeHistory>,
  visible: readonly number[],
  removed: ReadonlySet<number>,
): readonly number[] {
  const affected = new Map<number, boolean>();
  const dependsOnRemoval = (seq: number): boolean => {
    const cached = affected.get(seq);
    if (cached !== undefined) return cached;
    const result = removed.has(seq) || sources(history, seq).some(dependsOnRemoval);
    affected.set(seq, result);
    return result;
  };
  const retain = (seq: number): readonly number[] => {
    const event = history[seq];
    if (event === undefined || event.type === 'system/message') return [];
    const origins = sources(history, seq);
    if (removed.has(seq)) return origins.flatMap(retain);
    const replay = DATA.parse(event.data)['historyReplay'] === true;
    return (replay || dependsOnRemoval(seq)) && origins.length > 0
      ? origins.flatMap(retain)
      : [seq];
  };
  return [...new Set(visible.flatMap(retain))];
}

function sources(history: ReturnType<typeof readNativeHistory>, seq: number): readonly number[] {
  const event = history[seq];
  if (event === undefined) return [];
  const replay = z.int().nonnegative().safeParse(DATA.parse(event.data)['historyReplaySource']);
  if (replay.success && replay.data < seq) return [replay.data];
  return (event.sourceEventSeqs ?? []).filter((source) => {
    const original = history[source];
    return source < seq && original !== undefined && isSurfaceEvent(original);
  });
}
