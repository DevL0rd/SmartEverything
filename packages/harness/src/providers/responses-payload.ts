import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import { SubscriptionProviderError } from './errors';

const FUNCTION_TOOL = z.looseObject({
  type: z.literal('function'),
  name: z.string().min(1),
  parameters: JSON_VALUE,
});
const PAYLOAD = z.looseObject({
  model: z.string().min(1),
  input: z.array(JSON_VALUE),
  stream: z.literal(true),
  store: z.literal(false),
  tools: z.array(FUNCTION_TOOL).optional(),
});
const UNSUPPORTED_FIELDS = [
  'background',
  'conversation',
  'max_output_tokens',
  'max_tool_calls',
  'metadata',
  'moderation',
  'multi_agent',
  'prompt',
  'prompt_cache_retention',
  'safety_identifier',
  'temperature',
  'top_logprobs',
  'top_p',
  'truncation',
  'user',
  'previous_response_id',
  'service_tier',
] as const;

export function subscriptionResponsesPayload(payload: unknown): unknown {
  const parsed = PAYLOAD.parse(serializedPayload(payload));
  for (const key of UNSUPPORTED_FIELDS) {
    if (parsed[key] !== undefined)
      throw new SubscriptionProviderError(
        'CAPABILITY_UNAVAILABLE',
        `ChatGPT subscription Responses does not accept ${key}.`,
      );
  }
  for (const item of parsed.input) {
    const message = z
      .object({ role: z.string().optional(), type: z.string().optional() })
      .safeParse(item);
    if (
      message.success &&
      (message.data.role === 'system' ||
        message.data.type === 'tool_search_call' ||
        message.data.type === 'tool_search_output')
    )
      throw new SubscriptionProviderError(
        'CAPABILITY_UNAVAILABLE',
        'ChatGPT subscription history contains an unsupported system message or tool search.',
      );
  }
  return {
    ...parsed,
    ...(parsed.tools === undefined
      ? {}
      : { tools: [{ type: 'namespace', name: 'smarteverything', tools: parsed.tools }] }),
  };
}

export function subscriptionResponsesEvent(event: unknown): void {
  const parsed = z.object({ type: z.string() }).parse(event);
  if (parsed.type === 'response.incomplete')
    throw new SubscriptionProviderError(
      'PROVIDER_UNAVAILABLE',
      'ChatGPT subscription response was incomplete; no successful terminal response was received.',
    );
  if (parsed.type === 'response.completed')
    z.object({ response: z.object({ status: z.literal('completed') }) }).parse(event);
}

function serializedPayload(payload: unknown): unknown {
  try {
    return JSON_VALUE.parse(JSON.parse(JSON.stringify(payload)));
  } catch (error) {
    throw new SubscriptionProviderError(
      'CAPABILITY_UNAVAILABLE',
      `ChatGPT subscription payload cannot be serialized as JSON (${error instanceof Error ? error.name : 'unknown'}).`,
    );
  }
}
