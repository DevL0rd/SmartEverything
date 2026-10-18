import { z } from 'zod';

export const AI_HARNESS_CAPABILITY = 'ai-harness-v1';
export const AI_HARNESS_PROTOCOL_VERSION = 1;
const DEVICE_TARGET = z.object({ kind: z.literal('device'), device_id: z.uuid() });
const SERVER_TARGET = z.object({ kind: z.literal('server') });
export const AI_HARNESS_TARGET = z.discriminatedUnion('kind', [DEVICE_TARGET, SERVER_TARGET]);
export const AI_HARNESS_TARGET_WRITE = z.discriminatedUnion('kind', [
  DEVICE_TARGET.strict(),
  SERVER_TARGET.strict(),
]);
export type AiHarnessTarget = z.infer<typeof AI_HARNESS_TARGET>;

export function harnessTargetKey(target: AiHarnessTarget): string {
  return target.kind === 'server' ? 'server' : `device:${target.device_id}`;
}

export const AI_HARNESS_PERMISSIONS = [
  { sandbox: 'danger-full-access', approval: 'never' },
  { sandbox: 'workspace-write', approval: 'on-request' },
  { sandbox: 'read-only', approval: 'on-request' },
] as const;
const FULL_ACCESS = z.object({
  sandbox: z.literal('danger-full-access'),
  approval: z.literal('never'),
});
const WORKSPACE_WRITE = z.object({
  sandbox: z.literal('workspace-write'),
  approval: z.literal('on-request'),
});
const READ_ONLY = z.object({ sandbox: z.literal('read-only'), approval: z.literal('on-request') });
export const AI_HARNESS_PERMISSION = z.union([FULL_ACCESS, WORKSPACE_WRITE, READ_ONLY]);
export const AI_HARNESS_PERMISSION_WRITE = z.union([
  FULL_ACCESS.strict(),
  WORKSPACE_WRITE.strict(),
  READ_ONLY.strict(),
]);
export type AiHarnessPermission = z.infer<typeof AI_HARNESS_PERMISSION>;
export const DEFAULT_AI_HARNESS_PERMISSION: AiHarnessPermission = AI_HARNESS_PERMISSIONS[0];

export const AI_HARNESS_FEATURES = [
  'text',
  'reasoning',
  'images',
  'files',
  'local-files',
  'shell',
  'pty',
  'mcp',
  'browser',
  'computer',
  'interactions',
  'cancel',
  'compaction',
  'native-resume',
  'remote-subagents',
  'subagent-send',
  'subagent-steer',
] as const;
export const AI_HARNESS_STORAGE_BINDING = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('managed'), chat_id: z.uuid() }),
  z.strictObject({
    kind: z.literal('device'),
    target: DEVICE_TARGET.strict(),
    path: z.string().min(1).max(4096),
  }),
]);
export type AiHarnessStorageBinding = z.infer<typeof AI_HARNESS_STORAGE_BINDING>;

export const AI_HARNESS_MANIFEST = z.object({
  references: z.object({ protocol: z.literal(1) }).optional(),
  subscription_inference: z.object({ protocol: z.literal(1) }).optional(),
  subscription_consumer: z.object({ protocol: z.literal(1) }).optional(),
  human_commands: z.boolean().optional(),
  delivery_correlation: z.boolean().optional(),
  protocol: z.literal(AI_HARNESS_PROTOCOL_VERSION),
  revision: z.string().min(1).max(200),
  features: z.array(z.enum(AI_HARNESS_FEATURES)).max(AI_HARNESS_FEATURES.length),
  tools: z.array(z.string().min(1).max(200)).max(2000),
  permissions: z.array(AI_HARNESS_PERMISSION).min(1),
  permission_change: z.boolean().optional(),
});
export type AiHarnessManifest = z.infer<typeof AI_HARNESS_MANIFEST>;

export const AI_HARNESS_WORKSPACE = z.object({
  home_directory: z.string().min(1).max(4096),
  default_directory: z.string().min(1).max(4096).nullable(),
  available: z.boolean(),
  reason: z.string().min(1).max(2000).nullable(),
});
export type AiHarnessWorkspace = z.infer<typeof AI_HARNESS_WORKSPACE>;
export const AI_HARNESS_WORKSPACE_CHOICE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('home') }),
  z.strictObject({ action: z.literal('select'), path: z.string().min(1).max(4096) }),
  z.strictObject({
    action: z.literal('create'),
    parent: z.string().min(1).max(4096),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^(?!\.{1,2}$)[^/\\]+$/),
  }),
]);
export type AiHarnessWorkspaceChoice = z.infer<typeof AI_HARNESS_WORKSPACE_CHOICE>;

const HOST_FIELDS = {
  target: AI_HARNESS_TARGET,
  machine_id: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  name: z.string().min(1).max(200),
  online: z.boolean(),
  configuration_sync: z.boolean().optional(),
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  manifest: AI_HARNESS_MANIFEST.nullable(),
  workspace: AI_HARNESS_WORKSPACE.optional(),
  unavailable_reason: z.string().min(1).max(2000).nullable(),
};
export const AI_HARNESS_HOST = z.object({
  ...HOST_FIELDS,
  platform: z.enum(['linux', 'windows', 'macos']),
});
export type AiHarnessHost = z.infer<typeof AI_HARNESS_HOST>;

export const AI_HARNESS_FAILURE = z.object({
  code: z.enum([
    'runtime_unavailable',
    'capability_unsupported',
    'composition_incompatible',
    'route_unavailable',
    'subscription_unavailable',
    'quota_exhausted',
    'ownership_lost',
    'directory_unavailable',
    'source_outcome_unknown',
    'operation_failed',
  ]),
  message: z.string().min(1),
  retry_at: z.iso.datetime({ offset: true }).nullable(),
});
export type AiHarnessFailure = z.infer<typeof AI_HARNESS_FAILURE>;
