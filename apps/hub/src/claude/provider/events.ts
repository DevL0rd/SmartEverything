import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type ProviderEvent } from '@smarteverything/domain';

export type ProviderPayload = ProviderEvent extends infer E
  ? E extends ProviderEvent
    ? Omit<E, 'job_id' | 'chat_id' | 'seq'>
    : never
  : never;

export function resultEvents(
  message: SDKResultMessage,
  interrupted: boolean,
): readonly ProviderPayload[] {
  const usage: ProviderPayload = {
    kind: 'usage',
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_tokens: message.usage.cache_read_input_tokens,
    cache_write_tokens: message.usage.cache_creation_input_tokens,
    cost_usd: message.total_cost_usd,
  };
  if (interrupted)
    return [usage, { kind: 'completed', session_id: message.session_id, interrupted: true }];
  if (message.subtype !== 'success' || message.is_error) {
    const error = message.subtype === 'success' ? message.result : message.errors.join('; ');
    return [usage, { kind: 'failed', code: message.subtype, message: error.slice(0, 2000) }];
  }
  return [usage, { kind: 'completed', session_id: message.session_id, interrupted }];
}

export function messageEvents(message: SDKMessage): readonly ProviderPayload[] {
  if ('parent_tool_use_id' in message && message.parent_tool_use_id !== null) return [];
  if (message.type === 'stream_event') {
    return streamEvents(message);
  }
  if (message.type === 'rate_limit_event') {
    const info = message.rate_limit_info;
    return [
      {
        kind: 'rate_limit',
        status: info.status,
        resets_at:
          info.resetsAt === undefined ? null : new Date(info.resetsAt * 1000).toISOString(),
        detail: info.rateLimitType ?? 'Claude subscription rate limit',
      },
    ];
  }
  if (message.type === 'system') return systemEvents(message);
  return [];
}

function systemEvents(
  message: Extract<SDKMessage, { type: 'system' }>,
): readonly ProviderPayload[] {
  if (message.subtype === 'init') return [{ kind: 'accepted', session_id: message.session_id }];
  if (message.subtype === 'local_command_output') return [{ kind: 'text', delta: message.content }];
  return [];
}

function streamEvents(
  message: Extract<SDKMessage, { type: 'stream_event' }>,
): readonly ProviderPayload[] {
  const event = message.event;
  if (event.type !== 'content_block_delta') {
    return [];
  }
  if (event.delta.type === 'text_delta') {
    return [{ kind: 'text', delta: event.delta.text }];
  }
  if (event.delta.type === 'thinking_delta') {
    return [{ kind: 'thinking', delta: event.delta.thinking }];
  }
  return [];
}

export function serializableMessage(message: SDKMessage): ReturnType<typeof JSON_VALUE.parse> {
  const json: unknown = JSON.parse(JSON.stringify(message));
  return JSON_VALUE.parse(json);
}

export function carriesToolResult(message: SDKMessage): boolean {
  return (
    message.type !== 'user' ||
    (typeof message.message.content !== 'string' &&
      message.message.content.some((block) => block.type === 'tool_result'))
  );
}
