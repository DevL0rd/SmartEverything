import { z } from 'zod';

export const AI_ROUTE_INFO_QUERY = z.strictObject({
  route_id: z.uuid(),
  model: z.string().trim().min(1).max(200),
});
export type AiRouteInfoQuery = z.infer<typeof AI_ROUTE_INFO_QUERY>;

export const AI_ROUTE_REASONING_EFFORT = z.strictObject({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
});
export type AiRouteReasoningEffort = z.infer<typeof AI_ROUTE_REASONING_EFFORT>;

export const AI_PERMISSION_PRESET_OPTION = z.strictObject({
  value: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
});
export type AiPermissionPresetOption = z.infer<typeof AI_PERMISSION_PRESET_OPTION>;

export const AI_PERMISSION_PRESETS = z.strictObject({
  options: z.array(AI_PERMISSION_PRESET_OPTION),
  default_options: z.array(AI_PERMISSION_PRESET_OPTION),
  default_preset: z.string().min(1).max(200),
  custom: AI_PERMISSION_PRESET_OPTION.describe(
    'How a session shows when its sandbox and approval match no preset; never a switch target',
  ),
});
export type AiPermissionPresets = z.infer<typeof AI_PERMISSION_PRESETS>;

export const AI_ROUTE_INFO = z.strictObject({
  route_id: z.uuid(),
  model: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  input_modalities: z
    .array(z.enum(['text', 'image']))
    .nullable()
    .describe('What the route accepts; null when the route does not say'),
  context_window: z.int().positive().nullable(),
  default_max_tokens: z.int().positive().nullable(),
  reasoning: z
    .strictObject({
      efforts: z
        .array(AI_ROUTE_REASONING_EFFORT)
        .describe('Least to greatest selectable reasoning effort'),
      default_effort: z.string().min(1).max(32).nullable(),
    })
    .nullable()
    .describe('null when the route exposes no selectable reasoning'),
  system_prompt_update: z.literal('in-history').nullable(),
  tool_update: z.enum(['in-history', 'addition-only']).nullable(),
  permission_presets: AI_PERMISSION_PRESETS.nullable().describe(
    'The permission presets the native runtime offers; null when no runtime is composed',
  ),
});
export type AiRouteInfo = z.infer<typeof AI_ROUTE_INFO>;
