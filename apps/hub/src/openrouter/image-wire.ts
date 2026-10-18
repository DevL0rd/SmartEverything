import { z } from 'zod';
import { IMAGE_ENDPOINT, IMAGE_PARAMETER, MICROS_PER_USD } from '@smarteverything/domain';

export const IMAGE_ENDPOINTS_WIRE = z.looseObject({
  endpoints: z.array(
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
  ),
});
export type ImageEndpointWire = z.infer<typeof IMAGE_ENDPOINTS_WIRE>['endpoints'][number];
const IMAGE_USAGE_WIRE = z
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
  )
  .optional()
  .catch(undefined);
const IMAGE_RESULT_WIRE = z.looseObject({ b64_json: z.string().min(1) });
export const IMAGE_RESPONSE_WIRE = z.looseObject({
  data: z.array(IMAGE_RESULT_WIRE).min(1),
  usage: IMAGE_USAGE_WIRE,
});
export const IMAGE_EVENT_WIRE = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('image_generation.partial_image'),
    b64_json: IMAGE_RESULT_WIRE.shape.b64_json,
  }),
  z.looseObject({
    type: z.literal('image_generation.completed'),
    b64_json: IMAGE_RESULT_WIRE.shape.b64_json,
    usage: IMAGE_USAGE_WIRE,
  }),
  z.looseObject({ type: z.literal('error') }),
]);
export const IMAGE_ENDPOINT_SNAPSHOT = z.strictObject({
  refreshed_at: z.iso.datetime({ offset: true }).nullable(),
  endpoints: z.array(IMAGE_ENDPOINT),
});
export type ImageEndpointSnapshot = z.infer<typeof IMAGE_ENDPOINT_SNAPSHOT>;
export const EMPTY_IMAGE_ENDPOINTS: ImageEndpointSnapshot = { refreshed_at: null, endpoints: [] };
