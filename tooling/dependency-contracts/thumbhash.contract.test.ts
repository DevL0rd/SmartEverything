import { describe, expect, it } from 'vitest';
import { rgbaToThumbHash, thumbHashToAverageRGBA, thumbHashToRGBA } from 'thumbhash';

function solid(width: number, height: number, rgba: readonly number[]): Uint8Array {
  return Uint8Array.from({ length: width * height * 4 }, (_, index) => rgba[index % 4] ?? 0);
}

describe('thumbhash contract', () => {
  it('encodes an image of up to 100 pixels a side into a short hash', () => {
    const hash = rgbaToThumbHash(80, 60, solid(80, 60, [200, 40, 40, 255]));

    expect(hash.length).toBeGreaterThan(0);
    expect(hash.length).toBeLessThan(40);
  });

  it('keeps the average colour of a solid image', () => {
    const average = thumbHashToAverageRGBA(
      rgbaToThumbHash(32, 32, solid(32, 32, [200, 40, 40, 255])),
    );

    expect(average.r * 255).toBeCloseTo(200, -1);
    expect(average.g * 255).toBeCloseTo(40, -1);
    expect(average.b * 255).toBeCloseTo(40, -1);
    expect(average.a).toBe(1);
  });

  it('decodes to a placeholder that keeps the aspect ratio', () => {
    const decoded = thumbHashToRGBA(rgbaToThumbHash(80, 40, solid(80, 40, [10, 120, 200, 255])));

    expect(decoded.w / decoded.h).toBeCloseTo(2, 0);
    expect(decoded.rgba.length).toBe(decoded.w * decoded.h * 4);
  });
});
