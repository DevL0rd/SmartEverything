export const RGB_CHANNELS = 3;

export interface RgbImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function sampleBilinear(image: RgbImage, x: number, y: number, channel: number): number {
  const { width, height, data } = image;
  const px = Math.min(Math.max(x, 0), width - 1);
  const py = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = px - x0;
  const fy = py - y0;
  const at = (column: number, row: number): number =>
    data[(row * width + column) * RGB_CHANNELS + channel] ?? 0;
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export function grayOf(image: RgbImage): Float32Array {
  const gray = new Float32Array(image.width * image.height);
  for (let index = 0; index < gray.length; index += 1) {
    const base = index * RGB_CHANNELS;
    gray[index] =
      0.299 * (image.data[base] ?? 0) +
      0.587 * (image.data[base + 1] ?? 0) +
      0.114 * (image.data[base + 2] ?? 0);
  }
  return gray;
}
