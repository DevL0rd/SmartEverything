import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';

const COUNT = z.int().nonnegative();
const USAGE = z.looseObject({
  inputTokens: COUNT,
  outputTokens: COUNT,
  totalTokens: COUNT.optional(),
  cacheReadTokens: COUNT.optional(),
  cacheWriteTokens: COUNT.optional(),
  reasoningTokens: COUNT.optional(),
});
const STREAM_RECORD = z.looseObject({
  type: z.string(),
  chunk: z.looseObject({ type: z.string(), usage: USAGE.optional() }).optional(),
});
const ASSISTANT_DATA = z.object({ stream: z.array(STREAM_RECORD).optional() }).optional();
const TOOL_BLOCK = z.looseObject({ type: z.string(), text: z.string().optional() });
const BODY = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn/start') }),
  z.object({
    type: z.literal('turn/end'),
    data: z.object({
      turn: COUNT,
      reason: z.looseObject({
        kind: z.string(),
        error: z.looseObject({ message: z.string() }).optional(),
      }),
    }),
  }),
  z.object({ type: z.literal('user/message'), data: z.object({ id: z.string() }) }),
  z.object({
    type: z.literal('agent/inbox/spliced'),
    data: z.object({ target: z.string(), inserted: z.array(z.object({ id: z.string() })) }),
  }),
  z.object({
    type: z.literal('llm/retry'),
    data: z.object({ failure: z.object({ code: z.string() }) }),
  }),
  z.object({ type: z.literal('llm/retry-started') }),
  z.object({
    type: z.literal('working-directory/change'),
    data: z.object({ cwd: z.string().min(1) }),
  }),
  z.object({
    type: z.literal('tool/call'),
    data: z.object({ callId: z.string().min(1), name: z.string().min(1), arguments: z.string() }),
  }),
  z.object({
    type: z.literal('tool/result'),
    data: z.object({
      message: z.object({
        toolCallId: z.string().min(1),
        isError: z.boolean().optional(),
        content: z.array(TOOL_BLOCK),
      }),
      error: JSON_VALUE.optional(),
      meta: JSON_VALUE.optional(),
    }),
  }),
  z.object({
    type: z.literal('request/context'),
    data: z.object({
      provider: z.string(),
      model: z.string(),
      contextWindow: z.int().positive().optional(),
    }),
  }),
  z.object({ type: z.literal('compaction/start') }),
  z.object({ type: z.literal('compaction/end') }),
  z.object({ type: z.literal('command/done') }),
  z.object({ type: z.literal('assistant/message'), data: ASSISTANT_DATA }),
  z.object({ type: z.literal('assistant/attempt'), data: ASSISTANT_DATA }),
]);
const ENVELOPE = z.looseObject({ type: z.string(), seq: COUNT, surfaceOp: JSON_VALUE.optional() });
const REPLAY_COPY = z.object({ data: z.looseObject({ historyReplay: z.literal(true) }) });
const KNOWN = new Set<string>(BODY.options.map((option) => option.shape.type.value));
const SURFACE = new Set<string>([
  'system/message',
  'developer/message',
  'user/message',
  'assistant/message',
  'tool/result',
]);

export type NativeBody = z.infer<typeof BODY> | { readonly type: 'other' };
export type NativeUsageRecord = z.infer<typeof USAGE>;
type StreamRecord = z.infer<typeof STREAM_RECORD>;
export interface NativeEvent {
  readonly seq: number;
  readonly surface: 'append' | 'replace' | null;
  readonly replayed: boolean;
  readonly body: NativeBody;
}

function surfaceOf(type: string, surfaceOp: unknown): NativeEvent['surface'] {
  if (!SURFACE.has(type) || surfaceOp === undefined) return null;
  return surfaceOp === 'append' ? 'append' : 'replace';
}

export function narrowNativeEvent(event: unknown): NativeEvent {
  const envelope = ENVELOPE.parse(event);
  return {
    seq: envelope.seq,
    surface: surfaceOf(envelope.type, envelope.surfaceOp),
    replayed: REPLAY_COPY.safeParse(event).success,
    body: KNOWN.has(envelope.type) ? BODY.parse(event) : { type: 'other' },
  };
}

function usageRecords(stream: readonly StreamRecord[] | undefined): readonly StreamRecord[] {
  return (stream ?? []).filter(
    (record) =>
      record.type === 'chunk' && record.chunk?.type === 'usage' && record.chunk.usage !== undefined,
  );
}

export function usageOfAssistant(body: NativeBody): readonly NativeUsageRecord[] {
  if (body.type !== 'assistant/message' && body.type !== 'assistant/attempt') return [];
  return usageRecords(body.data?.stream).flatMap((record) =>
    record.chunk?.usage === undefined ? [] : [record.chunk.usage],
  );
}

export function isProjectedType(type: string): boolean {
  return KNOWN.has(type) || SURFACE.has(type);
}
