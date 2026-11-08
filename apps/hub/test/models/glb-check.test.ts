import { describe, expect, it } from 'vitest';
import {
  GLB_BYTE_LIMIT,
  GLB_EXTENSION_ALLOWLIST,
  GLB_JSON_BYTE_LIMIT,
  GLB_TEXTURE_LIMIT,
  GLB_TEXTURE_MAX_SIDE,
  GLB_TRIANGLE_LIMIT,
  checkGlb,
} from '../../src/models/glb-check';
import { pngBytes, webpExtendedBytes } from './model-fixtures';

const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;

type Json = Record<string, unknown>;

function padded(bytes: Uint8Array, fill: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
  out.set(bytes);
  return out;
}

function container(
  chunks: readonly (readonly [number, Uint8Array])[],
  declared?: number,
): Uint8Array {
  const total = 12 + chunks.reduce((sum, [, data]) => sum + 8 + data.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, declared ?? total, true);
  let at = 12;
  for (const [type, data] of chunks) {
    view.setUint32(at, data.length, true);
    view.setUint32(at + 4, type, true);
    out.set(data, at + 8);
    at += 8 + data.length;
  }
  return out;
}

function glb(json: unknown, bin: Uint8Array = new Uint8Array()): Uint8Array {
  const text = padded(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const chunks: [number, Uint8Array][] = [[JSON_TYPE, text]];
  if (bin.length > 0) chunks.push([BIN_TYPE, padded(bin, 0)]);
  return container(chunks);
}

function triangleBin(): Uint8Array {
  const out = new Uint8Array(44);
  const view = new DataView(out.buffer);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  [0, 1, 2].forEach((value, index) => {
    view.setUint16(36 + index * 2, value, true);
  });
  return out;
}

const TRIANGLE_VIEWS: readonly Json[] = [
  { buffer: 0, byteOffset: 0, byteLength: 36 },
  { buffer: 0, byteOffset: 36, byteLength: 6 },
];

function triangleDoc(patch: Json = {}): Json {
  return {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 44 }],
    bufferViews: TRIANGLE_VIEWS,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0 }],
    ...patch,
  };
}

function triangle(patch: Json = {}): Uint8Array {
  return glb(triangleDoc(patch), triangleBin());
}

interface Embedded {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

function withImages(images: readonly Embedded[]): Uint8Array {
  const base = triangleBin();
  const parts = images.map(({ bytes }) => padded(bytes, 0));
  const bin = new Uint8Array(base.length + parts.reduce((sum, part) => sum + part.length, 0));
  bin.set(base);
  const views: Json[] = [];
  let at = base.length;
  for (const [index, part] of parts.entries()) {
    bin.set(part, at);
    views.push({ buffer: 0, byteOffset: at, byteLength: images[index]?.bytes.length ?? 0 });
    at += part.length;
  }
  const doc = triangleDoc({
    buffers: [{ byteLength: bin.length }],
    bufferViews: [...TRIANGLE_VIEWS, ...views],
    images: images.map(({ mimeType }, index) => ({ bufferView: 2 + index, mimeType })),
  });
  return glb(doc, bin);
}

function jpegBytes(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    16,
    0x4a,
    0x46,
    0x49,
    0x46,
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    0xc4,
    0,
    3,
    0,
    0xff,
    0xc0,
    0,
    17,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
}

function problemOf(bytes: Uint8Array): string {
  const result = checkGlb(bytes);
  return result.ok ? 'accepted' : result.problem;
}

describe('a valid GLB', () => {
  it('reports triangles, extensions and the BIN size', () => {
    const result = checkGlb(triangle());
    expect(result).toEqual({
      ok: true,
      value: { triangles: 1, images: [], extensions: [], binByteLength: 44 },
    });
  });

  it('accepts a GLB without a BIN chunk or any mesh', () => {
    const result = checkGlb(glb({ asset: { version: '2.0' } }));
    expect(result.ok).toBe(true);
  });

  it('lists every allowed extension, declared or used inside a material', () => {
    const doc = {
      extensionsUsed: ['KHR_texture_transform', 'KHR_mesh_quantization'],
      materials: [
        { extensions: { KHR_materials_clearcoat: {}, KHR_materials_emissive_strength: {} } },
      ],
    };
    const result = checkGlb(triangle(doc));
    expect(result.ok && result.value.extensions).toEqual([
      'KHR_materials_clearcoat',
      'KHR_materials_emissive_strength',
      'KHR_mesh_quantization',
      'KHR_texture_transform',
    ]);
  });

  it('keeps the allowlist free of compression extensions', () => {
    const names = [...GLB_EXTENSION_ALLOWLIST];
    expect(names.some((name) => /draco|meshopt|basisu/i.test(name))).toBe(false);
  });
});

describe('header and chunk layout', () => {
  const good = triangle();
  const withHeader = (offset: number, value: number): Uint8Array => {
    const copy = good.slice();
    new DataView(copy.buffer).setUint32(offset, value, true);
    return copy;
  };
  const json = padded(new TextEncoder().encode('{"asset":{"version":"2.0"}}'), 0x20);

  it.each([
    ['empty input', new Uint8Array(), 'too short'],
    ['a wrong magic', withHeader(0, 0x12345678), 'not a GLB version 2'],
    ['version 1', withHeader(4, 1), 'version 2'],
    ['a length that differs from the file', withHeader(8, good.length + 4), 'differs'],
    ['a first chunk that is not JSON', container([[BIN_TYPE, json]]), 'JSON chunk'],
    [
      'a chunk with a length that is not a multiple of 4',
      container([[JSON_TYPE, json.slice(0, 5)]]),
      'multiple of 4',
    ],
    [
      'a second chunk that is not BIN',
      container([
        [JSON_TYPE, json],
        [JSON_TYPE, json],
      ]),
      'other than',
    ],
    [
      'a third chunk',
      container([
        [JSON_TYPE, json],
        [BIN_TYPE, new Uint8Array(4)],
        [BIN_TYPE, new Uint8Array(4)],
      ]),
      'other than',
    ],
    ['a chunk running past the file', withHeader(12, 4096), 'past the end'],
    [
      'bytes after the last chunk',
      container([[JSON_TYPE, json]], 12 + 8 + json.length + 3),
      'differs',
    ],
  ])('rejects %s', (_name, bytes, expected) => {
    expect(problemOf(bytes)).toContain(expected);
  });

  it('rejects a file over the byte limit before reading it', () => {
    expect(problemOf(new Uint8Array(GLB_BYTE_LIMIT + 1))).toContain('byte limit');
  });

  it('rejects a JSON chunk over the JSON byte limit before parsing it', () => {
    const huge = new Uint8Array(GLB_JSON_BYTE_LIMIT + 4).fill(0x20);
    expect(problemOf(container([[JSON_TYPE, huge]]))).toContain('JSON chunk over');
  });

  it('never throws on truncations or single byte corruptions', () => {
    for (let length = 0; length < good.length; length += 1) {
      expect(typeof checkGlb(good.subarray(0, length)).ok).toBe('boolean');
    }
    for (let at = 0; at < good.length; at += 1) {
      const copy = good.slice();
      copy[at] = (copy[at] ?? 0) ^ 0xff;
      expect(typeof checkGlb(copy).ok).toBe('boolean');
    }
  });
});

describe('JSON chunk', () => {
  const raw = (text: Uint8Array): Uint8Array => container([[JSON_TYPE, padded(text, 0x20)]]);

  it.each([
    ['text that is not JSON', raw(new TextEncoder().encode('{"asset"')), 'not UTF-8 JSON'],
    ['bytes that are not UTF-8', raw(Uint8Array.from([0x7b, 0xff, 0xfe, 0x7d])), 'not UTF-8 JSON'],
    ['a document without asset', glb({ nodes: [] }), 'asset'],
    ['glTF version 1', glb({ asset: { version: '1.0' } }), 'asset.version'],
    [
      'an accessor with an unknown type',
      triangle({ accessors: [{ componentType: 5126, count: 1, type: 'VEC9' }] }),
      'accessors.0.type',
    ],
    [
      'an accessor with an unknown component type',
      triangle({ accessors: [{ componentType: 4, count: 1, type: 'SCALAR' }] }),
      'accessors.0.componentType',
    ],
    [
      'a fractional bufferView length',
      triangle({ bufferViews: [{ buffer: 0, byteLength: 1.5 }] }),
      'bufferViews.0.byteLength',
    ],
  ])('rejects %s', (_name, bytes, expected) => {
    expect(problemOf(bytes)).toContain(expected);
  });
});

describe('buffers, bufferViews and accessors', () => {
  it.each([
    [
      'a buffer with a uri',
      triangleDoc({
        buffers: [{ byteLength: 44, uri: 'data:application/octet-stream;base64,AAAA' }],
      }),
      'uri',
    ],
    [
      'two buffers',
      triangleDoc({ buffers: [{ byteLength: 44 }, { byteLength: 4 }] }),
      'one embedded buffer',
    ],
    [
      'a buffer longer than the BIN chunk',
      triangleDoc({ buffers: [{ byteLength: 48 }] }),
      'does not match',
    ],
    [
      'a buffer far shorter than the BIN chunk',
      triangleDoc({ buffers: [{ byteLength: 40 }] }),
      'does not match',
    ],
    [
      'a bufferView past the buffer',
      triangleDoc({ bufferViews: [{ buffer: 0, byteOffset: 8, byteLength: 40 }] }),
      'bufferView 0',
    ],
    [
      'a bufferView on another buffer',
      triangleDoc({ bufferViews: [{ buffer: 1, byteLength: 4 }] }),
      'bufferView 0',
    ],
    [
      'an accessor with a missing bufferView',
      triangleDoc({
        accessors: [{ bufferView: 9, componentType: 5126, count: 1, type: 'SCALAR' }],
      }),
      'missing bufferView',
    ],
    [
      'an accessor reading past its bufferView',
      triangleDoc({ accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }] }),
      'reads past',
    ],
    [
      'an accessor offset past its bufferView',
      triangleDoc({
        accessors: [
          { bufferView: 1, byteOffset: 4, componentType: 5123, count: 3, type: 'SCALAR' },
        ],
      }),
      'reads past',
    ],
    [
      'a misaligned accessor',
      triangleDoc({
        accessors: [
          { bufferView: 0, byteOffset: 2, componentType: 5126, count: 1, type: 'SCALAR' },
        ],
      }),
      'misaligned',
    ],
    [
      'a stride smaller than the element',
      triangleDoc({ bufferViews: [{ buffer: 0, byteLength: 36, byteStride: 8 }] }),
      'byteStride',
    ],
    [
      'a stride that makes the accessor read past the view',
      triangleDoc({ bufferViews: [{ buffer: 0, byteLength: 36, byteStride: 16 }] }),
      'reads past',
    ],
    [
      'a matrix whose padded columns do not fit',
      triangleDoc({
        bufferViews: [{ buffer: 0, byteLength: 9 }],
        accessors: [{ bufferView: 0, componentType: 5121, count: 1, type: 'MAT3' }],
      }),
      'reads past',
    ],
    [
      'an accessor with no bufferView that would allocate over the limit',
      triangleDoc({ accessors: [{ componentType: 5126, count: 6_000_000, type: 'VEC4' }] }),
      'allocate',
    ],
  ])('rejects %s', (_name, doc, expected) => {
    expect(problemOf(glb(doc, triangleBin()))).toContain(expected);
  });

  it('accepts a padded matrix, a view with a stride and a zero filled accessor', () => {
    const doc = triangleDoc({
      bufferViews: [
        { buffer: 0, byteLength: 36, byteStride: 12 },
        { buffer: 0, byteOffset: 36, byteLength: 12 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5121, count: 1, type: 'MAT3' },
        { componentType: 5126, count: 100, type: 'VEC3' },
      ],
      meshes: [],
      nodes: [],
    });
    const fitting = { ...doc, buffers: [{ byteLength: 48 }] };
    expect(checkGlb(glb(fitting, new Uint8Array(48))).ok).toBe(true);
  });

  const sparse = (patch: Json): Uint8Array =>
    glb(
      triangleDoc({
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: 'VEC3',
            sparse: {
              count: 1,
              indices: { bufferView: 1, componentType: 5123 },
              values: { bufferView: 0 },
              ...patch,
            },
          },
        ],
        meshes: [],
        nodes: [],
      }),
      triangleBin(),
    );

  it('checks sparse accessor ranges and types', () => {
    expect(checkGlb(sparse({})).ok).toBe(true);
    expect(problemOf(sparse({ count: 4 }))).toContain('invalid sparse');
    expect(problemOf(sparse({ indices: { bufferView: 1, componentType: 5126 } }))).toContain(
      'invalid sparse',
    );
    expect(
      problemOf(sparse({ indices: { bufferView: 1, byteOffset: 5, componentType: 5123 } })),
    ).toContain('sparse data');
    expect(problemOf(sparse({ values: { bufferView: 1 } }))).toContain('sparse data');
    expect(problemOf(sparse({ values: { bufferView: 7 } }))).toContain('missing bufferView');
  });
});

describe('images', () => {
  const png = (side = 64): Embedded => ({ bytes: pngBytes(side, side), mimeType: 'image/png' });

  it('accepts PNG, JPEG and WebP and reports their sizes', () => {
    const bytes = withImages([
      png(),
      { bytes: jpegBytes(128, 64), mimeType: 'image/jpeg' },
      { bytes: webpExtendedBytes(100, 50), mimeType: 'image/webp' },
      png(GLB_TEXTURE_MAX_SIDE),
    ]);
    const result = checkGlb(bytes);
    expect(result.ok && result.value.images.map((i) => [i.mimeType, i.width, i.height])).toEqual([
      ['image/png', 64, 64],
      ['image/jpeg', 128, 64],
      ['image/webp', 100, 50],
      ['image/png', 2048, 2048],
    ]);
  });

  it('accepts the texture count limit and rejects one more', () => {
    expect(checkGlb(withImages(Array.from({ length: GLB_TEXTURE_LIMIT }, () => png(8)))).ok).toBe(
      true,
    );
    expect(
      problemOf(withImages(Array.from({ length: GLB_TEXTURE_LIMIT + 1 }, () => png(8)))),
    ).toContain('images');
  });

  it.each([
    ['a texture over the side limit', [png(GLB_TEXTURE_MAX_SIDE + 1)], 'over 2048'],
    [
      'a JPEG over the side limit',
      [{ bytes: jpegBytes(4096, 8), mimeType: 'image/jpeg' }],
      'over 2048',
    ],
    [
      'bytes that do not match the declared type',
      [{ bytes: pngBytes(8, 8), mimeType: 'image/jpeg' }],
      'declares',
    ],
    [
      'bytes that are no image',
      [{ bytes: new Uint8Array(32).fill(7), mimeType: 'image/png' }],
      'declares',
    ],
    [
      'a type outside PNG, JPEG and WebP',
      [{ bytes: pngBytes(8, 8), mimeType: 'image/gif' }],
      'declares',
    ],
    [
      'an image with no readable size',
      [{ bytes: pngBytes(8, 8).subarray(0, 20), mimeType: 'image/png' }],
      'no readable size',
    ],
    ['an image with no pixels', [png(0)], 'no readable size'],
  ])('rejects %s', (_name, images, expected) => {
    expect(problemOf(withImages(images))).toContain(expected);
  });

  it('rejects an image with a uri or without a bufferView', () => {
    const uri = triangle({ images: [{ uri: 'texture.png', mimeType: 'image/png' }] });
    const external = triangle({ images: [{ mimeType: 'image/png' }] });
    expect(problemOf(uri)).toContain('uri');
    expect(problemOf(external)).toContain('missing bufferView');
  });
});

describe('extensions', () => {
  it.each([
    ['declared draco compression', { extensionsUsed: ['KHR_draco_mesh_compression'] }],
    ['required meshopt compression', { extensionsRequired: ['EXT_meshopt_compression'] }],
    ['declared basisu textures', { extensionsUsed: ['KHR_texture_basisu'] }],
    ['an unknown required extension', { extensionsRequired: ['VENDOR_script'] }],
    [
      'an undeclared extension inside a material',
      { materials: [{ extensions: { KHR_draco_mesh_compression: {} } }] },
    ],
    [
      'an undeclared extension deep inside a node',
      { nodes: [{ extras: { deep: [{ extensions: { VENDOR_script: {} } }] } }] },
    ],
  ])('rejects %s', (_name, patch) => {
    expect(problemOf(triangle(patch))).toContain('not allowed');
  });
});

describe('triangles and the node graph', () => {
  const heavy = (indexCount: number, nodes: readonly unknown[]): Uint8Array =>
    glb(
      triangleDoc({
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
          { componentType: 5125, count: indexCount, type: 'SCALAR' },
        ],
        nodes,
      }),
      triangleBin(),
    );

  it('counts triangles per node instance and enforces the limit exactly', () => {
    const half = GLB_TRIANGLE_LIMIT / 2;
    const result = checkGlb(heavy(half * 3, [{ mesh: 0 }, { mesh: 0 }]));
    expect(result.ok && result.value.triangles).toBe(GLB_TRIANGLE_LIMIT);
    expect(problemOf(heavy(half * 3, [{ mesh: 0 }, { mesh: 0 }, { mesh: 0 }]))).toContain(
      'triangles',
    );
    expect(problemOf(heavy((GLB_TRIANGLE_LIMIT + 1) * 3, [{ mesh: 0 }]))).toContain('triangles');
  });

  it('counts strips and fans as n minus 2 and points and lines as zero', () => {
    const primitive = (mode: number): Json => ({ attributes: { POSITION: 0 }, indices: 1, mode });
    const count = (mode: number): number | null => {
      const result = checkGlb(triangle({ meshes: [{ primitives: [primitive(mode)] }] }));
      return result.ok ? result.value.triangles : null;
    };
    expect([0, 1, 2, 3, 4, 5, 6].map(count)).toEqual([0, 0, 0, 0, 1, 1, 1]);
  });

  it('counts non indexed primitives from the POSITION accessor', () => {
    const doc = { meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
    const result = checkGlb(triangle(doc));
    expect(result.ok && result.value.triangles).toBe(1);
  });

  it.each([
    [
      'indices that are floats',
      { meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 0 }] }] },
      'unsigned scalars',
    ],
    [
      'a primitive with a missing attribute accessor',
      { meshes: [{ primitives: [{ attributes: { POSITION: 9 } }] }] },
      'missing accessor',
    ],
    ['a node with a missing mesh', { nodes: [{ mesh: 4 }] }, 'missing mesh'],
    ['a node with a missing child', { nodes: [{ mesh: 0, children: [3] }] }, 'missing child'],
    [
      'a node with two parents',
      { nodes: [{ children: [2] }, { children: [2] }, { mesh: 0 }] },
      'more than one parent',
    ],
    [
      'a node cycle',
      { nodes: [{ children: [1] }, { children: [0], mesh: 0 }] },
      'contain themselves',
    ],
    ['a node that is its own child', { nodes: [{ children: [0] }] }, 'contain themselves'],
  ])('rejects %s', (_name, patch, expected) => {
    expect(problemOf(triangle(patch))).toContain(expected);
  });

  it('accepts a nested node tree', () => {
    const nodes = [{ children: [1, 2] }, { mesh: 0, children: [3] }, {}, { mesh: 0 }];
    const result = checkGlb(triangle({ nodes }));
    expect(result.ok && result.value.triangles).toBe(2);
  });
});
