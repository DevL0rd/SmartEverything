import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FACE_DETECTOR_FILE,
  FACE_RECOGNIZER_FILE,
  readFaceModels,
  visionAssetDirectory,
  VisionModelsMissingError,
} from '../../src/vision/models';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vision-models-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('face model files', () => {
  it('reads both models from a folder', async () => {
    await writeFile(join(directory, FACE_DETECTOR_FILE), Uint8Array.of(1, 2));
    await writeFile(join(directory, FACE_RECOGNIZER_FILE), Uint8Array.of(3));
    const models = await readFaceModels(directory);
    expect([...models.detector]).toStrictEqual([1, 2]);
    expect([...models.recognizer]).toStrictEqual([3]);
  });

  it('names the folder when a model is missing', async () => {
    await writeFile(join(directory, FACE_DETECTOR_FILE), Uint8Array.of(1));
    await expect(readFaceModels(directory)).rejects.toThrow(VisionModelsMissingError);
    await expect(readFaceModels(directory)).rejects.toThrow(directory);
  });

  it('looks for the models in the checkout assets folder while developing', () => {
    expect(visionAssetDirectory()).toMatch(/apps\/hub\/assets\/vision\/?$/u);
  });
});
