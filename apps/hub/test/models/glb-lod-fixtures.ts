import { z } from 'zod';
import { pngBytes } from './model-fixtures';

const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const INT16 = 5122;
const INT8 = 5120;

type Json = Record<string, unknown>;

const JSON_OBJECT = z.record(z.string(), z.unknown());

export interface GridOptions {
  readonly side: number;
  readonly instances?: number;
  readonly quantized?: boolean;
  readonly image?: boolean;
  readonly animation?: boolean;
  readonly badIndex?: boolean;
  readonly shortNormals?: boolean;
}

export interface ParsedGlb {
  readonly json: Json;
  readonly bin: Uint8Array;
}

class Blobs {
  readonly views: Json[] = [];
  readonly accessors: Json[] = [];
  private readonly chunks: Uint8Array[] = [];
  private size = 0;

  view(bytes: Uint8Array, extra: Json = {}): number {
    this.views.push({ buffer: 0, byteOffset: this.size, byteLength: bytes.byteLength, ...extra });
    const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
    padded.set(bytes);
    this.chunks.push(padded);
    this.size += padded.byteLength;
    return this.views.length - 1;
  }

  accessor(bytes: Uint8Array, fields: Json, viewExtra: Json = {}): number {
    this.accessors.push({ bufferView: this.view(bytes, viewExtra), ...fields });
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

function floats(values: ArrayLike<number>): Uint8Array {
  return new Uint8Array(Float32Array.from(values).buffer);
}

export function container(json: unknown, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunk = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  jsonChunk.set(text);
  const total = 12 + 8 + jsonChunk.length + (bin.length > 0 ? 8 + bin.length : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, JSON_TYPE, true);
  out.set(jsonChunk, 20);
  if (bin.length > 0) {
    view.setUint32(20 + jsonChunk.length, bin.length, true);
    view.setUint32(24 + jsonChunk.length, BIN_TYPE, true);
    out.set(bin, 28 + jsonChunk.length);
  }
  return out;
}

export function parseGlb(bytes: Uint8Array): ParsedGlb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonEnd = 20 + view.getUint32(12, true);
  const text = new TextDecoder().decode(bytes.subarray(20, jsonEnd));
  const bin = bytes.subarray(jsonEnd + 8, jsonEnd + 8 + view.getUint32(jsonEnd, true));
  return { json: JSON_OBJECT.parse(JSON.parse(text)), bin };
}

function gridVertices(side: number): { positions: number[]; uvs: number[] } {
  const row = side + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let y = 0; y < row; y += 1) {
    for (let x = 0; x < row; x += 1) {
      positions.push(x / side, y / side, 0.2 * Math.sin((x / side) * 3) * Math.cos((y / side) * 3));
      uvs.push(x / side, y / side);
    }
  }
  return { positions, uvs };
}

function gridIndices(side: number): number[] {
  const row = side + 1;
  const out: number[] = [];
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const a = y * row + x;
      out.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  return out;
}

function attributes(blobs: Blobs, options: GridOptions): Record<string, number> {
  const { positions, uvs } = gridVertices(options.side);
  const count = positions.length / 3;
  const normals = Array.from({ length: count * 3 }, (_, at) => (at % 3 === 2 ? 1 : 0));
  const normalCount = options.shortNormals === true ? count - 1 : count;
  if (options.quantized !== true) {
    return {
      POSITION: blobs.accessor(floats(positions), {
        componentType: FLOAT,
        count,
        type: 'VEC3',
        min: [0, 0, -0.2],
        max: [1, 1, 0.2],
      }),
      NORMAL: blobs.accessor(floats(normals), {
        componentType: FLOAT,
        count: normalCount,
        type: 'VEC3',
      }),
      TEXCOORD_0: blobs.accessor(floats(uvs), { componentType: FLOAT, count, type: 'VEC2' }),
    };
  }
  const packedPositions = Int16Array.from(positions, (value) => Math.round(value * 32767));
  const padded = new Int8Array(count * 4);
  normals.forEach((value, at) => {
    padded[Math.floor(at / 3) * 4 + (at % 3)] = Math.round(value * 127);
  });
  return {
    POSITION: blobs.accessor(new Uint8Array(packedPositions.buffer), {
      componentType: INT16,
      normalized: true,
      count,
      type: 'VEC3',
      min: [0, 0, -1],
      max: [1, 1, 1],
    }),
    NORMAL: blobs.accessor(
      new Uint8Array(padded.buffer),
      { componentType: INT8, normalized: true, count, type: 'VEC3' },
      { byteStride: 4 },
    ),
    TEXCOORD_0: blobs.accessor(floats(uvs), { componentType: FLOAT, count, type: 'VEC2' }),
  };
}

function indexAccessor(blobs: Blobs, options: GridOptions): number {
  const indices = gridIndices(options.side);
  if (options.badIndex === true) indices[0] = 1_000_000;
  const wide = indices.some((value) => value > 65535);
  const typed = wide ? Uint32Array.from(indices) : Uint16Array.from(indices);
  return blobs.accessor(new Uint8Array(typed.buffer), {
    componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT,
    count: indices.length,
    type: 'SCALAR',
  });
}

function animationParts(blobs: Blobs): Json {
  const input = blobs.accessor(floats([0, 1, 2]), {
    componentType: FLOAT,
    count: 3,
    type: 'SCALAR',
    min: [0],
    max: [2],
  });
  const output = blobs.accessor(floats([0, 0, 0, 1, 1, 1, 2, 2, 2]), {
    componentType: FLOAT,
    count: 3,
    type: 'VEC3',
  });
  return {
    animations: [
      {
        samplers: [{ input, output, interpolation: 'LINEAR' }],
        channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
      },
    ],
  };
}

export const IMAGE_BYTES = pngBytes(8, 8);

export function gridGlb(options: GridOptions): Uint8Array {
  const blobs = new Blobs();
  const primitive = {
    attributes: attributes(blobs, options),
    indices: indexAccessor(blobs, options),
    material: 0,
  };
  const instances = options.instances ?? 1;
  const extras: Json = options.animation === true ? animationParts(blobs) : {};
  if (options.image === true) {
    const source = blobs.view(IMAGE_BYTES);
    extras['images'] = [{ bufferView: source, mimeType: 'image/png' }];
    extras['textures'] = [{ source: 0 }];
  }
  const bin = blobs.binary();
  const json: Json = {
    asset: { version: '2.0' },
    ...(options.quantized === true ? { extensionsUsed: ['KHR_mesh_quantization'] } : {}),
    scene: 0,
    scenes: [{ nodes: Array.from({ length: instances }, (_, at) => at) }],
    nodes: Array.from({ length: instances }, () => ({ mesh: 0, name: 'part' })),
    meshes: [{ primitives: [primitive] }],
    materials: [{ name: 'body', pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: blobs.views,
    accessors: blobs.accessors,
    ...extras,
  };
  return container(json, bin);
}

export function tetrahedronGlb(): Uint8Array {
  const blobs = new Blobs();
  const position = blobs.accessor(floats([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), {
    componentType: FLOAT,
    count: 4,
    type: 'VEC3',
    min: [0, 0, 0],
    max: [1, 1, 1],
  });
  const indices = blobs.accessor(
    new Uint8Array(Uint16Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]).buffer),
    {
      componentType: UNSIGNED_SHORT,
      count: 12,
      type: 'SCALAR',
    },
  );
  const bin = blobs.binary();
  return container(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: position }, indices }] }],
      buffers: [{ byteLength: bin.length }],
      bufferViews: blobs.views,
      accessors: blobs.accessors,
    },
    bin,
  );
}
