import { z } from 'zod';
import {
  type ChatToolItem,
  type ProviderEvent,
  type CodexProviderEvent,
} from '@smarteverything/domain';
import type { TurnStream } from '../../conversation/stream';

const TOOL_USE = z.object({
  type: z.literal('tool_use'),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown().optional(),
});
const TOOL_RESULT = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string().min(1),
  is_error: z.boolean().optional(),
  content: z.unknown().optional(),
  meta: z.unknown().optional(),
});
const MESSAGE = z.object({ message: z.object({ content: z.array(z.unknown()) }) });

function nativeToolItems(
  event: Extract<ProviderEvent, { kind: 'runtime' }>,
  known: readonly ChatToolItem[],
): ChatToolItem[] {
  if (typeof event.payload['parent_tool_use_id'] === 'string') return [];
  const parsed = MESSAGE.safeParse(event.payload);
  if (!parsed.success) return [];
  return parsed.data.message.content.flatMap((item): ChatToolItem[] => {
    const result = TOOL_RESULT.safeParse(item);
    if (result.success) {
      const previous = known.find((tool) => tool.callId === result.data.tool_use_id);
      return previous === undefined
        ? []
        : [{ ...previous, state: result.data.is_error === true ? 'failed' : 'done' }];
    }
    const tool = TOOL_USE.safeParse(item);
    if (!tool.success || tool.data.name.startsWith('mcp__home__')) return [];
    return [
      {
        callId: tool.data.id,
        name: tool.data.name.slice(0, 200),
        title: tool.data.name.slice(0, 200),
        state: 'running',
        detail: 'Native Claude Code tool',
      },
    ];
  });
}

export function streamDelta(
  stream: TurnStream,
  event: Extract<ProviderEvent, { kind: 'text' | 'thinking' }>,
): void {
  if (event.kind === 'text') stream.text(event.delta);
  else stream.reasoning(event.delta);
}

export type ReplyEvent = Extract<
  ProviderEvent | CodexProviderEvent,
  {
    kind:
      | 'text'
      | 'thinking'
      | 'runtime'
      | 'tool_call'
      | 'tool_result'
      | 'prompt'
      | 'dialog'
      | 'completed'
      | 'failed';
  }
>;
export function isReplyEvent(event: ProviderEvent | CodexProviderEvent): event is ReplyEvent {
  return [
    'text',
    'thinking',
    'runtime',
    'tool_call',
    'tool_result',
    'prompt',
    'dialog',
    'completed',
    'failed',
  ].includes(event.kind);
}

export function streamNativeTools(
  stream: TurnStream,
  event: Extract<ProviderEvent, { kind: 'runtime' }>,
): void {
  const message = MESSAGE.safeParse(event.payload);
  for (const item of nativeToolItems(event, stream.current().tools)) {
    const blocks = message.success ? message.data.message.content : [];
    const call = blocks
      .map((block) => TOOL_USE.safeParse(block))
      .find((parsed) => parsed.success && parsed.data.id === item.callId);
    const result = blocks
      .map((block) => TOOL_RESULT.safeParse(block))
      .find((parsed) => parsed.success && parsed.data.tool_use_id === item.callId);
    stream.tool(item, {
      ...(call?.success === true ? { input: call.data.input } : {}),
      ...(result?.success === true ? { output: nativeResultOutput(event, result.data) } : {}),
    });
  }
}

function nativeResultOutput(
  event: Extract<ProviderEvent, { kind: 'runtime' }>,
  result: z.infer<typeof TOOL_RESULT>,
): unknown {
  const native = event.payload['tool_use_result'];
  if (native === undefined && result.meta === undefined) return result.content;
  return {
    content: result.content,
    ...(result.meta === undefined ? {} : { meta: result.meta }),
    ...(native === undefined ? {} : { native_result: native }),
  };
}
