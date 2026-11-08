import { z } from 'zod';
import {
  AT,
  bindingSchemas,
  METRES,
  POINT2,
  POINT3,
  SEGMENTS,
  SIZE,
  schemaFactory,
} from './spec-base';

export const pathSchema = schemaFactory((obj) => {
  return z
    .array(
      z.discriminatedUnion('op', [
        obj({ op: z.literal('move'), ...AT }),
        obj({ op: z.literal('line'), ...AT }),
        obj({ op: z.literal('quadratic'), cx: METRES, cy: METRES, ...AT }),
        obj({
          op: z.literal('cubic'),
          c1x: METRES,
          c1y: METRES,
          c2x: METRES,
          c2y: METRES,
          ...AT,
        }),
        obj({
          op: z.literal('arc'),
          rx: SIZE,
          ry: SIZE,
          rotation: z.number().optional(),
          large: z.boolean(),
          sweep: z.boolean(),
          ...AT,
        }),
      ]),
    )
    .min(2)
    .refine((path) => path[0]?.op === 'move', { message: 'a path starts with move' });
});

const solidGeometries = schemaFactory((obj) => {
  const { length, radius } = bindingSchemas(obj);
  return [
    obj({
      type: z.literal('roundedBox'),
      width: length,
      height: length,
      depth: length,
      radius,
      segments: SEGMENTS,
    }),
    obj({
      type: z.literal('cylinder'),
      height: length,
      topRadius: radius,
      bottomRadius: radius,
      bevel: radius.optional(),
      segments: SEGMENTS,
    }),
    obj({ type: z.literal('capsule'), radius: length, length, segments: SEGMENTS }),
    obj({
      type: z.literal('sphere'),
      radius: length,
      phiStart: z.number().optional(),
      phiLength: z.number().positive().max(360).optional(),
      thetaStart: z.number().optional(),
      thetaLength: z.number().positive().max(180).optional(),
      segments: SEGMENTS,
    }),
    obj({ type: z.literal('torus'), radius: length, tube: length, segments: SEGMENTS }),
    obj({ type: z.literal('lathe'), profile: z.array(POINT2).min(2), segments: SEGMENTS }),
  ] as const;
});

const panelGeometries = schemaFactory((obj) => {
  const { length, radius } = bindingSchemas(obj);
  return [
    obj({
      type: z.literal('roundedPlane'),
      width: length,
      height: length,
      radius,
      segments: SEGMENTS,
    }),
    obj({
      type: z.literal('glow'),
      width: length,
      height: length,
      segments: SEGMENTS,
    }),
    obj({
      type: z.literal('ring'),
      innerRadius: radius,
      outerRadius: length,
      segments: SEGMENTS,
    }).refine(
      (ring) =>
        typeof ring.innerRadius !== 'number' ||
        typeof ring.outerRadius !== 'number' ||
        ring.innerRadius < ring.outerRadius,
      { message: 'innerRadius is below outerRadius' },
    ),
    obj({
      type: z.literal('grille'),
      width: length,
      height: length,
      rows: z.number().int().min(1),
      columns: z.number().int().min(1),
      holeRadius: length,
    }),
    obj({
      type: z.literal('slats'),
      count: z.number().int().min(1),
      spacing: length,
      width: length,
      height: length,
      depth: length,
    }),
  ] as const;
});

export const geometrySchema = schemaFactory((obj) => {
  const { length, radius } = bindingSchemas(obj);
  return z.discriminatedUnion('type', [
    ...solidGeometries(obj),
    obj({
      type: z.literal('extrude'),
      path: pathSchema(obj),
      depth: length,
      bevel: radius.optional(),
    }),
    obj({
      type: z.literal('tube'),
      points: z.array(POINT3).min(2),
      radius: length,
      segments: SEGMENTS,
    }),
    ...panelGeometries(obj),
  ]);
});

export const MODEL_SPEC_PATH = pathSchema(z.strictObject);
export const MODEL_SPEC_GEOMETRY = geometrySchema(z.strictObject);

export type ModelSpecGeometry = z.infer<typeof MODEL_SPEC_GEOMETRY>;
