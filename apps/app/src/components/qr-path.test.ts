import { describe, expect, it } from 'vitest';
import { qrDrawingOf } from './qr-path';

function darkAt(path: string, x: number, y: number): boolean {
  return path.includes(`M${String(x)} ${String(y)}h1v1h-1z`);
}

describe('a QR code drawing', () => {
  const drawing = qrDrawingOf('{"url":"https://home.example.com","code":"ABCD-EFGH"}');

  it('is a square of modules with a two-module quiet zone around the symbol', () => {
    expect(drawing.size).toBeGreaterThanOrEqual(25);
    expect((drawing.size - 4 - 21) % 4).toBe(0);
    for (let index = 0; index < drawing.size; index += 1) {
      expect(darkAt(drawing.path, index, 0)).toBe(false);
      expect(darkAt(drawing.path, 0, index)).toBe(false);
      expect(darkAt(drawing.path, index, 1)).toBe(false);
    }
  });

  it('draws the three finder patterns in their corners', () => {
    const far = drawing.size - 9;
    for (const [x, y] of [
      [2, 2],
      [far, 2],
      [2, far],
    ] as const) {
      expect(darkAt(drawing.path, x, y)).toBe(true);
      expect(darkAt(drawing.path, x + 1, y + 1)).toBe(false);
      expect(darkAt(drawing.path, x + 3, y + 3)).toBe(true);
    }
  });

  it('changes with the text it encodes', () => {
    expect(qrDrawingOf('one').path).not.toBe(qrDrawingOf('two').path);
  });
});
