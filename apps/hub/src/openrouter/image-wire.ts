import { z } from 'zod';
import {
  IMAGE_PARAMETER,
  IMAGE_BYTES_MAX,
  IMAGE_RESULTS_MAX,
  MICROS_PER_USD,
} from '@smarteverything/domain';

export const IMAGE_MODELS_WIRE = z.looseObject({
  data: z
    .array(
      z.looseObject({
        id: z
          .string()
          .max(200)
          .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/),
        name: z.string().min(1).max(200),
      }),
    )
    .max(200),
});
export const IMAGE_ENDPOINTS_WIRE = z.looseObject({
  id: z.string(),
  endpoints: z
    .array(
      z.looseObject({
        provider_tag: z.string().nullable(),
        supported_parameters: z.record(z.string(), IMAGE_PARAMETER),
        supports_streaming: z.boolean(),
        pricing: z.array(
          z.looseObject({
            billable: z.string(),
            unit: z.string(),
            cost_usd: z.number().nonnegative(),
          }),
        ),
      }),
    )
    .max(100),
});
export const IMAGE_RESULT_WIRE = z.looseObject({
  b64_json: z
    .string()
    .min(1)
    .max(Math.ceil(IMAGE_BYTES_MAX / 3) * 4),
  media_type: z.string().optional(),
});
export const IMAGE_USAGE_WIRE = z
  .record(z.string(), z.unknown())
  .transform((usage) =>
    Object.fromEntries(
      Object.entries(usage).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    ),
  )
  .refine(
    (usage) =>
      usage['cost'] === undefined || usage['cost'] <= Number.MAX_SAFE_INTEGER / MICROS_PER_USD,
    'Provider cost exceeds the supported accounting range',
  );
export const IMAGE_RESPONSE_USAGE_WIRE = z.looseObject({
  usage: IMAGE_USAGE_WIRE.optional(),
});
export const IMAGE_COMPLETED_USAGE_WIRE = IMAGE_RESPONSE_USAGE_WIRE.extend({
  type: z.literal('image_generation.completed'),
});
export const IMAGE_RESPONSE_WIRE = IMAGE_RESPONSE_USAGE_WIRE.extend({
  data: z.array(IMAGE_RESULT_WIRE).min(1).max(IMAGE_RESULTS_MAX),
});
export const IMAGE_EVENT_WIRE = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('image_generation.partial_image'),
    b64_json: IMAGE_RESULT_WIRE.shape.b64_json,
    media_type: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal('image_generation.completed'),
    b64_json: IMAGE_RESULT_WIRE.shape.b64_json,
    media_type: z.string().optional(),
    usage: IMAGE_USAGE_WIRE.optional(),
  }),
  z.looseObject({ type: z.literal('error') }),
]);

export type ImageEndpointWire = z.infer<typeof IMAGE_ENDPOINTS_WIRE>['endpoints'][number];
