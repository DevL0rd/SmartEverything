import { z } from 'zod';
import { NAME, RANGE, SCALAR, schemaFactory } from './spec-base';

export const signalSchema = schemaFactory((obj) => {
  return z.union([z.string().min(1), obj({ capability: z.string().min(1) })]);
});

export const MODEL_SPEC_PROPERTIES = [
  'rotate',
  'translate',
  'scale',
  'emissive',
  'colour',
  'opacity',
  'visible',
  'uvScroll',
  'pose',
] as const;

const mapSchema = schemaFactory((obj) => {
  return z.discriminatedUnion('type', [
    obj({
      type: z.literal('linear'),
      in: RANGE,
      out: RANGE,
      clamp: z.boolean().optional(),
    }),
    obj({ type: z.literal('enum'), table: z.record(z.string(), SCALAR) }),
    obj({ type: z.literal('speed'), in: RANGE, perSecond: RANGE }),
    obj({
      type: z.literal('colour'),
      from: z.enum(['signal', 'temperature']),
      kelvin: RANGE.optional(),
    }),
  ]);
});

const motionSchema = schemaFactory((obj) => {
  return z.discriminatedUnion('type', [
    obj({ type: z.literal('pose'), easeMs: z.number().int().min(0).optional() }),
    obj({ type: z.literal('spin') }),
    obj({ type: z.literal('pulse'), periodS: z.number().positive(), amplitude: z.number() }),
    obj({ type: z.literal('oscillate'), limits: RANGE, speed: z.number().positive() }),
    obj({
      type: z.literal('step'),
      keyframes: z.array(SCALAR).min(1),
      intervalMs: z.number().positive(),
    }),
  ]);
});

const blurSchema = schemaFactory((obj) => {
  return obj({ part: NAME, from: z.number().min(0), to: z.number() }).refine(
    (blur) => blur.to > blur.from,
    { path: ['to'], message: 'a blur layer is full above where it starts' },
  );
});

export const channelSchema = schemaFactory((obj) => {
  return obj({
    id: NAME,
    target: NAME,
    property: z.enum(MODEL_SPEC_PROPERTIES),
    axis: z.enum(['x', 'y', 'z']).optional(),
    source: signalSchema(obj),
    map: mapSchema(obj),
    motion: motionSchema(obj),
    reduced: z.enum(['hold', 'hide']),
    blur: blurSchema(obj).optional(),
  });
});

export const conditionSchema = schemaFactory((obj) => {
  const leaf = obj({
    signal: signalSchema(obj),
    op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
    value: SCALAR,
  });
  return obj({ anyOf: z.array(obj({ allOf: z.array(leaf).min(1) })).min(1) });
});

export const shotSchema = schemaFactory((obj) => {
  return obj({
    id: NAME,
    when: conditionSchema(obj),
    focus: NAME,
    zoom: z.number().positive(),
    yaw: z.number().min(-360).max(360),
    pitch: z.number().min(-90).max(90),
    orbit: z.number().optional(),
    easeMs: z.number().int().min(0),
    loopS: z.number().positive(),
    symmetry: z.number().positive().max(360),
    stillAt: z.number().min(0),
  }).refine((shot) => shot.stillAt <= shot.loopS, {
    path: ['stillAt'],
    message: 'stillAt lies within the loop',
  });
});

export const MODEL_SPEC_SIGNAL = signalSchema(z.strictObject);
export const MODEL_SPEC_MAP = mapSchema(z.strictObject);
export const MODEL_SPEC_MOTION = motionSchema(z.strictObject);
export const MODEL_SPEC_CHANNEL = channelSchema(z.strictObject);
export const MODEL_SPEC_CONDITION = conditionSchema(z.strictObject);
export const MODEL_SPEC_SHOT = shotSchema(z.strictObject);

export type ModelSpecSignal = z.infer<typeof MODEL_SPEC_SIGNAL>;
export type ModelSpecChannel = z.infer<typeof MODEL_SPEC_CHANNEL>;
export type ModelSpecCondition = z.infer<typeof MODEL_SPEC_CONDITION>;
export type ModelSpecShot = z.infer<typeof MODEL_SPEC_SHOT>;
