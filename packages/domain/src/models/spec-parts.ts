import { z } from 'zod';
import {
  HEX,
  NAME,
  POINT3,
  SIZE,
  TOKEN,
  UNIT,
  bindingSchemas,
  transformSchema,
  schemaFactory,
} from './spec-base';
import { geometrySchema } from './spec-geometry';

export const MODEL_SPEC_PATTERNS = [
  'brushed',
  'knit',
  'perforated',
  'grille',
  'wood-grain',
  'marble',
  'terrazzo',
  'ribbed',
  'leather',
] as const;

const MATERIAL_FIELDS = {
  finish: TOKEN.optional(),
  color: HEX.optional(),
  roughness: UNIT.optional(),
  metalness: UNIT.optional(),
  clearcoat: UNIT.optional(),
  sheen: UNIT.optional(),
  opacity: UNIT.optional(),
  pattern: z.enum(MODEL_SPEC_PATTERNS).optional(),
};

export const materialSchema = schemaFactory((obj) => {
  return obj(MATERIAL_FIELDS).refine(
    (material) => (material.finish === undefined) !== (material.color === undefined),
    { message: 'a material has exactly one of finish or color' },
  );
});

export const materialOverrideSchema = schemaFactory((obj) => {
  return obj(MATERIAL_FIELDS).refine(
    (material) => material.finish === undefined || material.color === undefined,
    { message: 'an override has at most one of finish or color' },
  );
});

export const partSchema = schemaFactory((obj) => {
  const transform = transformSchema(obj);
  return obj({
    id: NAME,
    parent: NAME.optional(),
    geometry: geometrySchema(obj),
    material: NAME,
    transform: transform.optional(),
    poses: z.record(NAME, transform).optional(),
    minLod: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    layer: NAME.optional(),
    contact: z.boolean().optional(),
    visible: bindingSchemas(obj).binding.optional(),
  });
});

const ANCHOR_BASE = {
  id: NAME,
  parent: NAME.optional(),
  position: POINT3.optional(),
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
};

export const MODEL_SPEC_EFFECTS = [
  'mist',
  'steam',
  'airflow',
  'water',
  'spray',
  'sparkle',
  'ripple',
  'scan',
] as const;

export const MODEL_SPEC_MOUNTS = ['wall', 'ceiling', 'floor', 'desk'] as const;

export const anchorSchema = schemaFactory((obj) => {
  return z.discriminatedUnion('kind', [
    obj({ kind: z.literal('screen'), ...ANCHOR_BASE, width: SIZE, height: SIZE }),
    obj({
      kind: z.literal('emitter'),
      ...ANCHOR_BASE,
      color: HEX,
      intensity: z.number().min(0),
      radius: SIZE,
      cone: z.number().positive().max(360).optional(),
    }),
    obj({
      kind: z.literal('effect'),
      ...ANCHOR_BASE,
      effect: z.enum(MODEL_SPEC_EFFECTS),
      size: SIZE.optional(),
    }),
    obj({ kind: z.literal('mount'), ...ANCHOR_BASE, mount: z.enum(MODEL_SPEC_MOUNTS) }),
    obj({ kind: z.literal('label'), ...ANCHOR_BASE }),
    obj({ kind: z.literal('hit'), ...ANCHOR_BASE, size: z.tuple([SIZE, SIZE, SIZE]) }),
  ]);
});

export const MODEL_SPEC_MATERIAL = materialSchema(z.strictObject);
export const MODEL_SPEC_MATERIAL_OVERRIDE = materialOverrideSchema(z.strictObject);
export const MODEL_SPEC_PART = partSchema(z.strictObject);
export const MODEL_SPEC_ANCHOR = anchorSchema(z.strictObject);

export type ModelSpecMaterial = z.infer<typeof MODEL_SPEC_MATERIAL>;
export type ModelSpecPart = z.infer<typeof MODEL_SPEC_PART>;
export type ModelSpecAnchor = z.infer<typeof MODEL_SPEC_ANCHOR>;
