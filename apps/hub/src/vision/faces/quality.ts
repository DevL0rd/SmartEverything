import { ALIGNED_SIZE } from './align';
import { grayOf, type RgbImage } from './image';

function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let squares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1)
    for (let x = 1; x < width - 1; x += 1) {
      const at = y * width + x;
      const value =
        4 * (gray[at] ?? 0) -
        (gray[at - 1] ?? 0) -
        (gray[at + 1] ?? 0) -
        (gray[at - width] ?? 0) -
        (gray[at + width] ?? 0);
      sum += value;
      squares += value * value;
      count += 1;
    }
  if (count === 0) return 0;
  const mean = sum / count;
  return squares / count - mean * mean;
}

function blurred(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1)
          total +=
            gray[
              Math.min(Math.max(y + dy, 0), height - 1) * width +
                Math.min(Math.max(x + dx, 0), width - 1)
            ] ?? 0;
      out[y * width + x] = total / 9;
    }
  return out;
}

export function sharpness(aligned: RgbImage): number {
  const gray = grayOf(aligned);
  const original = laplacianVariance(gray, aligned.width, aligned.height);
  if (original === 0) return 0;
  const softened = laplacianVariance(
    blurred(gray, aligned.width, aligned.height),
    aligned.width,
    aligned.height,
  );
  return Math.min(Math.max(1 - softened / original, 0), 1);
}

export function faceQuality(input: {
  readonly shortSide: number;
  readonly detectionScore: number;
  readonly aligned: RgbImage;
}): number {
  const size = Math.min(input.shortSide / ALIGNED_SIZE, 1);
  return size * input.detectionScore * sharpness(input.aligned);
}
