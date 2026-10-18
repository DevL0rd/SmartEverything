import { useEffect, useRef } from 'react';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { Logger, passesThreshold } from '@smarteverything/logging';

const log = new Logger('app.chat');

const TAIL = 8;
const PROGRESS_MS = 3000;

interface Seen {
  readonly state: string | null;
  readonly steps: number;
  readonly failedSteps: number;
}

class StreamTally {
  private updates = 0;
  private chars = 0;
  private lastChars = 0;
  private lastId: string | null = null;
  private loggedAt = 0;

  observe(chatId: string, row: TraceRow, now: number): void {
    if (this.lastId !== row.id) {
      this.lastId = row.id;
      this.lastChars = row.text.length;
      this.updates = 0;
      this.chars = 0;
      this.loggedAt = now;
    }
    if (row.text.length !== this.lastChars) {
      this.updates += 1;
      this.chars += Math.max(0, row.text.length - this.lastChars);
      this.lastChars = row.text.length;
    }
    if (now - this.loggedAt >= PROGRESS_MS && this.updates > 0) this.flush(chatId, row, now);
  }

  private flush(chatId: string, row: TraceRow, now: number): void {
    log.debug('stream.progress', {
      chatId,
      messageId: row.id,
      updates: this.updates,
      chars: this.chars,
      totalChars: row.text.length,
      windowMs: now - this.loggedAt,
    });
    this.updates = 0;
    this.chars = 0;
    this.loggedAt = now;
  }
}

export type TraceRow = Pick<
  AssistantMessageRow,
  | 'id'
  | 'role'
  | 'kind'
  | 'state'
  | 'text'
  | 'attachments'
  | 'steps'
  | 'step_states'
  | 'reason_code'
>;

export class TraceState {
  readonly seen = new Map<string, Seen>();
  readonly tally = new StreamTally();
}

function failedStepCount(row: TraceRow): number {
  return row.step_states.filter((outcome) => outcome === 'failed').length;
}

function seenOf(row: TraceRow): Seen {
  return { state: row.state, steps: row.steps.length, failedSteps: failedStepCount(row) };
}

function reportAppeared(chatId: string, row: TraceRow, next: Seen): void {
  log.debug('message.appeared', {
    chatId,
    messageId: row.id,
    role: row.role,
    kind: row.kind,
    state: row.state,
    textLength: row.text.length,
    attachments: row.attachments.length,
    steps: next.steps,
  });
}

function reportChanged(chatId: string, row: TraceRow, from: Seen, to: Seen): void {
  if (from.state !== to.state) {
    log.info('message.state_changed', {
      chatId,
      messageId: row.id,
      role: row.role,
      kind: row.kind,
      from: from.state,
      to: to.state,
      reasonCode: row.reason_code,
      textLength: row.text.length,
      steps: to.steps,
      failedSteps: to.failedSteps,
    });
  }
  if (from.steps !== to.steps) {
    log.debug('tool.steps_changed', {
      chatId,
      messageId: row.id,
      from: from.steps,
      to: to.steps,
      state: row.state,
    });
  }
  if (from.failedSteps !== to.failedSteps) {
    log.warn('tool.step_failed', {
      chatId,
      messageId: row.id,
      failedSteps: to.failedSteps,
      steps: to.steps,
    });
  }
}

function traceRow(chatId: string, row: TraceRow, state: TraceState, now: number): void {
  const next = seenOf(row);
  const previous = state.seen.get(row.id);
  state.seen.set(row.id, next);
  if (previous === undefined) reportAppeared(chatId, row, next);
  else reportChanged(chatId, row, previous, next);
  if (row.state === 'working') state.tally.observe(chatId, row, now);
}

function pruneSeen(rows: readonly TraceRow[], start: number, state: TraceState): void {
  if (state.seen.size <= TAIL * 4) return;
  const keep = new Set(rows.slice(start).map((row) => row.id));
  for (const id of state.seen.keys()) if (!keep.has(id)) state.seen.delete(id);
}

export function traceRows(
  chatId: string,
  rows: readonly TraceRow[],
  state: TraceState,
  now: number,
): void {
  const start = Math.max(0, rows.length - TAIL);
  for (const row of rows.slice(start)) traceRow(chatId, row, state, now);
  pruneSeen(rows, start, state);
}

interface Latest {
  readonly rows: number;
  readonly active: boolean;
  readonly engineKind: string;
}

function useTurnTrace(chatId: string, working: boolean, latest: { current: Latest }): void {
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (working) {
      startedAt.current = now;
      log.info('turn.started', { chatId, rows: latest.current.rows });
      return;
    }
    if (startedAt.current === null) return;
    log.info('turn.finished', {
      chatId,
      rows: latest.current.rows,
      durationMs: now - startedAt.current,
    });
    startedAt.current = null;
  }, [chatId, working, latest]);
}

function useEngineTrace(chatId: string, engineKind: string): void {
  const last = useRef<{ chatId: string; engineKind: string } | null>(null);
  useEffect(() => {
    const previous = last.current;
    last.current = { chatId, engineKind };
    if (previous?.chatId !== chatId || previous.engineKind === engineKind) return;
    log.info('chat.engine_changed', { chatId, engineKind });
  }, [chatId, engineKind]);
}

export function useChatTrace(
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
  active: boolean,
  working: boolean,
): void {
  const chatId = chat.id;
  const engineKind = chat.engine.kind;
  const state = useRef(new TraceState());
  const latest = useRef<Latest>({ rows: rows.length, active, engineKind });
  useEffect(() => {
    latest.current = { rows: rows.length, active, engineKind };
  });
  useEffect(() => {
    const openedAt = Date.now();
    state.current = new TraceState();
    log.info('chat.mounted', { chatId, ...latest.current });
    return (): void => {
      log.info('chat.unmounted', { chatId, openedMs: Date.now() - openedAt });
    };
  }, [chatId]);
  useEffect(() => {
    log.info('chat.focus_changed', { chatId, active });
  }, [chatId, active]);
  useTurnTrace(chatId, working, latest);
  useEngineTrace(chatId, engineKind);
  useEffect(() => {
    if (!passesThreshold('debug', Logger.level)) return;
    traceRows(chatId, rows, state.current, Date.now());
  }, [chatId, rows]);
}
