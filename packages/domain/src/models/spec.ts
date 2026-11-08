import { z } from 'zod';
import { DEVICE_FAMILIES } from '../presentation/types';
import { isUnknownArray } from '../values';
import {
  MODEL_ID,
  MODEL_SPEC_LIMITS,
  NAME,
  SEMVER,
  SIZE,
  SCALAR,
  TOKEN,
  UNIT,
  schemaFactory,
} from './spec-base';
import {
  anchorSchema,
  materialOverrideSchema,
  materialSchema,
  partSchema,
  type ModelSpecPart,
} from './spec-parts';
import { channelSchema, shotSchema } from './spec-motion';

export {
  MODEL_SPEC_BINDING,
  MODEL_SPEC_LIMITS,
  MODEL_SPEC_TRANSFORM,
  type ModelSpecTransform,
} from './spec-base';
export { MODEL_SPEC_GEOMETRY, MODEL_SPEC_PATH, type ModelSpecGeometry } from './spec-geometry';
export {
  MODEL_SPEC_ANCHOR,
  MODEL_SPEC_EFFECTS,
  MODEL_SPEC_MATERIAL,
  MODEL_SPEC_MATERIAL_OVERRIDE,
  MODEL_SPEC_MOUNTS,
  MODEL_SPEC_PART,
  MODEL_SPEC_PATTERNS,
  type ModelSpecAnchor,
  type ModelSpecMaterial,
  type ModelSpecPart,
} from './spec-parts';
export {
  MODEL_SPEC_CHANNEL,
  MODEL_SPEC_CONDITION,
  MODEL_SPEC_MAP,
  MODEL_SPEC_MOTION,
  MODEL_SPEC_PROPERTIES,
  MODEL_SPEC_SHOT,
  MODEL_SPEC_SIGNAL,
  type ModelSpecChannel,
  type ModelSpecCondition,
  type ModelSpecShot,
  type ModelSpecSignal,
} from './spec-motion';
export {
  blurLayerIds,
  modelParamValues,
  partVisibleFor,
  resolveModelBinding,
  shownParts,
  stillParts,
  type ModelSpecBindable,
  type ModelSpecLod,
  type ModelSpecParamValues,
} from './spec-shown';

const fovSchema = schemaFactory((obj) => {
  return obj({
    hDeg: z.number().positive().max(360),
    vDeg: z.number().positive().max(180),
    rangeM: SIZE,
    exact: z.boolean(),
  });
});

const metaSchema = schemaFactory((obj) => {
  return obj({
    names: obj({
      display: z.string().min(1),
      synonyms: z.array(z.string().min(1)).optional(),
    }),
    sizeClass: TOKEN.optional(),
    variants: z.array(NAME).optional(),
    aliases: z.array(z.string().min(1)).optional(),
  });
});

const paramSchema = schemaFactory((obj) => {
  return obj({
    min: z.number(),
    max: z.number(),
    default: z.number(),
    unit: z.enum(['m', 'deg', 'count', 'ratio']),
  }).refine((param) => param.min <= param.default && param.default <= param.max, {
    message: 'default lies between min and max',
  });
});

const extentSchema = schemaFactory((obj) => {
  return obj({
    param: NAME,
    scale: z.number().positive().optional(),
    extra: z.number(),
    resizes: z.boolean(),
  });
});

const sizeSchema = schemaFactory((obj) => {
  const extent = extentSchema(obj);
  return obj({ width: extent.optional(), depth: extent.optional(), height: extent.optional() });
});

const framingSchema = schemaFactory((obj) => {
  const view = obj({
    yaw: z.number().min(-360).max(360),
    pitch: z.number().min(-90).max(90),
    fov: z.number().min(1).max(120),
    padding: UNIT,
    focus: NAME.optional(),
  });
  return obj({ tile: view, card: view, hero: view });
});

const shapeSchema = schemaFactory((obj) => {
  return obj({
    schema: z.literal(1),
    id: MODEL_ID,
    version: SEMVER,
    title: z.string().min(1),
    category: TOKEN,
    family: z.enum(DEVICE_FAMILIES).optional(),
    footprint: obj({ width: SIZE, depth: SIZE, height: SIZE }),
    size: sizeSchema(obj).optional(),
    framing: framingSchema(obj),
    shots: z.array(shotSchema(obj)).optional(),
    fov: fovSchema(obj).optional(),
    meta: metaSchema(obj).optional(),
    params: z.record(NAME, paramSchema(obj)).optional(),
    materials: z.record(NAME, materialSchema(obj)),
    finishes: z.record(NAME, z.record(NAME, materialOverrideSchema(obj))).optional(),
    defaultFinish: NAME.optional(),
    parts: z.array(partSchema(obj)).min(1).max(MODEL_SPEC_LIMITS.parts),
    anchors: z.array(anchorSchema(obj)).max(MODEL_SPEC_LIMITS.anchors).optional(),
    channels: z.array(channelSchema(obj)).max(MODEL_SPEC_LIMITS.channels).optional(),
    states: z.record(NAME, z.record(z.string().min(1), SCALAR)).optional(),
  });
});

export const MODEL_SPEC_FOV = fovSchema(z.strictObject);
export const MODEL_SPEC_META = metaSchema(z.strictObject);
export const MODEL_SPEC_PARAM = paramSchema(z.strictObject);
export const MODEL_SPEC_EXTENT = extentSchema(z.strictObject);
export const MODEL_SPEC_SIZE = sizeSchema(z.strictObject);
export const MODEL_SPEC_SIZE_AXES = ['width', 'depth', 'height'] as const;
export const MODEL_SPEC_SIZE_TOLERANCE = 0.001;
export const MODEL_SPEC_FRAMING = framingSchema(z.strictObject);
export const MODEL_SPEC_SHAPE = shapeSchema(z.strictObject);

export type ModelSpecShape = z.infer<typeof MODEL_SPEC_SHAPE>;

interface Problem {
  readonly path: (string | number)[];
  readonly message: string;
}

function duplicateProblems(
  items: readonly { readonly id: string }[],
  key: string,
  taken: Set<string>,
): Problem[] {
  const out: Problem[] = [];
  items.forEach((item, index) => {
    if (taken.has(item.id))
      out.push({ path: [key, index, 'id'], message: `duplicate id ${item.id}` });
    taken.add(item.id);
  });
  return out;
}

function depthOf(part: ModelSpecPart, byId: ReadonlyMap<string, ModelSpecPart>): number {
  let depth = 1;
  let current = part;
  while (current.parent !== undefined && depth <= MODEL_SPEC_LIMITS.partDepth) {
    const next = byId.get(current.parent);
    if (next === undefined) break;
    current = next;
    depth += 1;
  }
  return depth;
}

function treeProblems(parts: readonly ModelSpecPart[]): Problem[] {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const out: Problem[] = [];
  parts.forEach((part, index) => {
    if (part.parent !== undefined && !byId.has(part.parent)) {
      out.push({ path: ['parts', index, 'parent'], message: `unknown parent ${part.parent}` });
    }
    if (depthOf(part, byId) > MODEL_SPEC_LIMITS.partDepth) {
      out.push({ path: ['parts', index], message: 'tree deeper than the depth limit or cyclic' });
    }
  });
  return out;
}

function collectParams(value: unknown, found: Set<string>): void {
  if (isUnknownArray(value)) {
    for (const item of value) collectParams(item, found);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const entries: readonly (readonly [string, unknown])[] = Object.entries(value);
  for (const [key, inner] of entries) {
    if (key === 'param' && typeof inner === 'string') found.add(inner);
    else collectParams(inner, found);
  }
}

function unknownRef(
  path: (string | number)[],
  value: string | undefined,
  known: ReadonlySet<string>,
  what: string,
): Problem[] {
  return value === undefined || known.has(value)
    ? []
    : [{ path, message: `unknown ${what} ${value}` }];
}

function partRefProblems(spec: ModelSpecShape): Problem[] {
  const params = new Set(Object.keys(spec.params ?? {}));
  const slots = new Set(Object.keys(spec.materials));
  const out: Problem[] = [];
  spec.parts.forEach((part, index) => {
    out.push(...unknownRef(['parts', index, 'material'], part.material, slots, 'material slot'));
    const used = new Set<string>();
    collectParams(part, used);
    for (const name of used) out.push(...unknownRef(['parts', index], name, params, 'param'));
  });
  return out;
}

function finishProblems(spec: ModelSpecShape): Problem[] {
  const slots = new Set(Object.keys(spec.materials));
  const finishes = spec.finishes ?? {};
  const out = unknownRef(
    ['defaultFinish'],
    spec.defaultFinish,
    new Set(Object.keys(finishes)),
    'finish',
  );
  for (const [name, overrides] of Object.entries(finishes)) {
    for (const slot of Object.keys(overrides)) {
      out.push(...unknownRef(['finishes', name, slot], slot, slots, 'material slot'));
    }
  }
  return out;
}

function targetProblems(spec: ModelSpecShape, targets: ReadonlySet<string>): Problem[] {
  const out: Problem[] = [];
  spec.channels?.forEach((channel, index) => {
    out.push(...unknownRef(['channels', index, 'target'], channel.target, targets, 'target'));
  });
  const parts = new Set(spec.parts.map((part) => part.id));
  spec.channels?.forEach((channel, index) => {
    const blur = channel.blur?.part;
    out.push(...unknownRef(['channels', index, 'blur', 'part'], blur, parts, 'blur part'));
  });
  spec.shots?.forEach((shot, index) => {
    out.push(...unknownRef(['shots', index, 'focus'], shot.focus, targets, 'focus'));
  });
  for (const view of ['tile', 'card', 'hero'] as const) {
    out.push(...unknownRef(['framing', view, 'focus'], spec.framing[view].focus, targets, 'focus'));
  }
  return out;
}

function sizeProblems(spec: ModelSpecShape): Problem[] {
  const params = spec.params ?? {};
  return MODEL_SPEC_SIZE_AXES.flatMap((axis): Problem[] => {
    const extent = spec.size?.[axis];
    if (extent === undefined) return [];
    const path = ['size', axis, 'param'];
    const param = params[extent.param];
    if (param === undefined) return [{ path, message: `unknown param ${extent.param}` }];
    if (param.unit !== 'm')
      return [{ path, message: `size param ${extent.param} is not in metres` }];
    const outer = (value: number): number => value * (extent.scale ?? 1) + extent.extra;
    const out: Problem[] = [];
    if (Math.abs(outer(param.default) - spec.footprint[axis]) > MODEL_SPEC_SIZE_TOLERANCE) {
      out.push({
        path: ['footprint', axis],
        message: `footprint ${axis} differs from the size ${extent.param} gives at its default`,
      });
    }
    if (outer(param.min) <= 0) {
      out.push({ path: ['size', axis], message: `size ${axis} is not positive at the minimum` });
    }
    return out;
  });
}

function specProblems(spec: ModelSpecShape): Problem[] {
  const taken = new Set<string>();
  const anchors = spec.anchors ?? [];
  const parts = new Set(spec.parts.map((part) => part.id));
  return [
    ...duplicateProblems(spec.parts, 'parts', taken),
    ...duplicateProblems(anchors, 'anchors', taken),
    ...duplicateProblems(spec.channels ?? [], 'channels', new Set()),
    ...duplicateProblems(spec.shots ?? [], 'shots', new Set()),
    ...treeProblems(spec.parts),
    ...partRefProblems(spec),
    ...finishProblems(spec),
    ...targetProblems(spec, taken),
    ...sizeProblems(spec),
    ...anchors.flatMap((anchor, index) =>
      unknownRef(['anchors', index, 'parent'], anchor.parent, parts, 'parent'),
    ),
  ];
}

function checkReferences(spec: ModelSpecShape, ctx: z.RefinementCtx): void {
  for (const problem of specProblems(spec)) {
    ctx.addIssue({ code: 'custom', path: problem.path, message: problem.message });
  }
}

export const MODEL_SPEC = MODEL_SPEC_SHAPE.superRefine(checkReferences);
export const MODEL_SPEC_READ = shapeSchema(z.object).superRefine(checkReferences);

export type ModelSpec = z.infer<typeof MODEL_SPEC>;
export type ModelSpecFov = z.infer<typeof MODEL_SPEC_FOV>;
export type ModelSpecMeta = z.infer<typeof MODEL_SPEC_META>;
export type ModelSpecParam = z.infer<typeof MODEL_SPEC_PARAM>;
export type ModelSpecExtent = z.infer<typeof MODEL_SPEC_EXTENT>;
export type ModelSpecSize = z.infer<typeof MODEL_SPEC_SIZE>;
export type ModelSpecSizeAxis = (typeof MODEL_SPEC_SIZE_AXES)[number];
export type ModelSpecFraming = z.infer<typeof MODEL_SPEC_FRAMING>;
