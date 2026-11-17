import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { FaceEngine } from '../../src/vision/faces/engine';
import type { RgbImage } from '../../src/vision/faces/image';
import { rgbOf } from '../../src/vision/faces/source';
import { readFaceModels, visionAssetDirectory } from '../../src/vision/models';

export type FaceFixture = 'obama1' | 'obama2' | 'biden1' | 'pair';

export function fixturePath(name: FaceFixture): string {
  return fileURLToPath(new URL(`./fixtures/${name}.jpg`, import.meta.url));
}

export async function fixtureImage(name: FaceFixture): Promise<RgbImage> {
  return rgbOf(await readFile(fixturePath(name)));
}

export async function blankImage(width: number, height: number): Promise<RgbImage> {
  const data = await sharp({
    create: { width, height, channels: 3, background: { r: 90, g: 120, b: 150 } },
  })
    .raw()
    .toBuffer();
  return { width, height, data: new Uint8Array(data) };
}

export async function loadEngine(): Promise<FaceEngine> {
  return FaceEngine.load(await readFaceModels(visionAssetDirectory()), 1);
}
