import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertCompletePng,
  generateIcons,
  icnsChunks,
  icoEntries,
  IconInvalidError,
  iconPaths,
  linuxIconFrom,
  LINUX_ICON_SIZE,
  pngChunks,
  pngSize,
  renderIcons,
  type RenderedIcons,
} from '../packaging/icons.js';

const SOURCE = path.resolve(import.meta.dirname, '..', '..', 'app', 'assets', 'icon.png');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(data: Buffer): boolean {
  return data.subarray(0, 8).equals(PNG_SIGNATURE);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

interface SyntheticPng {
  readonly width: number;
  readonly height: number;
  readonly colourType?: number;
  readonly interlace?: number;
  readonly imageData?: Buffer;
}

function syntheticPng(options: SyntheticPng): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(options.width, 0);
  header.writeUInt32BE(options.height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(options.colourType ?? 2, 9);
  header.writeUInt8(options.interlace ?? 0, 12);
  const imageData =
    options.imageData ?? deflateSync(Buffer.alloc(options.height * (options.width * 3 + 1)));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', imageData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function icns(chunks: readonly { type: string; data: Buffer }[]): Buffer {
  const bodies = chunks.map((chunk) => {
    const header = Buffer.alloc(8);
    header.write(chunk.type, 0, 'latin1');
    header.writeUInt32BE(chunk.data.length + 8, 4);
    return Buffer.concat([header, chunk.data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'latin1');
  const file = Buffer.concat([header, ...bodies]);
  file.writeUInt32BE(file.length, 4);
  return file;
}

let rendered: RenderedIcons;
let source: Buffer;

beforeAll(async () => {
  source = await readFile(SOURCE);
  rendered = renderIcons(source);
}, 120_000);

describe('icon generation', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it('reads the source PNG size', () => {
    expect(pngSize(source)).toEqual({ width: 1024, height: 1024 });
  });

  it('writes a Windows ICO whose every image decodes to its declared size', () => {
    const entries = icoEntries(rendered.ico);
    expect(entries.map((entry) => entry.width)).toEqual([256, 128, 96, 72, 64, 48, 32, 24, 16]);
    for (const entry of entries) {
      expect(entry.height).toBe(entry.width);
      if (entry.width >= 64) {
        expect(pngSize(entry.data)).toEqual({ width: entry.width, height: entry.width });
      } else {
        expect(isPng(entry.data)).toBe(false);
        expect(entry.data.readUInt32LE(0)).toBe(40);
        expect(entry.data.readInt32LE(4)).toBe(entry.width);
      }
    }
  });

  it('writes a macOS ICNS that holds every retina size up to 1024 as PNG', () => {
    const chunks = icnsChunks(rendered.icns);
    const pngSizes = Object.fromEntries(
      chunks
        .filter((chunk) => isPng(chunk.data))
        .map((chunk) => [chunk.type, pngSize(chunk.data).width]),
    );
    expect(pngSizes).toEqual({
      ic07: 128,
      ic08: 256,
      ic09: 512,
      ic10: 1024,
      ic11: 32,
      ic12: 64,
      ic13: 256,
      ic14: 512,
    });
    expect(chunks.map((chunk) => chunk.type)).toEqual(
      expect.arrayContaining(['is32', 's8mk', 'il32', 'l8mk']),
    );
  });

  it('takes the Linux icon from the 512 chunk', () => {
    expect(pngSize(rendered.linux)).toEqual({ width: LINUX_ICON_SIZE, height: LINUX_ICON_SIZE });
  });

  it('refuses a source smaller than 1024 or not square', () => {
    const small = icoEntries(rendered.ico).find((entry) => entry.width === 256);
    expect(small).toBeDefined();
    expect(() => renderIcons(small?.data ?? Buffer.alloc(0))).toThrow(
      /the source icon must be a square PNG of at least 1024x1024; received 256x256/u,
    );
    expect(() => renderIcons(syntheticPng({ width: 2048, height: 1024 }))).toThrow(
      /received 2048x1024/u,
    );
  });

  it('refuses a truncated or corrupted source before the encoder sees it', () => {
    expect(() => renderIcons(source.subarray(0, 64))).toThrow(IconInvalidError);
    const flipped = Buffer.from(source);
    flipped.writeUInt8(flipped.readUInt8(40) ^ 0xff, 40);
    expect(() => renderIcons(flipped)).toThrow(/must be checksum/u);
  });

  it('generateIcons writes the three files where iconPaths says', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'desktop-icons-'));
    const paths = await generateIcons(SOURCE, path.join(directory, 'nested'));
    expect(paths).toEqual(iconPaths(path.join(directory, 'nested')));
    expect(paths.icns).toBe(`${paths.base}.icns`);
    expect(paths.ico).toBe(`${paths.base}.ico`);
    expect(path.basename(paths.linux)).toBe('icon-512.png');
    expect(await readFile(paths.icns)).toEqual(rendered.icns);
    expect(await readFile(paths.ico)).toEqual(rendered.ico);
    expect(await readFile(paths.linux)).toEqual(rendered.linux);
  });
});

describe('icon containers', () => {
  it('pngChunks lists every chunk of a whole PNG', () => {
    expect(pngChunks(syntheticPng({ width: 4, height: 4 })).map((chunk) => chunk.type)).toEqual([
      'IHDR',
      'IDAT',
      'IEND',
    ]);
  });

  it('assertCompletePng accepts a whole PNG and names every way one is broken', () => {
    expect(() => {
      assertCompletePng(source);
    }).not.toThrow();
    const png = syntheticPng({ width: 4, height: 4 });
    expect(() => {
      assertCompletePng(png);
    }).not.toThrow();
    expect(() => {
      assertCompletePng(png.subarray(0, png.length - 4));
    }).toThrow(/PNG chunk IEND must be inside the/u);
    expect(() => {
      assertCompletePng(png.subarray(0, png.length - 12));
    }).toThrow(/PNG chunk header at \d+ must be inside the/u);
    expect(() => {
      assertCompletePng(Buffer.concat([png, Buffer.alloc(3)]));
    }).toThrow(
      new RegExp(
        `a PNG must be ending at its IEND chunk, byte ${String(png.length)}; received ${String(png.length + 3)} bytes`,
        'u',
      ),
    );
    const corrupted = Buffer.from(png);
    corrupted.writeUInt8(9, 16);
    expect(() => {
      assertCompletePng(corrupted);
    }).toThrow(/PNG chunk IHDR must be checksum \d+; received checksum \d+/u);
  });

  it('assertCompletePng refuses image data the encoder would misread', () => {
    expect(() => {
      assertCompletePng(
        syntheticPng({ width: 4, height: 4, imageData: Buffer.from('not deflate') }),
      );
    }).toThrow(/the PNG image data must be a zlib stream/u);
    expect(() => {
      assertCompletePng(
        syntheticPng({ width: 4, height: 4, imageData: deflateSync(Buffer.alloc(3)) }),
      );
    }).toThrow(/the PNG image data must be 52 bytes once inflated; received 3 bytes/u);
    expect(() => {
      assertCompletePng(syntheticPng({ width: 4, height: 4, interlace: 1 }));
    }).toThrow(/non-interlaced with a known colour type; received colour type 2, interlace 1/u);
    expect(() => {
      assertCompletePng(syntheticPng({ width: 4, height: 4, colourType: 5 }));
    }).toThrow(/received colour type 5, interlace 0/u);
  });

  it('icoEntries refuses a file that is not an icon directory', () => {
    expect(() => icoEntries(Buffer.alloc(4))).toThrow(/an ICO file must be an icon directory/u);
    const cursor = Buffer.from([0, 0, 2, 0, 0, 0]);
    expect(() => icoEntries(cursor)).toThrow(IconInvalidError);
    const reserved = Buffer.from([1, 0, 1, 0, 0, 0]);
    expect(() => icoEntries(reserved)).toThrow(IconInvalidError);
  });

  it('icoEntries refuses entries that point outside the file', () => {
    const truncated = Buffer.from([0, 0, 1, 0, 1, 0]);
    expect(() => icoEntries(truncated)).toThrow(
      /ICO directory entry 0 must be inside the 6-byte file/u,
    );
    const outside = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(16)]);
    outside.writeUInt8(16, 6);
    outside.writeUInt32LE(100, 14);
    outside.writeUInt32LE(22, 18);
    expect(() => icoEntries(outside)).toThrow(
      /ICO image 0 must be inside the 22-byte file; received 100 bytes at 22/u,
    );
    outside.writeUInt32LE(0, 14);
    expect(() => icoEntries(outside)).toThrow(/received 0 bytes at 22/u);
  });

  it('icoEntries reads a width of 0 as 256', () => {
    const file = Buffer.concat([
      Buffer.from([0, 0, 1, 0, 1, 0]),
      Buffer.alloc(16),
      Buffer.from([7]),
    ]);
    file.writeUInt32LE(1, 14);
    file.writeUInt32LE(22, 18);
    expect(icoEntries(file)).toEqual([{ width: 256, height: 256, data: Buffer.from([7]) }]);
  });

  it('icnsChunks refuses a wrong magic, length or chunk header', () => {
    expect(() => icnsChunks(Buffer.from('icn'))).toThrow(
      /an ICNS file must be a file starting with icns/u,
    );
    expect(() => icnsChunks(Buffer.from('ICNS\0\0\0\x08'))).toThrow(IconInvalidError);
    const wrongLength = icns([]);
    wrongLength.writeUInt32BE(9, 4);
    expect(() => icnsChunks(wrongLength)).toThrow(
      /8 bytes as its header declares; received a header declaring 9/u,
    );
    const shortChunk = icns([{ type: 'ic09', data: Buffer.alloc(0) }]);
    shortChunk.writeUInt32BE(4, 12);
    expect(() => icnsChunks(shortChunk)).toThrow(
      /ICNS chunk at 8 must be at least its 8-byte header; received 4/u,
    );
    const longChunk = icns([{ type: 'ic09', data: Buffer.alloc(2) }]);
    longChunk.writeUInt32BE(40, 12);
    expect(() => icnsChunks(longChunk)).toThrow(/ICNS chunk ic09 must be inside the 18-byte file/u);
    const brokenHeader = Buffer.concat([icns([]), Buffer.alloc(4)]);
    brokenHeader.writeUInt32BE(brokenHeader.length, 4);
    expect(() => icnsChunks(brokenHeader)).toThrow(
      /ICNS chunk at 8 must be inside the 12-byte file/u,
    );
  });

  it('icnsChunks walks every chunk in order', () => {
    expect(
      icnsChunks(
        icns([
          { type: 'is32', data: Buffer.from([1, 2]) },
          { type: 'ic09', data: Buffer.from([3]) },
        ]),
      ),
    ).toEqual([
      { type: 'is32', data: Buffer.from([1, 2]) },
      { type: 'ic09', data: Buffer.from([3]) },
    ]);
  });

  it('linuxIconFrom refuses an ICNS without a 512 PNG', () => {
    expect(() => linuxIconFrom(icns([]))).toThrow(/must be holding an ic09 chunk; received none/u);
    const wrongSize = icnsChunks(rendered.icns).find((chunk) => chunk.type === 'ic08');
    expect(() =>
      linuxIconFrom(icns([{ type: 'ic09', data: wrongSize?.data ?? Buffer.alloc(0) }])),
    ).toThrow(/the ic09 chunk must be 512x512; received 256x256/u);
  });
});
