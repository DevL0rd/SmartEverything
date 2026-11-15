import { describe, expect, it } from 'vitest';
import {
  ALIGNED_SIZE,
  ALIGNMENT_TEMPLATE,
  alignFace,
  applySimilarity,
  estimateSimilarity,
  invertSimilarity,
} from '../../src/vision/faces/align';
import { grayOf, sampleBilinear, type RgbImage } from '../../src/vision/faces/image';
import { faceQuality, sharpness } from '../../src/vision/faces/quality';
import {
  decodeYunet,
  letterboxOf,
  suppress,
  YUNET_INPUT,
  YUNET_STRIDES,
  yunetInput,
  type FaceCandidate,
} from '../../src/vision/faces/yunet';

function solid(width: number, height: number, rgb: readonly [number, number, number]): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) data.set(rgb, index * 3);
  return { width, height, data };
}

function stripes(size: number, period: number): RgbImage {
  const data = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      data.fill(
        Math.floor(x / period) % 2 === 0 ? 0 : 255,
        (y * size + x) * 3,
        (y * size + x) * 3 + 3,
      );
  return { width: size, height: size, data };
}

describe('bilinear sampling and gray conversion', () => {
  it('reads exact pixels and blends between them', () => {
    const image: RgbImage = { width: 2, height: 1, data: Uint8Array.from([0, 0, 0, 100, 200, 50]) };
    expect(sampleBilinear(image, 1, 0, 1)).toBe(200);
    expect(sampleBilinear(image, 0.5, 0, 0)).toBe(50);
    expect(sampleBilinear(image, -5, 0, 2)).toBe(0);
    expect(sampleBilinear(image, 9, 0, 2)).toBe(50);
  });

  it('weights green most when converting to gray', () => {
    const [red, green, blue] = [
      grayOf(solid(1, 1, [255, 0, 0]))[0],
      grayOf(solid(1, 1, [0, 255, 0]))[0],
      grayOf(solid(1, 1, [0, 0, 255]))[0],
    ];
    expect(green).toBeGreaterThan(red ?? 0);
    expect(red).toBeGreaterThan(blue ?? 0);
  });
});

describe('similarity alignment', () => {
  it('maps a template onto itself with the identity', () => {
    const transform = estimateSimilarity(ALIGNMENT_TEMPLATE, ALIGNMENT_TEMPLATE);
    expect(transform.a).toBeCloseTo(1, 9);
    expect(transform.b).toBeCloseTo(0, 9);
    expect(transform.tx).toBeCloseTo(0, 6);
    expect(transform.ty).toBeCloseTo(0, 6);
  });

  it('recovers a scale, rotation and shift and inverts it', () => {
    const moved = ALIGNMENT_TEMPLATE.map((point) => ({
      x: 2 * (point.x * Math.cos(0.3) - point.y * Math.sin(0.3)) + 40,
      y: 2 * (point.x * Math.sin(0.3) + point.y * Math.cos(0.3)) - 10,
    }));
    const forward = estimateSimilarity(moved, ALIGNMENT_TEMPLATE);
    const back = invertSimilarity(forward);
    moved.forEach((point, index) => {
      const target = ALIGNMENT_TEMPLATE[index];
      const mapped = applySimilarity(forward, point);
      expect(mapped.x).toBeCloseTo(target?.x ?? NaN, 5);
      expect(mapped.y).toBeCloseTo(target?.y ?? NaN, 5);
      const returned = applySimilarity(back, mapped);
      expect(returned.x).toBeCloseTo(point.x, 5);
      expect(returned.y).toBeCloseTo(point.y, 5);
    });
  });

  it('warps a face to 112 by 112 pixels and leaves outside areas black', () => {
    const image = solid(200, 200, [10, 20, 30]);
    const centred = ALIGNMENT_TEMPLATE.map((point) => ({ x: point.x + 40, y: point.y + 40 }));
    const aligned = alignFace(image, centred);
    expect([aligned.width, aligned.height]).toStrictEqual([ALIGNED_SIZE, ALIGNED_SIZE]);
    expect([...aligned.data.subarray(0, 3)]).toStrictEqual([10, 20, 30]);
    const off = alignFace(
      image,
      ALIGNMENT_TEMPLATE.map((point) => ({ x: point.x - 500, y: point.y })),
    );
    expect([...off.data.subarray(0, 3)]).toStrictEqual([0, 0, 0]);
  });
});

describe('face quality', () => {
  it('rates fine detail sharper than a flat patch', () => {
    expect(sharpness(stripes(ALIGNED_SIZE, 1))).toBeGreaterThan(0.5);
    expect(sharpness(solid(ALIGNED_SIZE, ALIGNED_SIZE, [128, 128, 128]))).toBe(0);
  });

  it('scales with face size and detection score and stays within 0 to 1', () => {
    const aligned = stripes(ALIGNED_SIZE, 1);
    const big = faceQuality({ shortSide: 224, detectionScore: 0.95, aligned });
    const small = faceQuality({ shortSide: 28, detectionScore: 0.95, aligned });
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(1);
    expect(small).toBeCloseTo(big / 4, 6);
  });
});

const ORIGIN = { x: 0, y: 0 };

function empty(): {
  cls: Float32Array[];
  obj: Float32Array[];
  bbox: Float32Array[];
  kps: Float32Array[];
} {
  const cells = YUNET_STRIDES.map((stride) => (YUNET_INPUT / stride) ** 2);
  return {
    cls: cells.map((count) => new Float32Array(count)),
    obj: cells.map((count) => new Float32Array(count)),
    bbox: cells.map((count) => new Float32Array(count * 4)),
    kps: cells.map((count) => new Float32Array(count * 10)),
  };
}

describe('detector decoding', () => {
  it('letterboxes by the long side and fills the input in BGR order', () => {
    const image = solid(320, 160, [10, 20, 30]);
    const box = letterboxOf(image);
    expect(box.scale).toBe(2);
    const tensor = yunetInput(image, box);
    const plane = YUNET_INPUT * YUNET_INPUT;
    expect([tensor[0], tensor[plane], tensor[2 * plane]]).toStrictEqual([30, 20, 10]);
    expect(tensor[319 * YUNET_INPUT]).toBe(30);
    expect(tensor[320 * YUNET_INPUT]).toBe(0);
  });

  it('decodes a confident cell into a box and landmarks in picture pixels', () => {
    const outputs = empty();
    const index = 5 * 80 + 7;
    outputs.cls[0]![index] = 0.98;
    outputs.obj[0]![index] = 0.98;
    outputs.bbox[0]!.set([0.5, 0.5, Math.log(4), Math.log(5)], index * 4);
    outputs.kps[0]!.set([0, 0, 1, 0, 0, 1, 1, 1, 0.5, 0.5], index * 10);
    const [face] = decodeYunet(outputs, { scale: 2, width: 320, height: 320 });
    expect(face?.score).toBeCloseTo(0.98, 6);
    expect(face?.x).toBeCloseTo((7.5 * 8 - 16) / 2, 6);
    expect(face?.y).toBeCloseTo((5.5 * 8 - 20) / 2, 6);
    expect(face?.w).toBeCloseTo(16, 4);
    expect(face?.h).toBeCloseTo(20, 4);
    expect(face?.landmarks[0]).toStrictEqual({ x: 28, y: 20 });
    expect(face?.landmarks[3]).toStrictEqual({ x: 32, y: 24 });
  });

  it('drops cells under the detector threshold', () => {
    const outputs = empty();
    outputs.cls[1]![10] = 0.8;
    outputs.obj[1]![10] = 0.8;
    expect(decodeYunet(outputs, { scale: 1, width: 640, height: 640 })).toStrictEqual([]);
  });

  it('keeps the best of overlapping boxes and every separate one', () => {
    const base = (x: number, score: number): FaceCandidate => ({
      score,
      x,
      y: 0,
      w: 10,
      h: 10,
      landmarks: [ORIGIN, ORIGIN, ORIGIN, ORIGIN, ORIGIN],
    });
    const kept = suppress([base(0, 0.91), base(1, 0.99), base(100, 0.95)]);
    expect(kept.map((face) => face.score)).toStrictEqual([0.99, 0.95]);
  });
});
