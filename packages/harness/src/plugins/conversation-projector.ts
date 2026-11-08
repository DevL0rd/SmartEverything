import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import type { Context } from '@deepseek-ai/cordis';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import { narrowNativeEvent } from '../reducer/event';
import type { NativeEvent } from '../reducer/event';
import { toolResultBody, turnEndBody } from '../reducer/outcome';

const TOOL = z.object({
  callId: z.string(),
  name: z.string(),
  state: z.enum(['running', 'completed', 'failed']),
  detail: z.string().nullable(),
  input: z.string().optional(),
  output: z.string().optional(),
});
const OP = z.discriminatedUnion('op', [
  z.object({ op: z.literal('text'), text: z.string() }),
  z.object({ op: z.literal('reasoning'), text: z.string() }),
  z.object({ op: z.literal('tool'), tool: TOOL }),
]);
const TURN_END = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('completed'), interrupted: z.boolean() }),
  z.object({ kind: z.literal('failed'), failure: z.object({ message: z.string() }) }),
]);
const ENDED = z.object({
  seq: z.int().nonnegative(),
  outcome: TURN_END,
  ops: z.array(OP),
});
const STATE = z.object({
  open: z.record(z.string(), z.array(OP)),
  calls: z.record(z.string(), z.string()),
  ended: z.record(z.string(), ENDED),
  unmatched: z.string().nullable(),
});
const ASSISTANT_CONTENT = z.object({
  data: z.object({
    message: z.object({
      content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
    }),
  }),
});
const TOOL_RESULT = z.object({
  call_id: z.string(),
  name: z.string(),
  state: z.enum(['completed', 'failed']),
  detail: z.string().nullable(),
  output: z.string(),
});

export type ProjectedTool = z.infer<typeof TOOL>;
export type ProjectedOp = z.infer<typeof OP>;
export type ProjectedEnd = z.infer<typeof TURN_END>;
export type ConversationState = z.infer<typeof STATE>;

export interface DeliveryProjection {
  readonly entered: boolean;
  readonly end: { readonly seq: number; readonly outcome: ProjectedEnd } | null;
  readonly ops: readonly ProjectedOp[];
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    smarteverythingConversation: ConversationState;
  }
}

export const name = 'conversation-projector';

const log = new Logger('hub.harness');

const EMPTY: ConversationState = { open: {}, calls: {}, ended: {}, unmatched: null };

function narrow(record: unknown): NativeEvent | undefined {
  try {
    return narrowNativeEvent(record);
  } catch (cause) {
    log.warn('record.skipped', {
      expected: 'a native session event the reducer can narrow',
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return undefined;
  }
}

function withOps(state: ConversationState, ops: readonly ProjectedOp[]): ConversationState {
  if (ops.length === 0 || Object.keys(state.open).length === 0) return state;
  const open = Object.fromEntries(
    Object.entries(state.open).map(([id, held]) => [id, [...held, ...ops]]),
  );
  return { ...state, open };
}

function blocks(record: unknown): readonly ProjectedOp[] {
  const parsed = ASSISTANT_CONTENT.safeParse(record);
  if (!parsed.success) return [];
  return parsed.data.data.message.content.flatMap((block): readonly ProjectedOp[] =>
    (block.type === 'text' || block.type === 'reasoning') && block.text !== undefined
      ? [{ op: block.type, text: block.text }]
      : [],
  );
}

function call(
  state: ConversationState,
  data: { readonly callId: string; readonly name: string; readonly arguments: string },
): ConversationState {
  const calls = { ...state.calls, [data.callId]: data.name };
  return withOps({ ...state, calls }, [
    {
      op: 'tool',
      tool: {
        callId: data.callId,
        name: data.name,
        state: 'running',
        detail: null,
        input: data.arguments,
      },
    },
  ]);
}

function result(
  state: ConversationState,
  data: Parameters<typeof toolResultBody>[1],
): ConversationState {
  const name = state.calls[data.message.toolCallId];
  if (Object.keys(state.open).length === 0) return state;
  if (name === undefined) return { ...state, unmatched: data.message.toolCallId };
  const parsed = TOOL_RESULT.safeParse(toolResultBody(name, data));
  if (!parsed.success) return state;
  const { call_id: callId, ...rest } = parsed.data;
  return withOps(state, [{ op: 'tool', tool: { callId, ...rest } }]);
}

function ended(
  state: ConversationState,
  data: Parameters<typeof turnEndBody>[0],
  seq: number,
): ConversationState {
  const outcome = TURN_END.parse(turnEndBody(data, seq, seq));
  const settled = Object.fromEntries(
    Object.entries(state.open).map(([id, ops]) => [id, { seq, outcome, ops }]),
  );
  return { open: {}, calls: {}, ended: settled, unmatched: null };
}

function entered(state: ConversationState, id: string): ConversationState {
  return Object.hasOwn(state.open, id) ? state : { ...state, open: { ...state.open, [id]: [] } };
}

export function stepConversation(state: ConversationState, record: unknown): ConversationState {
  const native = narrow(record);
  if (native === undefined) return state;
  const body = native.body;
  if (body.type === 'user/message') return entered(state, body.data.id);
  if (native.surface === 'replace' || native.replayed) return state;
  if (body.type === 'assistant/message') return withOps(state, blocks(record));
  if (body.type === 'tool/call') return call(state, body.data);
  if (body.type === 'tool/result') return result(state, body.data);
  if (body.type === 'turn/end') return ended(state, body.data, native.seq);
  return state;
}

export const CONVERSATION_PROJECTION: ProjectionDefinition<'smarteverythingConversation'> = {
  key: 'smarteverythingConversation',
  stateSchema: STATE,
  stateVersion: 1,
  init: (): ConversationState => EMPTY,
  apply: (state, event): ConversationState => stepConversation(state, event),
};

export function mount(ctx: Context): Promise<void> {
  ctx.inject(['sessionProjections'], (inner) => {
    inner.sessionProjections.register(CONVERSATION_PROJECTION);
  });
  return Promise.resolve();
}

export function projectDelivery(history: readonly unknown[], delivery: string): DeliveryProjection {
  let state = EMPTY;
  for (const record of history) {
    state = stepConversation(state, record);
    const settled = state.ended[delivery];
    if (settled !== undefined)
      return {
        entered: true,
        end: { seq: settled.seq, outcome: settled.outcome },
        ops: settled.ops,
      };
    if (state.unmatched !== null && Object.hasOwn(state.open, delivery))
      throw new Error('Native tool result has no original retained call identity.');
  }
  const ops = state.open[delivery];
  return ops === undefined
    ? { entered: false, end: null, ops: [] }
    : { entered: true, end: null, ops };
}
