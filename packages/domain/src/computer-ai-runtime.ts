import { z } from 'zod';
import {
  COMPUTER_AI_SETTINGS,
  COMPUTER_AI_SETTINGS_PATCH,
  COMPUTER_AI_MODEL,
  COMPUTER_AI_SETTING,
  COMPUTER_AI_OPERATIONS,
  NATIVE_MANAGED_PROJECT,
} from './computer-ai';
import { CODEX_AI_SETTINGS, CODEX_AI_SETTINGS_PATCH } from './codex';

export const COMPUTER_AI_RUNTIME = z.enum(['claude', 'codex']);
export type ComputerAiRuntime = z.infer<typeof COMPUTER_AI_RUNTIME>;
export const COMPUTER_RUNTIME_TARGET = z.strictObject({
  device_id: z.uuid(),
  runtime: COMPUTER_AI_RUNTIME,
});
export type ComputerRuntimeTarget = z.infer<typeof COMPUTER_RUNTIME_TARGET>;
export function computerRuntimeKey(target: ComputerRuntimeTarget): string {
  return JSON.stringify([target.device_id, target.runtime]);
}
export const COMPUTER_RUNTIME_SETTINGS = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), settings: COMPUTER_AI_SETTINGS }),
  z.strictObject({ runtime: z.literal('codex'), settings: CODEX_AI_SETTINGS }),
]);
export type ComputerRuntimeSettings = z.infer<typeof COMPUTER_RUNTIME_SETTINGS>;
export const COMPUTER_RUNTIME_SETTINGS_PATCH = z.discriminatedUnion('runtime', [
  z.strictObject({ runtime: z.literal('claude'), settings: COMPUTER_AI_SETTINGS_PATCH }),
  z.strictObject({ runtime: z.literal('codex'), settings: CODEX_AI_SETTINGS_PATCH }),
]);
export type ComputerRuntimeSettingsPatch = z.infer<typeof COMPUTER_RUNTIME_SETTINGS_PATCH>;
export const COMPUTER_RUNTIME_OPERATIONS = [
  ...COMPUTER_AI_OPERATIONS,
  'resume',
  'send',
  'steer',
  'interrupt',
  'rename',
  'fork',
  'archive',
  'unarchive',
  'delete',
] as const;
export const COMPUTER_RUNTIME_CAPABILITIES = z.strictObject({
  managed_projects: z.object({ protocol: z.literal(1) }).optional(),
  runtime_version: z.string().max(100).nullable(),
  capability_revision: z.string().min(1).max(200),
  operations: z.array(z.enum(COMPUTER_RUNTIME_OPERATIONS)).max(100),
  settings: z.array(COMPUTER_AI_SETTING).max(500),
  control_reason: z.string().max(2000).nullable(),
  provider_reason: z.string().max(2000).nullable(),
  authentication: z.enum(['chatgpt', 'api_key', 'other', 'unknown']),
  subscription: z.enum(['unverified', 'eligible', 'ineligible']),
  input_modalities: z.array(z.enum(['text', 'image', 'audio'])).max(3),
  local_features: z.strictObject({
    files: z.boolean().optional(),
    commands: z.boolean().optional(),
    mcp: z.boolean().optional(),
    agents: z.boolean().optional(),
  }),
  unavailable_operations: z
    .partialRecord(z.enum(COMPUTER_RUNTIME_OPERATIONS), z.string().min(1).max(2000))
    .optional(),
});
export type ComputerRuntimeCapabilities = z.infer<typeof COMPUTER_RUNTIME_CAPABILITIES>;
export const PROVIDER_EXECUTION_CONTEXT = COMPUTER_RUNTIME_TARGET.extend({
  managed_project: NATIVE_MANAGED_PROJECT.optional(),
  session_id: z.string().min(1).max(200).nullable(),
  process_generation: z.uuid(),
  cwd: z.string().min(1).max(4096),
  workspace_roots: z.array(z.string().min(1).max(4096)).max(101).optional(),
});
export type ProviderExecutionContext = z.infer<typeof PROVIDER_EXECUTION_CONTEXT>;
export const COMPUTER_RUNTIME_MODEL = COMPUTER_AI_MODEL.extend({
  runtime: COMPUTER_AI_RUNTIME,
  input_modalities: z.array(z.enum(['text', 'image', 'audio'])).max(3),
  service_tiers: z.array(z.string().min(1).max(100)).max(100).optional(),
  context_window: z.int().positive().nullable().optional(),
});
export type ComputerRuntimeModel = z.infer<typeof COMPUTER_RUNTIME_MODEL>;
export const COMPUTER_RUNTIME_STATUS = z
  .strictObject({
    device_id: z.uuid(),
    runtime: COMPUTER_AI_RUNTIME,
    local: z.boolean(),
    online: z.boolean(),
    settings: COMPUTER_RUNTIME_SETTINGS,
    capabilities: COMPUTER_RUNTIME_CAPABILITIES,
    context: PROVIDER_EXECUTION_CONTEXT.optional(),
  })
  .refine(
    (value) => value.runtime === value.settings.runtime,
    'Runtime status and settings must agree.',
  );
export type ComputerRuntimeStatus = z.infer<typeof COMPUTER_RUNTIME_STATUS>;
