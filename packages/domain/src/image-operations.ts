import { z } from 'zod';
import { ASSISTANT_ATTACHMENT } from './assistant';

export const IMAGE_BYTES_MAX = 20 * 1024 * 1024;
export const IMAGE_INPUT_BYTES_MAX = 24 * 1024 * 1024;
export const IMAGE_OUTPUT_BYTES_MAX = 120 * 1024 * 1024;
export const IMAGE_PIXELS_MAX = 64 * 1024 * 1024;
export const IMAGE_RESULTS_MAX = 4;
export const IMAGE_REFERENCES_MAX = 10;
export const IMAGE_COMPLETION_INSTRUCTION =
  'UI-owned completion: SmartEverything automatically shows progress and the saved image in this chat. For a standalone image request, briefly confirm generation started and finish. Only use edit_image action wait when further work the user requested needs saved images, such as editing them or explicitly sending them. Never wait merely to display images, poll status/history, start the same request again, or schedule another AI turn for completion. Continue only work the user asked for. Receipt status/history remain UI-only, including through generic operations.';
export const IMAGE_MIME = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export const IMAGE_SELECTOR = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('attachment'), attachment_id: z.uuid() }),
  z.strictObject({
    kind: z.literal('latest'),
    origin: z.enum(['uploaded', 'generated', 'any']).default('any'),
  }),
]);
export type ImageSelector = z.infer<typeof IMAGE_SELECTOR>;
export const IMAGE_PARAMETER = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enum'), values: z.array(z.union([z.string(), z.number()])) }),
  z.object({ type: z.literal('range'), min: z.number(), max: z.number() }),
  z.object({ type: z.literal('boolean') }),
]);
export const IMAGE_ENDPOINT = z.object({
  model: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  provider_tag: z.string().min(1).max(200),
  parameters: z.record(z.string(), IMAGE_PARAMETER),
  supports_streaming: z.boolean(),
  pricing: z.array(
    z.looseObject({
      billable: z.string(),
      unit: z.string(),
      cost_usd: z.number().nonnegative(),
    }),
  ),
});
export type ImageEndpoint = z.infer<typeof IMAGE_ENDPOINT>;
export const IMAGE_OPTIONS = z.strictObject({
  n: z.int().min(1).max(IMAGE_RESULTS_MAX).default(1),
  aspect_ratio: z.string().max(40).optional(),
  resolution: z.string().max(40).optional(),
  size: z.string().max(40).optional(),
  quality: z.string().max(40).optional(),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  background: z.string().max(40).optional(),
  output_compression: z.int().min(0).max(100).optional(),
  seed: z.int().optional(),
  stream: z.boolean().default(false),
});
const REQUEST_FIELDS = {
  operation_id: z.uuid(),
  chat_id: z.uuid(),
  prompt: z.string().trim().min(1).max(16_000),
  model: z.string().min(1).max(200),
  provider_tag: z.string().min(1).max(200),
  options: IMAGE_OPTIONS.prefault({}),
};
const REFERENCES = z.array(IMAGE_SELECTOR).max(IMAGE_REFERENCES_MAX);
export const IMAGE_OPERATION_REQUEST = z.discriminatedUnion('mode', [
  z.strictObject({ ...REQUEST_FIELDS, mode: z.literal('generate') }),
  z.strictObject({
    ...REQUEST_FIELDS,
    mode: z.literal('edit'),
    source: IMAGE_SELECTOR,
    references: REFERENCES.default([]),
  }),
  z.strictObject({
    ...REQUEST_FIELDS,
    mode: z.literal('reference'),
    references: REFERENCES.min(1),
  }),
]);
export type ImageOperationRequest = z.infer<typeof IMAGE_OPERATION_REQUEST>;
export const IMAGE_RESOLVED_INPUT = z.strictObject({
  attachment_id: z.uuid(),
  role: z.enum(['source', 'reference']),
  order: z.int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: IMAGE_MIME,
  bytes: z.int().positive().max(IMAGE_BYTES_MAX),
});
export type ImageResolvedInput = z.infer<typeof IMAGE_RESOLVED_INPUT>;
export const IMAGE_ARTIFACT = z.object({
  attachment: z.object(ASSISTANT_ATTACHMENT.shape),
  operation_id: z.uuid(),
  parents: z.array(z.object(IMAGE_RESOLVED_INPUT.shape)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const SELECTOR_READ = z.discriminatedUnion('kind', [
  z.object(IMAGE_SELECTOR.options[0].shape),
  z.object(IMAGE_SELECTOR.options[1].shape),
]);
const OPTIONS_READ = z.object(IMAGE_OPTIONS.shape);
export const IMAGE_OPERATION_REQUEST_READ = z.discriminatedUnion('mode', [
  z.object(IMAGE_OPERATION_REQUEST.options[0].shape).extend({ options: OPTIONS_READ }),
  z.object(IMAGE_OPERATION_REQUEST.options[1].shape).extend({
    options: OPTIONS_READ,
    source: SELECTOR_READ,
    references: z.array(SELECTOR_READ).max(IMAGE_REFERENCES_MAX),
  }),
  z.object(IMAGE_OPERATION_REQUEST.options[2].shape).extend({
    options: OPTIONS_READ,
    references: z.array(SELECTOR_READ).min(1).max(IMAGE_REFERENCES_MAX),
  }),
]);
export const IMAGE_OPERATION_ORIGIN = z.object({
  kind: z.enum(['client', 'service', 'execution']),
  principal_id: z.string().min(1).max(200),
  client_id: z.uuid().nullable().default(null),
  plugin_id: z.string().min(1).max(200).nullable().default(null),
  event_id: z.uuid().nullable().default(null),
  session_id: z.string().min(1).max(200).nullable().default(null),
  epoch: z.int().nonnegative().nullable().default(null),
  grant_fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .default(null),
});
export type ImageOperationOrigin = z.infer<typeof IMAGE_OPERATION_ORIGIN>;
export const IMAGE_OPERATION_RECEIPT = z.object({
  id: z.uuid(),
  profile_id: z.uuid(),
  chat_id: z.uuid(),
  request: IMAGE_OPERATION_REQUEST_READ,
  endpoint: IMAGE_ENDPOINT,
  origin: IMAGE_OPERATION_ORIGIN.nullable().default(null),
  inputs: z.array(z.object(IMAGE_RESOLVED_INPUT.shape)),
  state: z.enum(['reserved', 'running', 'completed', 'failed', 'cancelled', 'unknown']),
  progress: z.int().nonnegative(),
  cancellation_requested: z.boolean().default(false),
  results: z.array(IMAGE_ARTIFACT).max(IMAGE_RESULTS_MAX),
  message_id: z.uuid().nullable(),
  result_message_id: z.uuid().optional(),
  message_deleted: z.boolean().optional(),
  completion_owner: z.literal('ui').optional(),
  completion_instruction: z.string().min(1).max(800).optional(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  reason: z.string().max(200).nullable(),
  usage: z.record(z.string(), z.number().nonnegative()).nullable(),
  usage_source: z.enum(['provider_response', 'provider_event']).nullable().default(null),
  usage_complete: z.boolean().default(false),
  usage_ledger_id: z.uuid().nullable().default(null),
});
export type ImageOperationReceipt = z.infer<typeof IMAGE_OPERATION_RECEIPT>;
export const IMAGE_OPERATION_NOTICE = z.object({
  type: z.literal('image_operation'),
  receipt: IMAGE_OPERATION_RECEIPT,
});

export const IMAGE_RESOLVED_SELECTION = z.object(IMAGE_RESOLVED_INPUT.shape).extend({
  attachment: z.object(ASSISTANT_ATTACHMENT.shape),
});
export type ImageResolvedSelection = z.infer<typeof IMAGE_RESOLVED_SELECTION>;
export const IMAGE_WAIT_MS_MAX = 180_000;
export const IMAGE_WAIT_OPERATIONS_MAX = 100;
export const IMAGE_WAIT_REQUEST = z.strictObject({
  operation_ids: z
    .array(z.uuid())
    .min(1)
    .max(IMAGE_WAIT_OPERATIONS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Select each operation only once.')
    .optional()
    .describe(
      'Exact operation IDs returned by image creation; omit to snapshot this chat’s active jobs.',
    ),
  wait_ms: z.int().min(1).max(IMAGE_WAIT_MS_MAX).default(IMAGE_WAIT_MS_MAX),
});
export type ImageWaitRequest = z.infer<typeof IMAGE_WAIT_REQUEST>;
export const IMAGE_WAIT_RESULT = z.object({
  outcome: z.enum(['finished', 'timed_out']),
  all_finished: z.boolean(),
  operations: z
    .array(
      z.object({
        id: z.uuid(),
        state: IMAGE_OPERATION_RECEIPT.shape.state,
        reason: z.string().max(200).nullable(),
        result_available: z.boolean(),
        results: z.array(IMAGE_ARTIFACT).max(IMAGE_RESULTS_MAX),
      }),
    )
    .max(IMAGE_WAIT_OPERATIONS_MAX),
});
export type ImageWaitResult = z.infer<typeof IMAGE_WAIT_RESULT>;
export const IMAGE_PREVIEW_BYTES_MAX = 512 * 1024;
export const IMAGE_OPERATION_PREVIEW = z.object({
  type: z.literal('image_operation_preview'),
  operation_id: z.uuid(),
  profile_id: z.uuid(),
  chat_id: z.uuid(),
  mime: z.literal('image/webp'),
  width: z.int().min(1).max(512),
  height: z.int().min(1).max(512),
  bytes: z.int().min(1).max(IMAGE_PREVIEW_BYTES_MAX),
  data: z
    .string()
    .min(1)
    .max(Math.ceil(IMAGE_PREVIEW_BYTES_MAX / 3) * 4),
});
export type ImageOperationPreview = z.infer<typeof IMAGE_OPERATION_PREVIEW>;

export const IMAGE_PROVIDER_READINESS = z.object({
  configured: z.boolean(),
  spend_granted: z.boolean(),
  ready: z
    .boolean()
    .describe(
      'Locally admitted for an explicit image operation; provider entitlement and delivery are checked by the actual request.',
    ),
  reason: z
    .enum([
      'not_configured',
      'chat_required',
      'grant_required',
      'tool_disabled',
      'authority_revoked',
      'catalog_unavailable',
      'service_stopping',
      'budget_unavailable',
      'budget_blocked',
    ])
    .nullable(),
  detail: z.string().max(200).nullable(),
  active: z.int().nonnegative(),
});
export type ImageProviderReadiness = z.infer<typeof IMAGE_PROVIDER_READINESS>;
export const IMAGE_PROVIDER_CATALOG = z.object({
  endpoints: z.array(IMAGE_ENDPOINT),
  readiness: IMAGE_PROVIDER_READINESS,
});
export type ImageProviderCatalog = z.infer<typeof IMAGE_PROVIDER_CATALOG>;
