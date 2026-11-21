import { DSH_WRITER_CLAIM_WRITE, JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';

export const INFERENCE = z.strictObject({
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  claim: DSH_WRITER_CLAIM_WRITE,
  route_id: z.uuid(),
  request: z.strictObject({
    model: z.string().min(1),
    stream: z.literal(true),
    messages: z.array(JSON_VALUE),
    stream_options: z.strictObject({ include_usage: z.literal(true) }).optional(),
    store: z.literal(false).optional(),
    max_tokens: z.int().positive().optional(),
    max_completion_tokens: z.int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    tools: z.array(JSON_VALUE).optional(),
    tool_choice: JSON_VALUE.optional(),
    reasoning: z.strictObject({ effort: z.string().min(1) }).optional(),
    reasoning_effort: z.string().min(1).optional(),
    prompt_cache_key: z.string().optional(),
    prompt_cache_retention: z.literal('24h').optional(),
  }),
});

export type InferenceRequest = z.output<typeof INFERENCE>;
