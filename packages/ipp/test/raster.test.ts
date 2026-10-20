import { describe, expect, it } from 'vitest';
import { IppEncodeError } from '../src/errors';
import { multipartBoundary, splitMultipart } from '../src/multipart';
import { backTransform, pwgRaster, type RasterPage, SHEET_BACKS } from '../src/pwg-raster';

function page(overrides: Partial<RasterPage> = {}): RasterPage {
  return {
    width: 4,
    height: 2,
    dpi: 300,
    space: 'sgray',
    pixels: Uint8Array.of(0, 0, 0, 0, 255, 255, 255, 255),
    pageSizeName: 'iso_a4_210x297mm',
    quality: 4,
    copies: 1,
    duplex: false,
    tumble: false,
    transform: { crossFeed: 1, feed: 1 },
    ...overrides,
  };
}

function field(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

describe('PWG Raster writer', () => {
  it('starts with the RaS2 sync word and a 1796 byte header that carries the geometry', () => {
    const bytes = pwgRaster([page()]);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RaS2');
    const header = bytes.subarray(4, 4 + 1796);
    expect(new TextDecoder().decode(header.subarray(0, 9))).toBe('PwgRaster');
    expect(new TextDecoder().decode(header.subarray(1732, 1732 + 16))).toBe('iso_a4_210x297mm');
    expect([372, 376, 384, 388, 392, 396, 400, 420].map((offset) => field(header, offset))).toEqual(
      [4, 2, 8, 8, 4, 0, 18, 1],
    );
    expect([276, 280, 352, 356, 340, 484].map((offset) => field(header, offset))).toEqual([
      300, 300, 1, 0, 1, 4,
    ]);
    expect([472, 476].map((offset) => field(header, offset))).toEqual([4, 2]);
  });

  it('writes the transforms applied to the page as signed numbers', () => {
    const header = pwgRaster([page({ transform: { crossFeed: -1, feed: 1 } })]).subarray(
      4,
      4 + 1796,
    );
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    expect([view.getInt32(456), view.getInt32(460)]).toEqual([-1, 1]);
    const plain = pwgRaster([page()]).subarray(4, 4 + 1796);
    const flat = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
    expect([flat.getInt32(456), flat.getInt32(460)]).toEqual([1, 1]);
  });

  it('packs rows as repeat counts and pixel runs', () => {
    const bytes = pwgRaster([page()]);
    expect(Array.from(bytes.subarray(4 + 1796))).toEqual([0, 3, 0, 0, 3, 255]);
  });

  it('repeats identical rows with one count', () => {
    const body = pwgRaster([page({ pixels: new Uint8Array(8).fill(9) })]).subarray(4 + 1796);
    expect(Array.from(body)).toEqual([1, 3, 9]);
  });

  it('splits identical rows beyond 256 and long runs beyond 128', () => {
    const wide = pwgRaster([
      page({ width: 300, height: 300, pixels: new Uint8Array(90_000).fill(7) }),
    ]).subarray(4 + 1796);
    expect(Array.from(wide)).toEqual([255, 127, 7, 127, 7, 43, 7, 43, 127, 7, 127, 7, 43, 7]);
  });

  it('writes literals for non-repeating pixels and ends on a lone pixel', () => {
    const body = pwgRaster([
      page({ width: 5, height: 1, pixels: Uint8Array.of(1, 2, 3, 3, 9) }),
    ]).subarray(4 + 1796);
    expect(Array.from(body)).toEqual([0, 255, 1, 2, 1, 3, 0, 9]);
  });

  it('grows its buffer for pages that do not compress', () => {
    const pixels = Uint8Array.from(
      { length: 90_000 },
      (_, index) => (index * 7 + (index >> 3)) & 0xff,
    );
    const bytes = pwgRaster([page({ width: 300, height: 300, pixels })]);
    expect(bytes.length).toBeGreaterThan(65_536);
  });

  it('writes sRGB pages with three colours and duplex flags', () => {
    const rgb = pwgRaster([
      page({
        space: 'srgb',
        width: 2,
        height: 1,
        pixels: Uint8Array.of(1, 2, 3, 1, 2, 3),
        duplex: true,
        tumble: true,
      }),
    ]);
    const header = rgb.subarray(4, 4 + 1796);
    expect([
      field(header, 272),
      field(header, 368),
      field(header, 400),
      field(header, 420),
      field(header, 388),
      field(header, 392),
    ]).toEqual([1, 1, 19, 3, 24, 6]);
    expect(Array.from(rgb.subarray(4 + 1796))).toEqual([0, 1, 1, 2, 3]);
  });

  it('writes several pages in order', () => {
    const bytes = pwgRaster([page(), page()]);
    expect(new TextDecoder().decode(bytes.subarray(4 + 1796 + 6, 4 + 1796 + 6 + 9))).toBe(
      'PwgRaster',
    );
  });

  it('refuses pixel data of the wrong size and names that are too long', () => {
    expect(() => pwgRaster([page({ pixels: new Uint8Array(3) })])).toThrow(IppEncodeError);
    expect(() => pwgRaster([page({ pageSizeName: 'x'.repeat(64) })])).toThrow(/63 characters/u);
  });
});

describe('back side transforms', () => {
  it.each([
    ['normal', false, 1, 1],
    ['normal', true, 1, 1],
    ['manual-tumble', false, 1, 1],
    ['manual-tumble', true, -1, -1],
    ['rotated', false, -1, -1],
    ['rotated', true, 1, 1],
    ['flipped', false, -1, 1],
    ['flipped', true, 1, -1],
  ] as const)('turns a %s back side (short edge %s) by %i, %i', (back, tumble, cross, feed) => {
    expect(backTransform(back, tumble)).toEqual({ crossFeed: cross, feed });
  });

  it('knows every sheet back keyword', () => {
    expect(SHEET_BACKS).toEqual(['normal', 'flipped', 'rotated', 'manual-tumble']);
  });
});

describe('multipart replies', () => {
  const crlf = '\r\n';

  it('finds the boundary in a content type', () => {
    expect(multipartBoundary('multipart/related; boundary="abc123"; type=application/ipp')).toBe(
      'abc123',
    );
    expect(multipartBoundary('multipart/related; boundary=xyz')).toBe('xyz');
    expect(multipartBoundary('application/ipp')).toBeNull();
  });

  it('splits parts and keeps binary bodies intact', () => {
    const first = Uint8Array.of(1, 2, 13, 10, 3);
    const body = Buffer.concat([
      Buffer.from(`--B${crlf}Content-Type: application/ipp${crlf}${crlf}`),
      first,
      Buffer.from(`${crlf}--B${crlf}Content-Type: application/ipp${crlf}${crlf}`),
      Uint8Array.of(9),
      Buffer.from(`${crlf}--B--${crlf}`),
    ]);
    const parts = splitMultipart(body, 'B');
    expect(parts.map((part) => Array.from(part))).toEqual([[1, 2, 13, 10, 3], [9]]);
  });

  it('keeps an unfinished last part and ignores a part without headers', () => {
    const open = Buffer.concat([Buffer.from(`--B${crlf}X: y${crlf}${crlf}`), Uint8Array.of(5, 6)]);
    expect(splitMultipart(open, 'B').map((part) => Array.from(part))).toEqual([[5, 6]]);
    expect(splitMultipart(Buffer.from(`--B${crlf}X: y`), 'B')).toEqual([]);
    expect(splitMultipart(Buffer.from('nothing'), 'B')).toEqual([]);
  });
});
