import { z } from 'zod';

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
export const UNSIGNED_SHORT = 5123;
export const UNSIGNED_INT = 5125;

type Components = new (buffer: ArrayBuffer) => ArrayLike<number>;

const ARRAYS = new Map<number, Components>([
  [5120, Int8Array],
  [5121, Uint8Array],
  [5122, Int16Array],
  [UNSIGNED_SHORT, Uint16Array],
  [UNSIGNED_INT, Uint32Array],
  [5126, Float32Array],
]);
const COMPONENT_SIZE = new Map<number, number>([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [UNSIGNED_SHORT, 2],
  [UNSIGNED_INT, 4],
  [5126, 4],
]);
const NORMALISER = new Map<number, number>([
  [5120, 127],
  [5121, 255],
  [5122, 32767],
  [UNSIGNED_SHORT, 65535],
]);
const STRUCTURE = new Set([
  'bufferView',
  'byteOffset',
  'sparse',
  'count',
  'normalized',
  'componentType',
  'type',
]);

const INDEX = z.number().int().nonnegative();
const ACCESSOR = z.looseObject({
  bufferView: INDEX.optional(),
  byteOffset: INDEX.optional(),
  componentType: z.number().int(),
  normalized: z.boolean().optional(),
  count: z.number().int().positive(),
  type: z.enum(['SCALAR', 'VEC2', 'VEC3', 'VEC4', 'MAT2', 'MAT3', 'MAT4']),
  sparse: z
    .looseObject({
      count: z.number().int().positive(),
      indices: z.looseObject({
        bufferView: INDEX,
        byteOffset: INDEX.optional(),
        componentType: z.number().int(),
      }),
      values: z.looseObject({ bufferView: INDEX, byteOffset: INDEX.optional() }),
    })
    .optional(),
});
const PRIMITIVE = z.looseObject({
  attributes: z.record(z.string(), INDEX),
  indices: INDEX.optional(),
  mode: z.number().int().optional(),
  targets: z.array(z.record(z.string(), INDEX)).optional(),
});
const MESH = z.looseObject({ primitives: z.array(PRIMITIVE) });
export const IMAGE = z.looseObject({ bufferView: INDEX.optional() });
const SKIN = z.looseObject({ inverseBindMatrices: INDEX.optional() });
const SAMPLER = z.looseObject({ input: INDEX, output: INDEX });
const ANIMATION = z.looseObject({ samplers: z.array(SAMPLER) });
export const DOCUMENT = z.looseObject({
  bufferViews: z
    .array(
      z.looseObject({
        byteOffset: INDEX.optional(),
        byteLength: z.number().int().positive(),
        byteStride: INDEX.optional(),
      }),
    )
    .default([]),
  accessors: z.array(ACCESSOR).default([]),
  meshes: z.array(MESH).default([]),
  images: z.array(IMAGE).optional(),
  skins: z.array(SKIN).optional(),
  animations: z.array(ANIMATION).optional(),
});

export type Doc = z.infer<typeof DOCUMENT>;
export type Accessor = Doc['accessors'][number];
export type Primitive = z.infer<typeof PRIMITIVE>;
export type Json = Record<string, unknown>;
export type Kind = 'vertex' | 'index' | 'other';

export interface Packed {
  readonly count: number;
  readonly componentType: number;
  readonly type: Accessor['type'];
  readonly normalized: boolean;
  readonly element: number;
  readonly bytes: Uint8Array;
  readonly extra: Json;
}

export interface Source {
  readonly doc: Doc;
  readonly bin: Uint8Array;
  readonly cache: Map<number, Packed>;
}

export class LodProblem extends Error {}

export function problem(message: string): never {
  throw new LodProblem(message);
}

export function ceil4(value: number): number {
  return Math.ceil(value / 4) * 4;
}

export function padded(bytes: Uint8Array, fill: number): Uint8Array {
  const out = new Uint8Array(ceil4(bytes.byteLength)).fill(fill);
  out.set(bytes);
  return out;
}

function componentSize(type: number): number {
  return COMPONENT_SIZE.get(type) ?? problem(`has an unknown component type ${String(type)}`);
}

function elementBytes(accessor: Accessor): number {
  const component = componentSize(accessor.componentType);
  const rows = accessor.type === 'SCALAR' ? 1 : Number(accessor.type.slice(-1));
  if (!accessor.type.startsWith('MAT')) return rows * component;
  return rows * ceil4(rows * component);
}

function viewOf(src: Source, index: number): { start: number; stride: number | undefined } {
  const view =
    src.doc.bufferViews[index] ?? problem(`points at missing bufferView ${String(index)}`);
  return { start: view.byteOffset ?? 0, stride: view.byteStride };
}

function fillDense(src: Source, accessor: Accessor, element: number, out: Uint8Array): void {
  const view = viewOf(src, accessor.bufferView ?? 0);
  const stride = view.stride ?? element;
  const base = view.start + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row += 1) {
    const at = base + row * stride;
    out.set(src.bin.subarray(at, at + element), row * element);
  }
}

function fillSparse(src: Source, accessor: Accessor, element: number, out: Uint8Array): void {
  const { sparse } = accessor;
  if (sparse === undefined) return;
  const size = componentSize(sparse.indices.componentType);
  const indices = viewOf(src, sparse.indices.bufferView).start + (sparse.indices.byteOffset ?? 0);
  const values = viewOf(src, sparse.values.bufferView).start + (sparse.values.byteOffset ?? 0);
  const reader = new DataView(src.bin.buffer, src.bin.byteOffset, src.bin.byteLength);
  for (let entry = 0; entry < sparse.count; entry += 1) {
    const at = indices + entry * size;
    const target =
      size === 1
        ? reader.getUint8(at)
        : size === 2
          ? reader.getUint16(at, true)
          : reader.getUint32(at, true);
    if (target >= accessor.count) problem('has a sparse index past its accessor');
    out.set(
      src.bin.subarray(values + entry * element, values + (entry + 1) * element),
      target * element,
    );
  }
}

export function readAccessor(src: Source, index: number): Packed {
  const cached = src.cache.get(index);
  if (cached !== undefined) return cached;
  const accessor =
    src.doc.accessors[index] ?? problem(`points at missing accessor ${String(index)}`);
  const element = elementBytes(accessor);
  const bytes = new Uint8Array(accessor.count * element);
  if (accessor.bufferView !== undefined) fillDense(src, accessor, element, bytes);
  fillSparse(src, accessor, element, bytes);
  const packed: Packed = {
    count: accessor.count,
    componentType: accessor.componentType,
    type: accessor.type,
    normalized: accessor.normalized === true,
    element,
    bytes,
    extra: Object.fromEntries(Object.entries(accessor).filter(([key]) => !STRUCTURE.has(key))),
  };
  src.cache.set(index, packed);
  return packed;
}

export function components(packed: Packed): ArrayLike<number> {
  const Ctor = ARRAYS.get(packed.componentType) ?? problem('has an unknown component type');
  return new Ctor(packed.bytes.slice().buffer);
}

export class Packer {
  readonly views: Json[] = [];
  readonly accessors: Json[] = [];
  private readonly chunks: Uint8Array[] = [];
  private size = 0;

  view(bytes: Uint8Array, extra: Json = {}): number {
    this.views.push({ buffer: 0, byteOffset: this.size, byteLength: bytes.byteLength, ...extra });
    const chunk = padded(bytes, 0);
    this.chunks.push(chunk);
    this.size += chunk.byteLength;
    return this.views.length - 1;
  }

  accessor(packed: Packed, kind: Kind): number {
    const stride = kind === 'vertex' ? ceil4(packed.element) : packed.element;
    const target = kind === 'vertex' ? ARRAY_BUFFER : ELEMENT_ARRAY_BUFFER;
    const fields: Json = {
      ...(stride === packed.element ? {} : { byteStride: stride }),
      ...(kind === 'other' ? {} : { target }),
    };
    const bufferView = this.view(spaced(packed, stride), fields);
    this.accessors.push({
      ...packed.extra,
      bufferView,
      componentType: packed.componentType,
      ...(packed.normalized ? { normalized: true } : {}),
      count: packed.count,
      type: packed.type,
    });
    return this.accessors.length - 1;
  }

  binary(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  }
}

function spaced(packed: Packed, stride: number): Uint8Array {
  if (stride === packed.element) return packed.bytes;
  const out = new Uint8Array(packed.count * stride);
  for (let row = 0; row < packed.count; row += 1) {
    out.set(packed.bytes.subarray(row * packed.element, (row + 1) * packed.element), row * stride);
  }
  return out;
}

export function gather(packed: Packed, order: Uint32Array): Packed {
  const bytes = new Uint8Array(order.length * packed.element);
  order.forEach((old, row) => {
    bytes.set(
      packed.bytes.subarray(old * packed.element, (old + 1) * packed.element),
      row * packed.element,
    );
  });
  const { min: _min, max: _max, ...extra } = packed.extra;
  return { ...packed, count: order.length, bytes, extra };
}

export function withBounds(packed: Packed): Packed {
  const values = components(packed);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let at = 0; at < values.length; at += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = values[at + axis] ?? 0;
      min[axis] = Math.min(min[axis] ?? value, value);
      max[axis] = Math.max(max[axis] ?? value, value);
    }
  }
  return { ...packed, extra: { ...packed.extra, min, max } };
}

export function positionFloats(packed: Packed): Float32Array {
  const scale = packed.normalized ? (NORMALISER.get(packed.componentType) ?? 1) : 1;
  return Float32Array.from(components(packed), (value) =>
    Math.max(value / scale, packed.normalized ? -1 : -Infinity),
  );
}
