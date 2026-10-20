import { z } from 'zod';
import { JSON_VALUE } from './values';
import { AI_MODEL_ROUTE } from './ai-model-route';
import { DSH_WRITER_CLAIM_WRITE } from './dsh-sessions';
import { HARNESS_PLATFORM } from './harness-platform';

export const HARNESS_SUBSCRIPTION_INFERENCE_CAPABILITY = 'harness-subscription-inference-v1';
export const SUBSCRIPTION_INFERENCE_MAX_BYTES = 32 * 1024 * 1024;
const TEXT = z.string().max(200_000);
const ID = z.string().min(1).max(200);
const POSITION = z.int().nonnegative();
const DIMENSIONS = { width: z.int().positive(), height: z.int().positive() };
export const SUBSCRIPTION_INFERENCE_IMAGE_REF = z.strictObject({
  attachmentId: ID,
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: POSITION,
  ...DIMENSIONS,
  name: z.string().max(200).optional(),
  originalDimensions: z.strictObject(DIMENSIONS).optional(),
});
export const SUBSCRIPTION_INFERENCE_BLOCK = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: TEXT }),
  z.strictObject({ type: z.literal('reasoning'), text: TEXT }),
  z.strictObject({ type: z.literal('tool-call'), id: ID, name: ID, arguments: TEXT }),
  z.strictObject({ type: z.literal('tool-addition'), toolName: ID }),
  z.strictObject({ type: z.literal('tool-removal'), toolName: ID }),
  z.strictObject({
    type: z.literal('image'),
    attachment: SUBSCRIPTION_INFERENCE_IMAGE_REF,
    offloaded: z.literal(true).optional(),
  }),
  z.strictObject({
    type: z.literal('file'),
    attachment: z.strictObject({ attachmentId: ID, name: z.string().max(200), bytes: POSITION }),
  }),
]);
const SOURCE = z.object({ kind: ID }).catchall(JSON_VALUE);
const MESSAGE_FIELDS = { id: ID, content: z.array(SUBSCRIPTION_INFERENCE_BLOCK).max(2000) };
export const SUBSCRIPTION_INFERENCE_MESSAGE = z.union([
  z.strictObject({ role: z.literal('user'), content: MESSAGE_FIELDS.content }),
  z.strictObject({ ...MESSAGE_FIELDS, role: z.literal('user'), source: SOURCE }),
  z.strictObject({ ...MESSAGE_FIELDS, role: z.literal('developer'), source: SOURCE }),
  z.strictObject({
    ...MESSAGE_FIELDS,
    role: z.literal('system'),
    source: z.strictObject({ kind: z.literal('system-prompt') }),
  }),
  z.strictObject({
    ...MESSAGE_FIELDS,
    role: z.literal('assistant'),
    source: z.strictObject({
      kind: z.literal('model'),
      provider: ID,
      model: ID,
      replayState: JSON_VALUE.optional(),
    }),
  }),
  z.strictObject({
    ...MESSAGE_FIELDS,
    role: z.literal('tool'),
    source: z.strictObject({ kind: z.literal('tool'), callId: ID }),
    toolCallId: ID,
    isError: z.boolean().optional(),
  }),
]);
const TOOL = z.strictObject({
  name: ID,
  description: TEXT,
  parameters: z.record(z.string(), JSON_VALUE),
  deferLoading: z.literal(true).optional(),
});
export const SUBSCRIPTION_INFERENCE_OPTIONS = z.strictObject({
  provider: z.uuid(),
  model: ID,
  messages: z.array(SUBSCRIPTION_INFERENCE_MESSAGE).max(10000),
  system: TEXT.optional(),
  tools: z.array(TOOL).max(2000).optional(),
  toolHistory: z
    .strictObject({
      tools: z.array(TOOL).max(2000),
      updates: z
        .array(z.strictObject({ messageId: ID, additions: z.array(TOOL).max(2000) }))
        .max(10000),
    })
    .optional(),
  reasoningEffort: ID.optional(),
  temperature: z.number().optional(),
  maxTokens: z.int().positive().optional(),
  stop: z.array(TEXT).max(100).optional(),
  sessionId: ID,
  purpose: z.enum(['compaction', 'session-title']).optional(),
});
const FAILURE = z.strictObject({
  message: TEXT,
  code: ID,
  status: z.int().optional(),
  providerRetryAfterMs: z.number().nonnegative().optional(),
  requestId: ID.optional(),
  offloadImages: POSITION.optional(),
});
const REASON = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('stop') }),
  z.strictObject({ kind: z.literal('tool-calls') }),
  z.strictObject({ kind: z.literal('max-tokens') }),
  z.strictObject({ kind: z.literal('aborted'), failure: FAILURE }),
  z.strictObject({ kind: z.literal('error'), failure: FAILURE }),
]);
export const SUBSCRIPTION_INFERENCE_CHUNK = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('block-start'),
    index: POSITION,
    blockType: z.enum([
      'text',
      'reasoning',
      'image',
      'file',
      'tool-call',
      'tool-addition',
      'tool-removal',
    ]),
  }),
  z.strictObject({ type: z.literal('text-delta'), index: POSITION, text: TEXT }),
  z.strictObject({ type: z.literal('reasoning-delta'), index: POSITION, text: TEXT }),
  z.strictObject({
    type: z.literal('tool-call-delta'),
    index: POSITION,
    id: ID,
    name: ID.optional(),
    argumentsDelta: TEXT,
  }),
  z.strictObject({
    type: z.literal('block-end'),
    index: POSITION,
    block: SUBSCRIPTION_INFERENCE_BLOCK,
  }),
  z.strictObject({
    type: z.literal('usage'),
    usage: z.strictObject({
      inputTokens: POSITION,
      outputTokens: POSITION,
      totalTokens: POSITION.optional(),
      cacheReadTokens: POSITION.optional(),
      cacheWriteTokens: POSITION.optional(),
      reasoningTokens: POSITION.optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('finish'),
    reason: REASON,
    replayState: z
      .strictObject({ response: JSON_VALUE, blocks: z.array(JSON_VALUE).optional() })
      .optional(),
  }),
]);
export const SUBSCRIPTION_INFERENCE_MODEL = z.strictObject({
  provider: z.uuid(),
  id: ID,
  name: TEXT,
  description: TEXT.optional(),
  inputModalities: z.array(z.enum(['text', 'image'])).optional(),
  context: z.strictObject({ contextWindow: z.int().positive() }).optional(),
  defaultMaxTokens: z.int().positive().optional(),
  reasoning: z
    .strictObject({
      efforts: z.array(z.strictObject({ id: ID, name: TEXT, description: TEXT.optional() })),
      defaultEffort: ID.optional(),
    })
    .optional(),
  systemPromptUpdate: z.literal('in-history').optional(),
  toolUpdate: z.enum(['in-history', 'addition-only']).optional(),
});
export const SUBSCRIPTION_INFERENCE_IMAGE = z.strictObject({
  ref: SUBSCRIPTION_INFERENCE_IMAGE_REF,
  request: z
    .strictObject({
      target: z.strictObject({ ...DIMENSIONS, maxBytes: z.int().positive() }),
      variantId: ID,
      data: z.base64().max(SUBSCRIPTION_INFERENCE_MAX_BYTES),
      mediaType: SUBSCRIPTION_INFERENCE_IMAGE_REF.shape.mediaType,
      bytes: z.int().positive(),
      ...DIMENSIONS,
      depth: z.literal('uchar'),
      space: z.literal('srgb'),
      hasAlpha: z.boolean(),
    })
    .optional(),
  access: z.strictObject({ readonlyPath: z.string().min(1).max(4096) }).optional(),
});
export const SUBSCRIPTION_INFERENCE_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('resolve'), route: AI_MODEL_ROUTE, model: ID }),
  z.strictObject({
    kind: z.literal('stream'),
    route: AI_MODEL_ROUTE,
    claim: DSH_WRITER_CLAIM_WRITE,
    execution: z
      .strictObject({
        platform: HARNESS_PLATFORM,
        device_id: z.uuid(),
        generation: z.uuid(),
        runtime_instance: z.uuid(),
      })
      .optional(),
    options: SUBSCRIPTION_INFERENCE_OPTIONS,
    images: z.array(SUBSCRIPTION_INFERENCE_IMAGE).max(100),
  }),
]);
export const SUBSCRIPTION_INFERENCE_RESULT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('model'), model: SUBSCRIPTION_INFERENCE_MODEL }),
  z.strictObject({
    kind: z.literal('chunk'),
    sequence: POSITION,
    chunk: SUBSCRIPTION_INFERENCE_CHUNK,
  }),
  z.strictObject({ kind: z.literal('failure'), failure: FAILURE }),
]);
export type SubscriptionInferenceRequest = z.infer<typeof SUBSCRIPTION_INFERENCE_REQUEST>;
export type SubscriptionInferenceResult = z.infer<typeof SUBSCRIPTION_INFERENCE_RESULT>;
export type SubscriptionInferenceImage = z.infer<typeof SUBSCRIPTION_INFERENCE_IMAGE>;

export const SUBSCRIPTION_CONSUMER_REQUEST = z.strictObject({
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  request: SUBSCRIPTION_INFERENCE_REQUEST,
});
export type SubscriptionConsumerRequest = z.infer<typeof SUBSCRIPTION_CONSUMER_REQUEST>;
