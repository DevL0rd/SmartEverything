import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  foldSurface,
  isAppendSurfaceEvent,
  isSurfaceEvent,
  pluginRecordOf,
} from '@deepseek-ai/dsh-session';
import { imageOffloadProjection } from '@deepseek-ai/dsh-compaction-image-offload/projection';
import type { PluginRecordMap } from '@deepseek-ai/dsh-session/types';
import { readNativeHistory } from '@smarteverything/harness/process';
import { ApiError, DSH_SESSION_EVENTS_WRITE, JSON_VALUE } from '@smarteverything/domain';
import type { AiChatRow, AssistantMessageRow, DshSessionEvent } from '@smarteverything/domain';
import type { HarnessService } from './service';

const DATA = z.record(z.string(), JSON_VALUE);
const REMOVAL = z.object({ removed: z.array(z.int().nonnegative()) });
export const SESSION_MESSAGE_PROJECTIONS = [imageOffloadProjection];
const HISTORY_EDIT = 'plugin:smarteverything/history-edit';

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:smarteverything/history-edit': { readonly removed: readonly number[] };
  }
}

function editedSequences(history: ReturnType<typeof readNativeHistory>): readonly number[] {
  return history.flatMap((event) => {
    const record = pluginRecordOf(event);
    return record?.type === HISTORY_EDIT ? REMOVAL.parse(record.data).removed : [];
  });
}

export function nativeHistoryPrefix(
  history: ReturnType<typeof readNativeHistory>,
  boundary: number,
): readonly unknown[] {
  if (boundary >= history.length - 1) return history;
  const removed = new Set(editedSequences(history));
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
  const metadata = service.store.dshSessions.stat(id, chat.profile_id);
  if (metadata?.chat_id !== chat.id)
    throw new ApiError('forbidden', 'Native history belongs to another conversation.');
  const history = nativeHistory(service, chat, id);
  const removed = new Set(editedSequences(history));
  const priorRemoved = removed.size;
  for (const row of rows)
    for (const seq of removedSequences(service, id, row, history)) removed.add(seq);
  if (removed.size === priorRemoved) return;
  const replacements = replacementEvents(history, removed);
  if (replacements.length === 0) return;
  service.store.dshSessions.rewrite(id, chat.profile_id, replacements);
}
function nativeHistory(
  service: HarnessService,
  chat: AiChatRow,
  id: string,
): ReturnType<typeof readNativeHistory> {
  return readNativeHistory(
    service.store.dshSessions.stat(id, chat.profile_id)?.header,
    service.store.dshSessions.readAll(id, chat.profile_id),
  );
}
function removedSequences(
  service: HarnessService,
  id: string,
  row: AssistantMessageRow,
  history: ReturnType<typeof readNativeHistory>,
): readonly number[] {
  const cut = service.store.harnessDeliveries.cutOfMessage(row.id);
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
function editRecord(seq: number, time: number, removed: ReadonlySet<number>): unknown {
  return {
    type: HISTORY_EDIT,
    seq,
    time,
    ignorable: true,
    data: { removed: [...removed] } satisfies PluginRecordMap[typeof HISTORY_EDIT],
  };
}
function replacementEvents(
  history: ReturnType<typeof readNativeHistory>,
  removed: ReadonlySet<number>,
): readonly DshSessionEvent[] {
  const surface = foldSurface(history, SESSION_MESSAGE_PROJECTIONS).nodes;
  const nodes = history[surface[0] ?? -1]?.type === 'system/message' ? surface.slice(1) : surface;
  const first = nodes[0];
  const last = nodes.at(-1);
  if (first === undefined || last === undefined) return [];
  const base = history.length;
  const time = Date.now();
  const events: unknown[] = [
    editRecord(base, time, removed),
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
