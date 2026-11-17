import type { PhotoBox, PhotoPoint } from '@smarteverything/domain';
import type { InferRequest, Tensor } from 'openvino-node';
import { FACE_EMBEDDING_SIZE, type FaceModelBytes } from '../models';
import { compileFaceModels, type FaceDevice, InferPool, tensorOf } from '../runtime';
import { ALIGNED_SIZE, alignFace } from './align';
import { RGB_CHANNELS, type RgbImage } from './image';
import { faceQuality } from './quality';
import {
  decodeYunet,
  letterboxOf,
  YUNET_INPUT,
  YUNET_OUTPUTS,
  yunetInput,
  type YunetOutputs,
} from './yunet';

export interface DetectedFace {
  readonly box: PhotoBox;
  readonly landmarks: readonly [PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint];
  readonly score: number;
  readonly quality: number;
  readonly embedding: Float32Array<ArrayBuffer>;
}

export class FaceModelShapeError extends Error {
  override readonly name = 'FaceModelShapeError';
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function float32Of(tensor: Tensor, what: string): Float32Array {
  const { data } = tensor;
  if (!(data instanceof Float32Array)) throw new FaceModelShapeError(`${what} is not float32.`);
  return data;
}

function outputsOf(request: InferRequest): YunetOutputs {
  const read = (names: readonly string[]): Float32Array[] =>
    names.map((name) => float32Of(request.getTensor(name), `The detector output ${name}`));
  return {
    cls: read(YUNET_OUTPUTS.cls),
    obj: read(YUNET_OUTPUTS.obj),
    bbox: read(YUNET_OUTPUTS.bbox),
    kps: read(YUNET_OUTPUTS.kps),
  };
}

function recognizerInput(aligned: RgbImage): Float32Array {
  const plane = ALIGNED_SIZE * ALIGNED_SIZE;
  const tensor = new Float32Array(RGB_CHANNELS * plane);
  for (let pixel = 0; pixel < plane; pixel += 1)
    for (let channel = 0; channel < RGB_CHANNELS; channel += 1)
      tensor[channel * plane + pixel] = aligned.data[pixel * RGB_CHANNELS + channel] ?? 0;
  return tensor;
}

export function normalised(vector: Float32Array): Float32Array<ArrayBuffer> {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  return norm === 0 ? new Float32Array(vector) : vector.map((value) => value / norm);
}

export class FaceEngine {
  private constructor(
    readonly device: FaceDevice,
    private readonly detector: InferPool,
    private readonly recognizer: InferPool,
  ) {}

  static async load(models: FaceModelBytes, threads: number): Promise<FaceEngine> {
    const compiled = await compileFaceModels(models, threads);
    return new FaceEngine(
      compiled.device,
      new InferPool(compiled.detector, 'face detector'),
      new InferPool(compiled.recognizer, 'face recognizer'),
    );
  }

  get requests(): number {
    return this.detector.size;
  }

  async analyse(image: RgbImage): Promise<DetectedFace[]> {
    const box = letterboxOf(image);
    const input = tensorOf([1, 3, YUNET_INPUT, YUNET_INPUT], yunetInput(image, box));
    const outputs = await this.detector.run([input], outputsOf);
    const candidates = decodeYunet(outputs, box);
    return Promise.all(candidates.map((candidate) => this.describe(image, candidate)));
  }

  async embed(aligned: RgbImage): Promise<Float32Array<ArrayBuffer>> {
    const input = tensorOf([1, 3, ALIGNED_SIZE, ALIGNED_SIZE], recognizerInput(aligned));
    const data = await this.recognizer.run([input], (request) =>
      float32Of(request.getOutputTensor(), 'The recognizer output'),
    );
    if (data.length !== FACE_EMBEDDING_SIZE)
      throw new FaceModelShapeError(
        `The recognizer did not return ${String(FACE_EMBEDDING_SIZE)} float32 values.`,
      );
    return normalised(data);
  }

  private async describe(
    image: RgbImage,
    candidate: ReturnType<typeof decodeYunet>[number],
  ): Promise<DetectedFace> {
    const aligned = alignFace(image, candidate.landmarks);
    const embedding = await this.embed(aligned);
    const left = clamp01(candidate.x / image.width);
    const top = clamp01(candidate.y / image.height);
    const right = clamp01((candidate.x + candidate.w) / image.width);
    const bottom = clamp01((candidate.y + candidate.h) / image.height);
    const point = (index: number): PhotoPoint => {
      const mark = candidate.landmarks[index];
      return {
        x: clamp01((mark?.x ?? 0) / image.width),
        y: clamp01((mark?.y ?? 0) / image.height),
      };
    };
    return {
      box: { x: left, y: top, w: right - left, h: bottom - top },
      landmarks: [point(0), point(1), point(2), point(3), point(4)],
      score: candidate.score,
      quality: faceQuality({
        shortSide: Math.min(candidate.w, candidate.h),
        detectionScore: candidate.score,
        aligned,
      }),
      embedding,
    };
  }
}
