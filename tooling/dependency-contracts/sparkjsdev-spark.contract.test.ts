import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Color, Quaternion, Vector3 } from 'three';
import * as spark from '@sparkjsdev/spark';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const SPARK_MANIFEST = z.looseObject({
  license: z.string(),
  peerDependencies: z.object({ three: z.string() }),
});

const GZIP_MAGIC = [0x1f, 0x8b];

const SIDE = 12;

function minorOf(version: string): number {
  const [major, minor] = version.replace(/^>=/u, '').split('.').map(Number);
  return (major ?? 0) * 10_000 + (minor ?? 0);
}

function sparkManifest(): z.infer<typeof SPARK_MANIFEST> {
  const file = repositoryFile('node_modules/@sparkjsdev/spark/package.json');
  return SPARK_MANIFEST.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function syntheticSplats(): spark.PackedSplats {
  const splats = new spark.PackedSplats({ maxSplats: SIDE * SIDE * 2 });
  for (const height of [0, 2.8]) {
    for (let index = 0; index < SIDE * SIDE; index += 1) {
      splats.pushSplat(
        new Vector3((index % SIDE) * 0.1, height, Math.floor(index / SIDE) * 0.1),
        new Vector3(0.05, 0.02, 0.05),
        new Quaternion(),
        0.9,
        new Color(height === 0 ? 0xe0502f : 0x3366ee),
      );
    }
  }
  return splats;
}

describe('@sparkjsdev/spark contract', () => {
  it('is declared by the app at the installed 2.x version under the MIT licence', () => {
    expect(declaredVersion(APP_MANIFEST, '@sparkjsdev/spark')).toBe(
      installedVersion('@sparkjsdev/spark'),
    );
    expect(installedVersion('@sparkjsdev/spark')).toMatch(/^2\.\d+\.\d+$/u);
    expect(sparkManifest().license).toBe('MIT');
  });

  it('accepts the installed three release as its peer', () => {
    const floor = sparkManifest().peerDependencies.three;
    expect(floor).toMatch(/^>=\d+\.\d+\.\d+$/u);
    expect(minorOf(installedVersion('three'))).toBeGreaterThanOrEqual(minorOf(floor));
  });

  it('writes a synthetic scan as gzip framed SPZ that it recognises again', async () => {
    const { fileBytes } = await spark.writeSpz(syntheticSplats());

    expect([...fileBytes.subarray(0, 2)]).toEqual(GZIP_MAGIC);
    expect(spark.getSplatFileType(fileBytes)).toBe(spark.SplatFileType.SPZ);
  });

  it('transcodes SPZ in the main thread of Node', async () => {
    const { fileBytes } = await spark.writeSpz(syntheticSplats());

    const out = await spark.transcodeSpz({ inputs: [{ fileBytes }] });
    const bytes = z.instanceof(Uint8Array).parse(out.fileBytes);

    expect(spark.getSplatFileType(bytes)).toBe(spark.SplatFileType.SPZ);
    expect(out.clippedCount).toBe(0);
  });

  it('builds a level of detail tree only in a Web Worker, which Node does not have', async () => {
    const { fileBytes } = await spark.writeSpz(syntheticSplats());

    const withLod = new spark.PackedSplats({ fileBytes, lod: true });

    await expect(withLod.initialized).rejects.toThrow(/Worker is not defined/u);
  });

  it('reads the RAD level of detail format but ships no RAD writer', () => {
    expect(spark.SplatFileType.RAD).toBe('rad');
    expect(Object.keys(spark).filter((name) => /rad/iu.test(name) && /write/iu.test(name))).toEqual(
      [],
    );
  });

  it('offers plane edit volumes with a multiply blend to fade splats out', () => {
    const plane = new spark.SplatEditSdf({ type: spark.SplatEditSdfType.PLANE, opacity: 0 });
    const edit = new spark.SplatEdit({
      rgbaBlendMode: spark.SplatEditRgbaBlendMode.MULTIPLY,
      sdfs: [plane],
    });

    expect(edit.sdfs).toEqual([plane]);
    expect(plane.opacity).toBe(0);
    expect(edit.rgbaBlendMode).toBe('multiply');
  });
});
