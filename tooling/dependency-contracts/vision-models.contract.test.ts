import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web/wasm';
import {
  ensureVisionModels,
  modelIsPresent,
  readVisionPin,
  sha256Of,
  stageVisionModels,
  VISION_ASSETS,
} from '../vision-models';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { repositoryFile } from './versions';

const hubRequire = createRequire(repositoryFile('apps/hub/package.json'));
const pin = readVisionPin();

function modelOf(file: string): (typeof pin.models)[number] {
  const found = pin.models.find((model) => model.file === file);
  if (found === undefined) throw new Error(`${file} is not pinned`);
  return found;
}

async function sessionOf(file: string): Promise<ort.InferenceSession> {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${dirname(hubRequire.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'))}/`;
  return ort.InferenceSession.create(new Uint8Array(readFileSync(join(VISION_ASSETS, file))), {
    logSeverityLevel: 3,
  });
}

beforeAll(async () => {
  await ensureVisionModels();
}, 600_000);

describe('vision models contract', () => {
  it('pins the two OpenCV Zoo face models by revision with their licences', () => {
    expect(pin.models.map((model) => model.file)).toStrictEqual([
      'face_detection_yunet_2023mar.onnx',
      'face_recognition_sface_2021dec.onnx',
    ]);
    for (const model of pin.models) {
      expect(model.url).toMatch(
        /^https:\/\/huggingface\.co\/opencv\/[^/]+\/resolve\/[0-9a-f]{40}\//u,
      );
      expect(model.url.endsWith(`/${model.file}`)).toBe(true);
    }
    expect(modelOf('face_detection_yunet_2023mar.onnx').license).toBe('MIT');
    expect(modelOf('face_recognition_sface_2021dec.onnx').license).toBe('Apache-2.0');
  });

  it('has each model on disk with the pinned size and SHA-256', () => {
    for (const model of pin.models) {
      expect(modelIsPresent(VISION_ASSETS, model)).toBe(true);
      const bytes = readFileSync(join(VISION_ASSETS, model.file));
      expect(bytes.length).toBe(model.bytes);
      expect(sha256Of(bytes)).toBe(model.sha256);
    }
  });

  it('keeps the YuNet detector on one 640 by 640 BGR input and twelve outputs', async () => {
    const session = await sessionOf('face_detection_yunet_2023mar.onnx');
    expect(session.inputNames).toStrictEqual(['input']);
    expect(session.inputMetadata[0]).toMatchObject({
      name: 'input',
      type: 'float32',
      shape: [1, 3, 640, 640],
    });
    expect(session.outputNames).toStrictEqual([
      ...['cls_8', 'cls_16', 'cls_32', 'obj_8', 'obj_16', 'obj_32'],
      ...['bbox_8', 'bbox_16', 'bbox_32', 'kps_8', 'kps_16', 'kps_32'],
    ]);
    const result = await session.run({
      input: new ort.Tensor('float32', new Float32Array(3 * 640 * 640), [1, 3, 640, 640]),
    });
    expect(result['cls_8']?.dims).toStrictEqual([1, 6400, 1]);
    expect(result['bbox_16']?.dims).toStrictEqual([1, 1600, 4]);
    expect(result['kps_32']?.dims).toStrictEqual([1, 400, 10]);
  });

  it('keeps the SFace recognizer on a 112 by 112 input and a 128 value output', async () => {
    const session = await sessionOf('face_recognition_sface_2021dec.onnx');
    expect(session.inputMetadata[0]).toMatchObject({ type: 'float32', shape: [1, 3, 112, 112] });
    const [name] = session.inputNames;
    const result = await session.run({
      [name ?? 'data']: new ort.Tensor(
        'float32',
        new Float32Array(3 * 112 * 112),
        [1, 3, 112, 112],
      ),
    });
    expect(Object.values(result)[0]?.dims).toStrictEqual([1, 128]);
  });

  it('copies verified models into a service build and refuses a changed one', () => {
    const service = mkdtempSync(join(tmpdir(), 'vision-stage-'));
    try {
      stageVisionModels(service);
      for (const model of pin.models)
        expect(sha256Of(readFileSync(join(service, pin.directory, model.file)))).toBe(model.sha256);
      const empty = mkdtempSync(join(tmpdir(), 'vision-empty-'));
      try {
        expect(existsSync(join(empty, pin.models[0]?.file ?? ''))).toBe(false);
        expect(() => {
          stageVisionModels(service, empty);
        }).toThrow('build:vision-models');
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    } finally {
      rmSync(service, { recursive: true, force: true });
    }
  });
});
