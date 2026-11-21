import { z } from 'zod';
import type { AiAgentRun } from '@smarteverything/domain';
import type { HostStore } from '../../../store/host/host-store';
import { storeUnit } from '../../../store/host/unit';
import { nativeChildTask, touchNativeChild, type ChildTask } from './children-live';
import { UNNAMED_CHILD, childTitle } from './children-adoption';
const TURN_END = z.object({ reason: z.object({ kind: z.string() }) });
const ASSISTANT = z.object({ message: z.object({ content: z.array(z.unknown()) }) });
const TEXT_BLOCK = z.object({ type: z.literal('text'), text: z.string() });

export interface FoldedEvent {
  readonly type: string;
  readonly data: unknown;
}

export interface AppendedEvent extends FoldedEvent {
  readonly time: number;
}

type SessionEvents = readonly FoldedEvent[];

function textOf(content: readonly unknown[]): string {
  return content
    .flatMap((block) => {
      const text = TEXT_BLOCK.safeParse(block);
      return text.success ? [text.data.text] : [];
    })
    .join('');
}

export function lastAssistantText(events: SessionEvents): string {
  for (const event of events.toReversed()) {
    if (event.type !== 'assistant/message') continue;
    const message = ASSISTANT.safeParse(event.data);
    const text = message.success ? textOf(message.data.message.content) : '';
    if (text !== '') return text;
  }
  return '';
}

export interface NativeChildOutcome {
  readonly state: Extract<AiAgentRun['state'], 'completed' | 'interrupted' | 'failed'>;
  readonly kind: string;
}

export function nativeChildOutcome(events: SessionEvents): NativeChildOutcome | undefined {
  for (const event of events.toReversed()) {
    if (event.type !== 'turn/end') continue;
    const end = TURN_END.safeParse(event.data);
    if (!end.success) continue;
    const { kind } = end.data.reason;
    return {
      kind,
      state: kind === 'completed' ? 'completed' : kind === 'aborted' ? 'interrupted' : 'failed',
    };
  }
  return undefined;
}

export function settleNativeChild(
  store: HostStore,
  sessionId: string,
  appended: SessionEvents,
  now: string,
): AiAgentRun | undefined {
  const outcome = nativeChildOutcome(appended);
  if (outcome === undefined) return undefined;
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  if (run?.completed_at !== null) return undefined;
  const text = lastAssistantText(store.dshSessions.readAll(sessionId, run.profile_id));
  store.assistantEvents.mark(run.source_id, 'answered_at');
  return store.aiAgentRuns.upsert({
    ...run,
    state: outcome.state,
    result: outcome.state === 'completed' ? text : run.result,
    error: outcome.state === 'failed' ? `The helper ended: ${outcome.kind}.` : null,
    updated_at: now,
    completed_at: now,
    source_seq: run.source_seq + 1,
    supported_actions: ['open_chat', 'delete'],
  });
}

const DESCRIPTOR = z.object({
  type: z.literal('subagent/descriptor'),
  data: z.object({ label: z.string().min(1) }),
});
const FIRST_TASK = z.object({
  type: z.literal('user/message'),
  data: z.object({ content: z.array(z.unknown()) }),
});

function describedLabel(events: SessionEvents): string | undefined {
  for (const event of events) {
    const descriptor = DESCRIPTOR.safeParse(event);
    if (descriptor.success) return descriptor.data.data.label;
  }
  return undefined;
}

function describedTask(events: SessionEvents): string | undefined {
  for (const event of events) {
    const message = FIRST_TASK.safeParse(event);
    const text = message.success ? textOf(message.data.data.content) : '';
    if (text !== '') return text;
  }
  return undefined;
}

function describedTitle(
  run: AiAgentRun,
  label: string | undefined,
  task: string | undefined,
): string {
  if (label === undefined && run.title !== UNNAMED_CHILD) return run.title;
  return childTitle(label ?? '', task ?? run.task ?? '');
}

export function describeNativeChild(
  store: HostStore,
  sessionId: string,
  appended: SessionEvents,
): AiAgentRun | undefined {
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  if (run?.completed_at !== null || run.child_chat_id === null) return undefined;
  const label = describedLabel(appended);
  const task = run.task === null ? describedTask(appended) : undefined;
  if (label === undefined && task === undefined) return undefined;
  const title = describedTitle(run, label, task);
  if (title !== run.title) store.aiChats.update(run.child_chat_id, { title });
  return store.aiAgentRuns.upsert({
    ...run,
    title,
    task: task ?? run.task,
    source_seq: run.source_seq + 1,
  });
}

export interface SettledChild {
  readonly run: AiAgentRun;
  readonly taskId: string | null;
}

export interface ChildAppended {
  readonly task: ChildTask | null;
  readonly settled: SettledChild | null;
}

export const CHILD_APPENDED_UNIT = storeUnit(
  (
    store,
    input: {
      readonly sessionId: string;
      readonly events: readonly AppendedEvent[];
      readonly now: string;
    },
  ): ChildAppended => {
    const { sessionId, events } = input;
    const task = nativeChildTask(store, sessionId, events);
    touchNativeChild(store, sessionId, events);
    describeNativeChild(store, sessionId, events);
    const run = settleNativeChild(store, sessionId, events, input.now);
    return {
      task,
      settled:
        run === undefined
          ? null
          : { run, taskId: store.assistantEvents.event(run.source_id).message_id },
    };
  },
);
