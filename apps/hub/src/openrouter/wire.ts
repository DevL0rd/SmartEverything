import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';

const PRICE = z
  .string()
  .regex(/^-?\d+(\.\d+)?(e-?\d+)?$/i, 'a decimal price')
  .transform((text) => Number(text));

const COUNT = z.number().int().min(0);

const PRICE_OVERRIDE = z.looseObject({
  min_prompt_tokens: z.number().int().min(1).optional(),
  prompt: PRICE.optional(),
  completion: PRICE.optional(),
  input_cache_read: PRICE.optional(),
  input_cache_write: PRICE.optional(),
});

export const OR_PRICING = z.looseObject({
  prompt: PRICE,
  completion: PRICE,
  request: PRICE.optional(),
  image: PRICE.optional(),
  image_output: PRICE.optional(),
  audio: PRICE.optional(),
  audio_output: PRICE.optional(),
  web_search: PRICE.optional(),
  internal_reasoning: PRICE.optional(),
  input_cache_read: PRICE.optional(),
  input_cache_write: PRICE.optional(),
  overrides: z.array(PRICE_OVERRIDE).optional(),
});

export type OrPricing = z.infer<typeof OR_PRICING>;

export const OR_MODEL = z.looseObject({
  id: z.string().min(3).max(200),
  name: z.string().min(1).max(200),
  created: z.number().int().min(0),
  description: z.string(),
  context_length: COUNT.nullable(),
  architecture: z.looseObject({
    input_modalities: z.array(z.string().min(1)),
    output_modalities: z.array(z.string().min(1)),
  }),
  pricing: OR_PRICING,
  top_provider: z.looseObject({
    context_length: COUNT.nullable().optional(),
    max_completion_tokens: COUNT.nullable().optional(),
  }),
  supported_parameters: z.array(z.string().min(1)),
  expiration_date: z.iso.date().nullable().optional(),
  reasoning: z
    .looseObject({
      mandatory: z.boolean(),
      supported_efforts: z.array(z.string().min(1)).optional(),
      default_effort: z.string().min(1).optional(),
    })
    .optional(),
  alias_target: z
    .looseObject({ slug: z.string().min(3) })
    .nullable()
    .optional(),
});

export type OrModel = z.infer<typeof OR_MODEL>;

export const OR_MODELS = z.looseObject({ data: z.array(OR_MODEL) });

export const OR_VIDEO_MODEL = z.looseObject({
  id: z.string().min(3).max(200),
  name: z.string().min(1).max(200),
  created: z.number().int().min(0),
  description: z.string(),
  supported_frame_images: z.array(z.string()).nullable().optional(),
  pricing_skus: z.record(z.string(), PRICE).nullable(),
});

export type OrVideoModel = z.infer<typeof OR_VIDEO_MODEL>;

export const OR_VIDEO_MODELS = z.looseObject({ data: z.array(OR_VIDEO_MODEL) });

export const OR_IMAGE_MODEL = z.looseObject({
  id: z.string().min(3).max(200),
  name: z.string().min(1).max(200),
  created: z.number().int().min(0),
  description: z.string(),
  architecture: z.looseObject({
    input_modalities: z.array(z.string().min(1)),
    output_modalities: z.array(z.string().min(1)),
  }),
  endpoints: z.string().startsWith('/api/v1/'),
});

export type OrImageModel = z.infer<typeof OR_IMAGE_MODEL>;

export const OR_IMAGE_MODELS = z.looseObject({ data: z.array(OR_IMAGE_MODEL) });

export const OR_IMAGE_PRICE = z.looseObject({
  billable: z.string().min(1),
  unit: z.string().min(1),
  cost_usd: z.number().min(0),
  variant: z.string().min(1).optional(),
});

export type OrImagePrice = z.infer<typeof OR_IMAGE_PRICE>;

export const OR_IMAGE_ENDPOINTS = z.looseObject({
  endpoints: z.array(z.looseObject({ pricing: z.array(OR_IMAGE_PRICE) })),
});

const NULLABLE_COUNT = COUNT.nullable();

const NULLABLE_NUMBER = z.number().nullable();

export const OR_GENERATION = z.looseObject({
  data: z.looseObject({
    id: z.string().min(1),
    model: z.string().min(1),
    total_cost: z.number(),
    cache_discount: NULLABLE_NUMBER,
    upstream_inference_cost: NULLABLE_NUMBER,
    tokens_prompt: NULLABLE_COUNT,
    tokens_completion: NULLABLE_COUNT,
    native_tokens_prompt: NULLABLE_COUNT,
    native_tokens_completion: NULLABLE_COUNT,
    native_tokens_reasoning: NULLABLE_COUNT,
    native_tokens_cached: NULLABLE_COUNT,
    native_tokens_completion_images: NULLABLE_COUNT,
    num_media_prompt: NULLABLE_COUNT,
    num_media_completion: NULLABLE_COUNT,
    num_input_audio_prompt: NULLABLE_COUNT,
    num_search_results: NULLABLE_COUNT,
    provider_name: z.string().nullable(),
    finish_reason: z.string().nullable(),
    latency: NULLABLE_NUMBER,
    generation_time: NULLABLE_NUMBER,
    created_at: z.string().min(1),
    is_byok: z.boolean(),
  }),
});

export const OR_KEY = z.looseObject({
  data: z.looseObject({
    label: z.string(),
    limit: NULLABLE_NUMBER,
    limit_remaining: NULLABLE_NUMBER,
    limit_reset: z.string().nullable(),
    usage: z.number(),
    usage_daily: z.number(),
    usage_weekly: z.number(),
    usage_monthly: z.number(),
    is_free_tier: z.boolean(),
  }),
});

export const OR_CREDITS = z.looseObject({
  data: z.looseObject({ total_credits: z.number(), total_usage: z.number() }),
});

export const OR_ERROR = z.looseObject({
  error: z.looseObject({
    code: z.union([z.number(), z.string()]).optional(),
    message: z.string(),
  }),
});

const TOOL_CALL_DELTA = z.looseObject({
  index: z.number().int().min(0),
  id: z.string().min(1).optional(),
  function: z
    .looseObject({ name: z.string().min(1).optional(), arguments: z.string().optional() })
    .optional(),
});

const ANNOTATION = z.looseObject({
  type: z.string(),
  url_citation: z
    .looseObject({ url: z.string().min(1), title: z.string().nullable().optional() })
    .optional(),
});

const DELTA = z.looseObject({
  annotations: z.array(ANNOTATION).optional(),
  content: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  reasoning_details: z.array(JSON_VALUE).optional(),
  tool_calls: z.array(TOOL_CALL_DELTA).optional(),
});

export const OR_USAGE = z.looseObject({
  prompt_tokens: COUNT,
  completion_tokens: COUNT,
  cost: z.number().nullable().optional(),
  prompt_tokens_details: z
    .looseObject({
      cached_tokens: COUNT.optional(),
      cache_write_tokens: COUNT.optional(),
      audio_tokens: COUNT.optional(),
    })
    .nullable()
    .optional(),
  completion_tokens_details: z
    .looseObject({ reasoning_tokens: COUNT.optional() })
    .nullable()
    .optional(),
  server_tool_use: z.looseObject({ web_search_requests: COUNT.optional() }).nullable().optional(),
  cost_details: z
    .looseObject({ upstream_inference_cost: z.number().nullable().optional() })
    .nullable()
    .optional(),
});

export type OrUsage = z.infer<typeof OR_USAGE>;

export const OR_CHUNK = z.looseObject({
  id: z.string().min(1),
  model: z.string().min(1),
  choices: z.array(
    z.looseObject({
      delta: DELTA.optional(),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
  usage: OR_USAGE.nullable().optional(),
  error: z.looseObject({ code: z.union([z.number(), z.string()]), message: z.string() }).optional(),
});

export type OrChunk = z.infer<typeof OR_CHUNK>;
