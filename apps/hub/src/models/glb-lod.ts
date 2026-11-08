import { createHash } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { z } from 'zod';
import { checkGlb } from './glb-check';
import {
  DOCUMENT,
  gather,
  type IMAGE,
  LodProblem,
  Packer,
  padded,
  components,
  positionFloats,
  problem,
  readAccessor,
  UNSIGNED_INT,
  UNSIGNED_SHORT,
  withBounds,
  type Json,
  type Kind,
  type Packed,
  type Primitive,
  type Source,
} from './glb-lod-data';

export type GlbLodTargets = readonly [lod0: number, lod1: number, lod2: number];

export const GLB_LOD_TRIANGLE_TARGETS: GlbLodTargets = [1500, 6000, 25000];

export interface GlbLod {
  readonly level: 0 | 1 | 2;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly triangles: number;
}

export type GlbLodResult =
  | { readonly ok: true; readonly levels: readonly [GlbLod, GlbLod, GlbLod] }
  | { readonly ok: false; readonly problem: string };

const log = new Logger('hub.models');

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const UNUSED = 0xffffffff;
const MAX_SHORT_INDEX = 0xffff;

function sourceIndices(src: Source, primitive: Primitive, vertices: number): Uint32Array {
  const raw =
    primitive.indices === undefined
      ? Uint32Array.from({ length: vertices }, (_, at) => at)
      : Uint32Array.from(components(readAccessor(src, primitive.indices)));
  const whole = raw.subarray(0, raw.length - (raw.length % 3));
  if (whole.some((at) => at >= vertices)) problem('has an index past its vertex count');
  return whole;
}

function simplified(indices: Uint32Array, position: Packed, ratio: number): Uint32Array {
  const goal = Math.max(1, Math.floor((indices.length / 3) * ratio)) * 3;
  const [result] = MeshoptSimplifier.simplify(indices, positionFloats(position), 3, goal, 1);
  if (result.length > 0) return result;
  log.warn('model_lod.primitive_kept', { triangles: indices.length / 3, goal });
  return indices;
}

function usedVertices(
  indices: Uint32Array,
  vertices: number,
): { order: Uint32Array; indices: Uint32Array } {
  const remap = new Uint32Array(vertices).fill(UNUSED);
  indices.forEach((at) => {
    remap[at] = 0;
  });
  const order: number[] = [];
  remap.forEach((mark, at) => {
    if (mark === UNUSED) return;
    remap[at] = order.length;
    order.push(at);
  });
  return {
    order: Uint32Array.from(order),
    indices: Uint32Array.from(indices, (at) => remap[at] ?? 0),
  };
}

function indexAccessor(indices: Uint32Array, vertices: number): Packed {
  const short = vertices <= MAX_SHORT_INDEX + 1;
  const typed = short ? Uint16Array.from(indices) : indices;
  return {
    count: indices.length,
    componentType: short ? UNSIGNED_SHORT : UNSIGNED_INT,
    type: 'SCALAR',
    normalized: false,
    element: short ? 2 : 4,
    bytes: new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength),
    extra: {},
  };
}

interface Context {
  readonly src: Source;
  readonly packer: Packer;
  readonly copies: Map<number, number>;
}

function copied(ctx: Context, index: number, kind: Kind): number {
  const known = ctx.copies.get(index);
  if (known !== undefined) return known;
  const made = ctx.packer.accessor(readAccessor(ctx.src, index), kind);
  ctx.copies.set(index, made);
  return made;
}

function copyAll(ctx: Context, attributes: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, index]) => [name, copied(ctx, index, 'vertex')]),
  );
}

function copyPrimitive(ctx: Context, primitive: Primitive): Json {
  return {
    ...primitive,
    attributes: copyAll(ctx, primitive.attributes),
    ...(primitive.indices === undefined
      ? {}
      : { indices: copied(ctx, primitive.indices, 'index') }),
    ...(primitive.targets === undefined
      ? {}
      : { targets: primitive.targets.map((one) => copyAll(ctx, one)) }),
  };
}

function gathered(
  ctx: Context,
  set: Record<string, number>,
  order: Uint32Array,
  bounded: boolean,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(set).map(([name, index]) => {
      const packed = readAccessor(ctx.src, index);
      const cut = gather(packed, order);
      return [
        name,
        ctx.packer.accessor(bounded && name === 'POSITION' ? withBounds(cut) : cut, 'vertex'),
      ];
    }),
  );
}

function checkVertexCounts(ctx: Context, primitive: Primitive, vertices: number): void {
  const sets = [primitive.attributes, ...(primitive.targets ?? [])];
  for (const set of sets) {
    for (const [name, index] of Object.entries(set)) {
      if (readAccessor(ctx.src, index).count !== vertices) {
        problem(`has attribute ${name} with another vertex count`);
      }
    }
  }
}

function decimatePrimitive(
  ctx: Context,
  primitive: Primitive,
  positionAt: number,
  ratio: number,
): Json {
  const position = readAccessor(ctx.src, positionAt);
  if (position.type !== 'VEC3') problem('has a POSITION accessor that is not VEC3');
  const vertices = position.count;
  checkVertexCounts(ctx, primitive, vertices);
  const kept = simplified(sourceIndices(ctx.src, primitive, vertices), position, ratio);
  const used = usedVertices(kept, vertices);
  const attributes = gathered(ctx, primitive.attributes, used.order, true);
  const targets = primitive.targets?.map((one) => gathered(ctx, one, used.order, false));
  const indices = ctx.packer.accessor(indexAccessor(used.indices, used.order.length), 'index');
  return { ...primitive, attributes, indices, ...(targets === undefined ? {} : { targets }) };
}

function rewritePrimitive(ctx: Context, primitive: Primitive, ratio: number): Json {
  const positionAt = primitive.attributes['POSITION'];
  if ((primitive.mode ?? 4) !== 4 || positionAt === undefined) return copyPrimitive(ctx, primitive);
  return decimatePrimitive(ctx, primitive, positionAt, ratio);
}

function imageView(ctx: Context, image: z.infer<typeof IMAGE>): Json {
  const view =
    ctx.src.doc.bufferViews[image.bufferView ?? -1] ?? problem('has an image without a bufferView');
  const start = view.byteOffset ?? 0;
  return {
    ...image,
    bufferView: ctx.packer.view(ctx.src.bin.subarray(start, start + view.byteLength)),
  };
}

function listed(key: string, value: readonly unknown[]): Json {
  return value.length > 0 ? { [key]: value } : {};
}

function buildLevel(src: Source, ratio: number): Uint8Array {
  const ctx: Context = { src, packer: new Packer(), copies: new Map() };
  const { doc } = src;
  const meshes = doc.meshes.map((mesh) => ({
    ...mesh,
    primitives: mesh.primitives.map((primitive) => rewritePrimitive(ctx, primitive, ratio)),
  }));
  const skins = (doc.skins ?? []).map((skin) => ({
    ...skin,
    ...(skin.inverseBindMatrices === undefined
      ? {}
      : { inverseBindMatrices: copied(ctx, skin.inverseBindMatrices, 'other') }),
  }));
  const animations = (doc.animations ?? []).map((animation) => ({
    ...animation,
    samplers: animation.samplers.map((sampler) => ({
      ...sampler,
      input: copied(ctx, sampler.input, 'other'),
      output: copied(ctx, sampler.output, 'other'),
    })),
  }));
  const images = (doc.images ?? []).map((image) => imageView(ctx, image));
  const bin = ctx.packer.binary();
  return container(
    {
      ...doc,
      meshes,
      ...listed('skins', skins),
      ...listed('animations', animations),
      ...listed('images', images),
      accessors: ctx.packer.accessors,
      bufferViews: ctx.packer.views,
      buffers: [{ byteLength: bin.byteLength }],
    },
    bin,
  );
}

function container(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonChunk = padded(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const total = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  out.set(jsonChunk, 20);
  const binAt = 20 + jsonChunk.byteLength;
  view.setUint32(binAt, bin.byteLength, true);
  view.setUint32(binAt + 4, BIN_CHUNK, true);
  out.set(bin, binAt + 8);
  return out;
}

function openSource(content: Uint8Array): Source {
  const reader = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const jsonEnd = 20 + reader.getUint32(12, true);
  const json: unknown = JSON.parse(new TextDecoder().decode(content.subarray(20, jsonEnd)));
  const bin =
    jsonEnd < content.byteLength
      ? content.subarray(jsonEnd + 8, jsonEnd + 8 + reader.getUint32(jsonEnd, true))
      : new Uint8Array();
  return { doc: DOCUMENT.parse(json), bin, cache: new Map() };
}

interface Plan {
  readonly src: Source;
  readonly content: Uint8Array;
  readonly total: number;
}

function makeLevel(plan: Plan, level: 0 | 1 | 2, target: number): GlbLod {
  const ratio = plan.total === 0 ? 1 : target / plan.total;
  const bytes = ratio >= 1 ? plan.content : buildLevel(plan.src, ratio);
  const checked =
    ratio >= 1 ? ({ ok: true, value: { triangles: plan.total } } as const) : checkGlb(bytes);
  if (!checked.ok) return problem(`produced an invalid LOD ${String(level)} ${checked.problem}`);
  return {
    level,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    triangles: checked.value.triangles,
  };
}

async function ensureSimplifier(): Promise<void> {
  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported) problem('cannot run the mesh simplifier without WebAssembly');
}

export async function decimateGlb(
  content: Uint8Array,
  targets: GlbLodTargets = GLB_LOD_TRIANGLE_TARGETS,
): Promise<GlbLodResult> {
  const checked = checkGlb(content);
  if (!checked.ok) return { ok: false, problem: `GLB ${checked.problem}` };
  const total = checked.value.triangles;
  const operation = log.operation('model_lod.decimate', { triangles: total });
  try {
    await ensureSimplifier();
    const plan: Plan = { src: openSource(content), content, total };
    const levels = [
      makeLevel(plan, 0, targets[0]),
      makeLevel(plan, 1, targets[1]),
      makeLevel(plan, 2, targets[2]),
    ] as const;
    operation.succeeded({
      lod0: levels[0].triangles,
      lod1: levels[1].triangles,
      lod2: levels[2].triangles,
    });
    return { ok: true, levels };
  } catch (cause) {
    operation.failed(cause);
    if (cause instanceof LodProblem) return { ok: false, problem: `GLB ${cause.message}` };
    throw cause;
  }
}
