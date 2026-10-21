import { z } from 'zod';
import { ASSISTANT_ATTACHMENT, IMAGE_MODEL_SETTING, type ImageModelChoice } from './assistant';
import { ApiError } from './api/errors';

export const IMAGE_BYTES_MAX = 20 * 1024 * 1024;
export const IMAGE_INPUT_BYTES_MAX = 24 * 1024 * 1024;
export const IMAGE_OUTPUT_BYTES_MAX = 120 * 1024 * 1024;
export const IMAGE_PIXELS_MAX = 64 * 1024 * 1024;
export const IMAGE_RESULTS_MAX = 4;
export const IMAGE_REFERENCES_MAX = 10;
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
  provider_tag: z.string().min(1).max(200).optional(),
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
export const IMAGE_AI_OPTIONS = z.strictObject({
  n: IMAGE_OPTIONS.shape.n.describe(
    'How many variants of this one prompt to make; use separate requests for different prompts',
  ),
  aspect_ratio: IMAGE_OPTIONS.shape.aspect_ratio.describe(
    'Shape that suits the picture, such as 1:1, 16:9, 9:16, 4:3, 3:2 or 2:3; leave out to let the model choose. Quality and resolution are always set to the highest the model offers',
  ),
  background: IMAGE_OPTIONS.shape.background.describe(
    'transparent for a cutout with no background, opaque or auto otherwise',
  ),
});
export const IMAGE_REFERENCE_WORDS = ['latest', 'latestUploaded', 'latestGenerated'] as const;
const REFERENCE_ORIGIN: Readonly<Record<string, 'any' | 'uploaded' | 'generated'>> = {
  latest: 'any',
  latestUploaded: 'uploaded',
  latestGenerated: 'generated',
};
const IMAGE_REFERENCE = z
  .string()
  .refine((text) => z.uuid().safeParse(text).success || Object.hasOwn(REFERENCE_ORIGIN, text), {
    message: `must be an attachment id from an earlier image result or chat_read, or one of ${IMAGE_REFERENCE_WORDS.join(', ')}`,
  });
export function selectorOf(reference: string): ImageSelector {
  const origin = REFERENCE_ORIGIN[reference];
  return origin === undefined
    ? { kind: 'attachment', attachment_id: reference }
    : { kind: 'latest', origin };
}
const INPUT_FIELDS = {
  operationId: z
    .uuid()
    .optional()
    .describe('Set by the hub from the tool call; a request without one gets a new id'),
  chatId: z.uuid().describe('The chat to make the image in; the calling chat when left out'),
  prompt: REQUEST_FIELDS.prompt.describe('What to make, as a clear spec'),
  model: REQUEST_FIELDS.model
    .optional()
    .describe(
      'An image model id from model_read view images; left out, the model the person picked in the app',
    ),
  providerTag: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'The provider_tag from model_read view images; only with a model that has more than one',
    ),
  options: IMAGE_AI_OPTIONS.prefault({}),
};
const STYLE_REFERENCES = z
  .array(IMAGE_REFERENCE)
  .max(IMAGE_REFERENCES_MAX)
  .describe(
    'Images used only as style, composition, mood or subject references, each an attachment id or latest, latestUploaded, latestGenerated; the result is a new image',
  );
export const IMAGE_GENERATE_INPUT = z.strictObject({
  ...INPUT_FIELDS,
  references: STYLE_REFERENCES.default([]),
});
export const IMAGE_EDIT_INPUT = z.strictObject({
  ...INPUT_FIELDS,
  source: IMAGE_REFERENCE.default('latest').describe(
    'The image to change: an attachment id, or latest (default), latestUploaded or latestGenerated for the newest image in the chat; everything the prompt does not ask to change is preserved',
  ),
  references: STYLE_REFERENCES.default([]),
});
export type ImageGenerateInput = z.infer<typeof IMAGE_GENERATE_INPUT>;
export type ImageEditInput = z.infer<typeof IMAGE_EDIT_INPUT>;
function requestFieldsOf(
  input: ImageGenerateInput | ImageEditInput,
  operationId: string,
  selected: ImageModelChoice | null,
): z.input<(typeof IMAGE_OPERATION_REQUEST.options)[0]> {
  const model = input.model ?? selected?.model;
  if (model === undefined) {
    throw new ApiError(
      'invalid_request',
      'No image model is picked in the app; pass model (and providerTag) from model_read view images',
    );
  }
  const providerTag = input.model === undefined ? selected?.provider_tag : input.providerTag;
  return {
    operation_id: operationId,
    chat_id: input.chatId,
    prompt: input.prompt,
    model,
    ...(providerTag === undefined ? {} : { provider_tag: providerTag }),
    options: input.options,
    mode: 'generate',
  };
}

export function generateRequestOf(
  input: ImageGenerateInput,
  operationId: string,
  selected: ImageModelChoice | null,
): z.input<typeof IMAGE_OPERATION_REQUEST> {
  const request = requestFieldsOf(input, operationId, selected);
  if (input.references.length === 0) return request;
  return { ...request, references: input.references.map(selectorOf), mode: 'reference' };
}
export function editRequestOf(
  input: ImageEditInput,
  operationId: string,
  selected: ImageModelChoice | null,
): z.input<typeof IMAGE_OPERATION_REQUEST> {
  return {
    ...requestFieldsOf(input, operationId, selected),
    source: selectorOf(input.source),
    references: input.references.map(selectorOf),
    mode: 'edit',
  };
}
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
  selected: IMAGE_MODEL_SETTING.describe(
    'The model and provider the person picked in the app for images; use it for new images and for edits when it accepts reference images, and choose another endpoint only when it is null or cannot take the requested options',
  ),
});
export type ImageProviderCatalog = z.infer<typeof IMAGE_PROVIDER_CATALOG>;
