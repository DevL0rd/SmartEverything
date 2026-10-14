import { z } from 'zod';
import { COMPUTER_AI_RUNTIME } from './computer-ai-runtime';
import { AI_HARNESS_COMMAND_ATTACHMENT } from './ai-harness-commands';

export const AI_NATIVE_COMMAND_PRIVATE_OPERATION = z.enum([
  'provider_commands',
  'provider_command',
  'provider_command_receipt',
  'provider_command_dispatch',
]);
export const AI_NATIVE_COMMAND_SCOPE = z.strictObject({
  version: z.literal(1),
  profile_id: z.uuid(),
  client_id: z.uuid().nullable(),
  chat_id: z.uuid(),
  device_id: z.uuid(),
  runtime: COMPUTER_AI_RUNTIME,
  session_id: z.string().min(1).max(200),
  job_id: z.uuid(),
  process_generation: z.uuid(),
  cwd: z.string().min(1).max(4096),
  connection_generation: z.uuid(),
  capability_revision: z.string().min(1).max(200),
  catalogue_revision: z.string().min(1).max(200),
});
export type AiNativeCommandScope = z.infer<typeof AI_NATIVE_COMMAND_SCOPE>;
export const AI_NATIVE_SKILL_INTERFACE = z.object({
  displayName: z.string().max(200).optional(),
  shortDescription: z.string().max(4000).optional(),
  iconSmall: z.string().max(4096).optional(),
  iconLarge: z.string().max(4096).optional(),
  iconSmallUrl: z.string().max(4096).nullable(),
  iconLargeUrl: z.string().max(4096).nullable(),
  brandColor: z.string().max(200).optional(),
  defaultPrompt: z.string().max(200_000).optional(),
});
export const AI_NATIVE_SKILL_DEPENDENCIES = z.object({
  tools: z
    .array(
      z.object({
        type: z.string().max(200),
        value: z.string().max(4096),
        description: z.string().max(4000).optional(),
        transport: z.string().max(200).optional(),
        command: z.string().max(4096).optional(),
        url: z.string().max(4096).optional(),
      }),
    )
    .max(1000),
});
export const AI_NATIVE_SKILL_METADATA = z.object({
  scope: z.enum(['user', 'repo', 'system', 'admin']),
  pluginId: z.string().max(1000).nullable(),
  enabled: z.boolean(),
  shortDescription: z.string().max(4000).optional(),
  interface: AI_NATIVE_SKILL_INTERFACE.optional(),
  dependencies: AI_NATIVE_SKILL_DEPENDENCIES.optional(),
});
export const AI_NATIVE_COMMAND_DESCRIPTOR = z.strictObject({
  definition_id: z.string().min(1).max(1000),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  aliases: z.array(z.string().min(1).max(200)).max(100),
  builtin: z.boolean(),
  source: z.enum(['builtin', 'skill', 'plugin', 'mcp', 'user', 'native']),
  native_name: z.string().min(1).max(200),
  path: z.string().min(1).max(4096).nullable(),
  enabled: z.boolean(),
  argument_hint: z.string().max(2000).nullable(),
  arguments: z.boolean(),
  attachments: z.boolean(),
  unavailable_reason: z.string().min(1).max(2000).nullable(),
  native_skill: AI_NATIVE_SKILL_METADATA.optional(),
});
export type AiNativeCommandDescriptor = z.infer<typeof AI_NATIVE_COMMAND_DESCRIPTOR>;
export const AI_NATIVE_COMMAND_CATALOGUE = z.strictObject({
  scope: AI_NATIVE_COMMAND_SCOPE,
  commands: z.array(AI_NATIVE_COMMAND_DESCRIPTOR).max(2000),
  diagnostics: z
    .array(z.object({ path: z.string().max(4096), message: z.string().max(16_000) }))
    .max(2000)
    .optional(),
});
export const AI_NATIVE_COMMAND_WRITE = z.strictObject({
  scope: AI_NATIVE_COMMAND_SCOPE,
  operation_id: z.uuid(),
  command_job_id: z.uuid(),
  definition_id: z.string().min(1).max(1000),
  arguments: z.string().max(200_000),
  attachments: z.array(AI_HARNESS_COMMAND_ATTACHMENT).max(20).default([]),
});
export type AiNativeCommandWrite = z.infer<typeof AI_NATIVE_COMMAND_WRITE>;
export const AI_NATIVE_COMMAND_RECEIPT = z.strictObject({
  operation_id: z.uuid(),
  scope: AI_NATIVE_COMMAND_SCOPE,
  command_job_id: z.uuid(),
  definition_id: z.string().min(1).max(1000),
  status: z.enum(['pending', 'running', 'settled', 'rejected', 'unknown']),
  outcome: z.enum(['completed', 'compacted', 'no_op', 'interrupted', 'error']).nullable(),
  text: z.string().max(200_000).nullable(),
  turn_id: z.string().min(1).max(200).nullable(),
  completed_item_id: z.string().min(1).max(200).nullable(),
  source_event_seq: z.int().positive().nullable(),
});
export type AiNativeCommandReceipt = z.infer<typeof AI_NATIVE_COMMAND_RECEIPT>;
export const AI_NATIVE_COMMAND_READ = z.strictObject({
  scope: AI_NATIVE_COMMAND_SCOPE,
  operation_id: z.uuid(),
});
export const AI_NATIVE_COMMAND_DISPATCH = AI_NATIVE_COMMAND_READ.extend({
  permit: z.boolean(),
  reason: z.string().max(2000).nullable(),
});
export type AiNativeCommandDispatch = z.infer<typeof AI_NATIVE_COMMAND_DISPATCH>;
