import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkGlb } from '../../src/models/glb-check';
import {
  GLB_LOD_TRIANGLE_TARGETS,
  decimateGlb,
  type GlbLod,
  type GlbLodTargets,
} from '../../src/models/glb-lod';
import {
  IMAGE_BYTES,
  container,
  gridGlb,
  parseGlb,
  tetrahedronGlb,
  type GridOptions,
} from './glb-lod-fixtures';

const OUTPUT = z.looseObject({
  accessors: z.array(
    z.looseObject({
      bufferView: z.number(),
      componentType: z.number(),
      count: z.number(),
      type: z.string(),
      normalized: z.boolean().optional(),
      min: z.array(z.number()).optional(),
      max: z.array(z.number()).optional(),
    }),
  ),
  bufferViews: z.array(
    z.looseObject({
      byteOffset: z.number(),
      byteLength: z.number(),
      byteStride: z.number().optional(),
      target: z.number().optional(),
    }),
  ),
  meshes: z.array(
    z.looseObject({
      primitives: z.array(
        z.looseObject({ attributes: z.record(z.string(), z.number()), indices: z.number() }),
      ),
    }),
  ),
  nodes: z.array(z.looseObject({ mesh: z.number().optional(), name: z.string().optional() })),
  materials: z.array(z.looseObject({ name: z.string() })),
  images: z.array(z.looseObject({ bufferView: z.number() })).optional(),
  animations: z
    .array(
      z.looseObject({
        samplers: z.array(z.looseObject({ input: z.number(), output: z.number() })),
      }),
    )
    .optional(),
});

const SMALL_TARGETS: GlbLodTargets = [100, 400, 1600];

async function levelsOf(
  options: GridOptions,
  targets: GlbLodTargets = SMALL_TARGETS,
): Promise<readonly GlbLod[]> {
  const result = await decimateGlb(gridGlb(options), targets);
  if (!result.ok) throw new Error(result.problem);
  return result.levels;
}

type Output = z.infer<typeof OUTPUT>;
type OutputPrimitive = Output['meshes'][number]['primitives'][number];

type Reader = readonly [size: number, read: (view: DataView, at: number) => number];

const READERS = new Map<number, Reader>([
  [5126, [4, (view: DataView, at: number): number => view.getFloat32(at, true)]],
  [5125, [4, (view: DataView, at: number): number => view.getUint32(at, true)]],
  [5122, [2, (view: DataView, at: number): number => view.getInt16(at, true)]],
  [5123, [2, (view: DataView, at: number): number => view.getUint16(at, true)]],
]);

function outputOf(level: GlbLod): { doc: Output; bin: Uint8Array } {
  const { json, bin } = parseGlb(level.bytes);
  return { doc: OUTPUT.parse(json), bin };
}

function valuesOf(level: GlbLod, accessorAt: number): number[] {
  const { doc, bin } = outputOf(level);
  const accessor = doc.accessors[accessorAt];
  const view = doc.bufferViews[accessor?.bufferView ?? -1];
  const reader = READERS.get(accessor?.componentType ?? 0);
  if (accessor === undefined || view === undefined || reader === undefined) {
    throw new Error('missing accessor');
  }
  const [size, read] = reader;
  const width = accessor.type === 'SCALAR' ? 1 : Number(accessor.type.slice(-1));
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const stride = view.byteStride ?? width * size;
  return Array.from({ length: accessor.count * width }, (_, at) =>
    read(data, view.byteOffset + Math.floor(at / width) * stride + (at % width) * size),
  );
}

function primitiveOf(level: GlbLod): OutputPrimitive {
  const primitive = outputOf(level).doc.meshes[0]?.primitives[0];
  if (primitive === undefined) throw new Error('no primitive');
  return primitive;
}

describe('decimateGlb', () => {
  it('reduces a smooth grid toward each target and keeps the levels ordered', async () => {
    const levels = await levelsOf({ side: 40 });

    expect(levels.map((level) => level.level)).toStrictEqual([0, 1, 2]);
    levels.forEach((level, at) => {
      const target = SMALL_TARGETS[at] ?? 0;
      expect(level.triangles).toBeLessThanOrEqual(target);
      expect(level.triangles).toBeGreaterThan(target * 0.5);
    });
    expect(levels[0]?.triangles).toBeLessThan(levels[1]?.triangles ?? 0);
    expect(levels[1]?.triangles).toBeLessThan(levels[2]?.triangles ?? 0);
  });

  it('writes files that pass the upload checker and report their own triangle count', async () => {
    for (const level of await levelsOf({ side: 40 })) {
      const checked = checkGlb(level.bytes);

      expect(checked.ok).toBe(true);
      expect(checked.ok && checked.value.triangles).toBe(level.triangles);
    }
  });

  it('drops the vertices no triangle uses and keeps every attribute the same length', async () => {
    const [lod0] = await levelsOf({ side: 40 });
    if (lod0 === undefined) throw new Error('no level');
    const { doc } = outputOf(lod0);
    const primitive = primitiveOf(lod0);
    const counts = Object.values(primitive.attributes).map((at) => doc.accessors[at]?.count);
    const indices = valuesOf(lod0, primitive.indices);

    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeLessThan(41 * 41);
    expect(Math.max(...indices)).toBe((counts[0] ?? 0) - 1);
    expect(new Set(indices).size).toBe(counts[0]);
  });

  it('writes exact position bounds for the vertices that are left', async () => {
    const [lod0] = await levelsOf({ side: 40 });
    if (lod0 === undefined) throw new Error('no level');
    const position = outputOf(lod0).doc.accessors[primitiveOf(lod0).attributes['POSITION'] ?? -1];
    const values = valuesOf(lod0, primitiveOf(lod0).attributes['POSITION'] ?? -1);
    const axis = (offset: number): number[] => values.filter((_, at) => at % 3 === offset);

    expect(position?.min).toStrictEqual([0, 1, 2].map((offset) => Math.min(...axis(offset))));
    expect(position?.max).toStrictEqual([0, 1, 2].map((offset) => Math.max(...axis(offset))));
  });

  it('returns the original file for a level whose target covers every triangle', async () => {
    const input = gridGlb({ side: 20 });
    const result = await decimateGlb(input);

    expect(GLB_LOD_TRIANGLE_TARGETS).toStrictEqual([1500, 6000, 25000]);
    expect(result.ok && result.levels.map((level) => level.bytes)).toStrictEqual([
      input,
      input,
      input,
    ]);
    expect(result.ok && result.levels.map((level) => level.triangles)).toStrictEqual([
      800, 800, 800,
    ]);
  });

  it('hashes the exact bytes of every level with sha-256', async () => {
    for (const level of await levelsOf({ side: 40 })) {
      expect(level.sha256).toBe(createHash('sha256').update(level.bytes).digest('hex'));
    }
  });

  it('keeps the embedded image bytes, the nodes and the materials', async () => {
    for (const level of await levelsOf({ side: 40, image: true })) {
      const { doc, bin } = outputOf(level);
      const view = doc.bufferViews[doc.images?.[0]?.bufferView ?? -1];

      expect(
        view && bin.subarray(view.byteOffset, view.byteOffset + view.byteLength),
      ).toStrictEqual(IMAGE_BYTES);
      expect(doc.nodes).toStrictEqual([{ mesh: 0, name: 'part' }]);
      expect(doc.materials.map((material) => material.name)).toStrictEqual(['body']);
    }
  });

  it('copies animation accessors with their values', async () => {
    const [lod0] = await levelsOf({ side: 40, animation: true });
    if (lod0 === undefined) throw new Error('no level');
    const sampler = outputOf(lod0).doc.animations?.[0]?.samplers[0];

    expect(valuesOf(lod0, sampler?.input ?? -1)).toStrictEqual([0, 1, 2]);
    expect(valuesOf(lod0, sampler?.output ?? -1)).toStrictEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('counts every node that instances a mesh toward the target', async () => {
    const [single] = await levelsOf({ side: 40, instances: 1 });
    const [double] = await levelsOf({ side: 40, instances: 2 });

    expect(single?.triangles).toBeLessThanOrEqual(100);
    expect(double?.triangles).toBeLessThanOrEqual(100);
    expect(double?.triangles).toBeGreaterThan(50);
  });

  it('keeps quantized positions quantized and pads three byte normals to four byte rows', async () => {
    const [lod0] = await levelsOf({ side: 40, quantized: true });
    if (lod0 === undefined) throw new Error('no level');
    const { doc } = outputOf(lod0);
    const attributes = primitiveOf(lod0).attributes;
    const position = doc.accessors[attributes['POSITION'] ?? -1];
    const normal = doc.accessors[attributes['NORMAL'] ?? -1];

    expect([position?.componentType, position?.normalized]).toStrictEqual([5122, true]);
    expect(doc.bufferViews[normal?.bufferView ?? -1]?.byteStride).toBe(4);
    expect(lod0.triangles).toBeLessThanOrEqual(100);
  });

  it('keeps a primitive whose triangles the simplifier would remove entirely', async () => {
    const result = await decimateGlb(tetrahedronGlb(), [1, 1, 1]);

    expect(result.ok && result.levels.map((level) => level.triangles)).toStrictEqual([4, 4, 4]);
  });

  it('reports the upload checker problem for a file it rejects', async () => {
    const result = await decimateGlb(new Uint8Array(40));

    expect(result).toStrictEqual({ ok: false, problem: 'GLB is not a GLB version 2 file' });
  });

  it('rejects an index that points past its vertices instead of reading outside the mesh', async () => {
    const result = await decimateGlb(gridGlb({ side: 40, badIndex: true }), SMALL_TARGETS);

    expect(result).toStrictEqual({ ok: false, problem: 'GLB has an index past its vertex count' });
  });

  it('rejects an attribute with a different vertex count than the positions', async () => {
    const result = await decimateGlb(gridGlb({ side: 40, shortNormals: true }), SMALL_TARGETS);

    expect(result).toStrictEqual({
      ok: false,
      problem: 'GLB has attribute NORMAL with another vertex count',
    });
  });

  it('passes a GLB with no mesh through unchanged', async () => {
    const input = container(
      { asset: { version: '2.0' }, scenes: [{}], scene: 0 },
      new Uint8Array(),
    );
    const result = await decimateGlb(input);

    expect(result.ok && result.levels.map((level) => level.triangles)).toStrictEqual([0, 0, 0]);
  });
});
