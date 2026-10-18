import { z } from 'zod';
import { ASSISTANT_ATTACHMENT_BYTES_MAX } from '../assistant';
import { JSON_VALUE } from '../values';

export const HARNESS_CENTRAL_TOOL = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  parameters: z.record(z.string(), JSON_VALUE),
});
export const HARNESS_CENTRAL_CATALOGUE = z.array(HARNESS_CENTRAL_TOOL);
export const HARNESS_CENTRAL_CONTEXT = z.object({
  system: z.string(),
  turn: z.string(),
  tools: HARNESS_CENTRAL_CATALOGUE,
  declared_tool_names: z.array(z.string().min(1)),
  compact_at_percent: z.number().int().min(50).max(95),
});
export const HARNESS_CENTRAL_RESULT = z.object({
  response: z.record(z.string(), JSON_VALUE),
  pictures: z
    .array(
      z.object({
        data: z.base64().max(Math.ceil(ASSISTANT_ATTACHMENT_BYTES_MAX / 3) * 4),
        mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      }),
    )
    .max(100),
});
export const HARNESS_PLUGIN_AGENT_POLICY = z.strictObject({
  persona: z.string().min(1).max(100_000),
  tools: z.array(z.string().min(1).max(200)).max(2000).optional(),
});
export const HARNESS_PLUGIN_AGENT_RESULT = z.strictObject({
  child_id: z.uuid(),
  run_id: z.uuid(),
  state: z.enum(['queued', 'running', 'completed', 'interrupted', 'failed']),
  text: z.string().max(200_000).nullable(),
});
