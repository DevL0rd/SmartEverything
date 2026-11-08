import { z } from 'zod';

export const MODEL_SPEC_LIMITS = {
  parts: 400,
  partDepth: 8,
  channels: 64,
  anchors: 32,
  metres: 50,
  segmentsMin: 3,
  segmentsMax: 96,
} as const;

export const NAME = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
export const TOKEN = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);
export const MODEL_ID = z
  .string()
  .regex(/^(dev|cat)\.[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/);
export const SEMVER = z.string().regex(/^\d+\.\d+\.\d+$/);
export const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const UNIT = z.number().min(0).max(1);
export const METRES = z.number().min(-MODEL_SPEC_LIMITS.metres).max(MODEL_SPEC_LIMITS.metres);
export const SIZE = z.number().positive().max(MODEL_SPEC_LIMITS.metres);
export const SMALL = z.number().min(0).max(MODEL_SPEC_LIMITS.metres);
export const SEGMENTS = z
  .number()
  .int()
  .min(MODEL_SPEC_LIMITS.segmentsMin)
  .max(MODEL_SPEC_LIMITS.segmentsMax)
  .optional();

export type ObjectCtor = typeof z.strictObject;

export function schemaFactory<Schema>(
  build: (obj: ObjectCtor) => Schema,
): (obj: ObjectCtor) => Schema {
  return build;
}

export const bindingSchemas = schemaFactory((obj) => {
  const binding = obj({
    param: NAME,
    scale: z.number().optional(),
    offset: z.number().optional(),
  });
  return {
    binding,
    coord: z.union([METRES, binding]),
    length: z.union([SIZE, binding]),
    radius: z.union([SMALL, binding]),
    linear: z.union([z.number(), binding]),
  };
});

export const POINT3 = z.tuple([METRES, METRES, METRES]);
export const POINT2 = z.tuple([METRES, METRES]);

export const transformSchema = schemaFactory((obj) => {
  const { coord, linear } = bindingSchemas(obj);
  return obj({
    position: z.tuple([coord, coord, coord]).optional(),
    rotation: z.tuple([linear, linear, linear]).optional(),
    scale: z.tuple([linear, linear, linear]).optional(),
  });
});

export const MODEL_SPEC_BINDING = bindingSchemas(z.strictObject).binding;
export const MODEL_SPEC_TRANSFORM = transformSchema(z.strictObject);

export const AT = { x: METRES, y: METRES };

export const SCALAR = z.union([z.number(), z.string(), z.boolean()]);
export const RANGE = z.tuple([z.number(), z.number()]);

export type ModelSpecTransform = z.infer<typeof MODEL_SPEC_TRANSFORM>;
