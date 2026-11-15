import { RGB_CHANNELS, sampleBilinear, type Point, type RgbImage } from './image';

export const ALIGNED_SIZE = 112;

export const ALIGNMENT_TEMPLATE: readonly [Point, Point, Point, Point, Point] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
];

export interface Similarity {
  readonly a: number;
  readonly b: number;
  readonly tx: number;
  readonly ty: number;
}

export function estimateSimilarity(from: readonly Point[], to: readonly Point[]): Similarity {
  const count = from.length;
  const mean = (points: readonly Point[]): Point => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count,
  });
  const fromMean = mean(from);
  const toMean = mean(to);
  let dot = 0;
  let cross = 0;
  let energy = 0;
  for (let index = 0; index < count; index += 1) {
    const source = from[index];
    const target = to[index];
    if (source === undefined || target === undefined) continue;
    const sx = source.x - fromMean.x;
    const sy = source.y - fromMean.y;
    const tx = target.x - toMean.x;
    const ty = target.y - toMean.y;
    dot += sx * tx + sy * ty;
    cross += sx * ty - sy * tx;
    energy += sx * sx + sy * sy;
  }
  const a = dot / energy;
  const b = cross / energy;
  return {
    a,
    b,
    tx: toMean.x - (a * fromMean.x - b * fromMean.y),
    ty: toMean.y - (b * fromMean.x + a * fromMean.y),
  };
}

export function applySimilarity(transform: Similarity, point: Point): Point {
  return {
    x: transform.a * point.x - transform.b * point.y + transform.tx,
    y: transform.b * point.x + transform.a * point.y + transform.ty,
  };
}

export function invertSimilarity(transform: Similarity): Similarity {
  const norm = transform.a * transform.a + transform.b * transform.b;
  const a = transform.a / norm;
  const b = -transform.b / norm;
  return {
    a,
    b,
    tx: -(a * transform.tx - b * transform.ty),
    ty: -(b * transform.tx + a * transform.ty),
  };
}

export function alignFace(image: RgbImage, landmarks: readonly Point[]): RgbImage {
  const forward = estimateSimilarity(landmarks, ALIGNMENT_TEMPLATE);
  const inverse = invertSimilarity(forward);
  const data = new Uint8Array(ALIGNED_SIZE * ALIGNED_SIZE * RGB_CHANNELS);
  for (let row = 0; row < ALIGNED_SIZE; row += 1)
    for (let column = 0; column < ALIGNED_SIZE; column += 1) {
      const source = applySimilarity(inverse, { x: column, y: row });
      const inside =
        source.x >= 0 &&
        source.y >= 0 &&
        source.x <= image.width - 1 &&
        source.y <= image.height - 1;
      for (let channel = 0; channel < RGB_CHANNELS; channel += 1)
        data[(row * ALIGNED_SIZE + column) * RGB_CHANNELS + channel] = inside
          ? Math.round(sampleBilinear(image, source.x, source.y, channel))
          : 0;
    }
  return { width: ALIGNED_SIZE, height: ALIGNED_SIZE, data };
}
