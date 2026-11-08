import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { crc32, deflateSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ffmpegPath } from '../../src/media/ffmpeg-path.js';

const run = promisify(execFile);
const require = createRequire(import.meta.url);

const SMALL =
  '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';
const GRID =
  'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAlhtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAABBpZGF0AAABAQCAAIAAAAB0aWxvYwEAAABEQAAFAAEAAQAAAAAAAAABAAAAAAAAAAgAAgAAAAAAAAJ8AAEAAAAAAAAAGgADAAAAAAAAApYAAQAAAAAAAAAZAAQAAAAAAAACrwABAAAAAAAAABoABQAAAAAAAALJAAEAAAAAAAAAGgAAAHdpaW5mAAAAAAAFAAAAFWluZmUCAAAAAAEAAGdyaWQAAAAAFWluZmUCAAABAAIAAGh2YzEAAAAAFWluZmUCAAABAAMAAGh2YzEAAAAAFWluZmUCAAABAAQAAGh2YzEAAAAAFWluZmUCAAABAAUAAGh2YzEAAAAADnBpdG0AAAAAAAEAAAECaXBycAAAAMhpcGNvAAAAFGlzcGUAAAAAAAAAgAAAAIAAAAB1aHZjQwEDcAAAAJAAAAAAAB7wAPz9+PgAAA8DYAABABhAAQwB//8DcAAAAwCQAAADAAADAB66AkBhAAEAKEIBAQNwAAADAJAAAAMAAAMAHqAggQWW6kkprmwIAAADAMgAAAMACEBiAAEAB0QBwXKwIkAAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAQcGl4aQAAAAADCAgIAAAAMmlwbWEAAAAAAAAABQABAwGFAwACBIIDBAUAAwSCAwQFAAQEggMEBQAFBIIDBAUAAAAgaXJlZgAAAAAAAAAUZGltZwABAAQAAgADAAQABQAAAG9tZGF0AAAAFigBr1j5DpJf//Gev/9iUkPmt6MbILAAAAAVKAGvWPkOkl8Wf3/+m8//3W0MbILAAAAAFigBr1j5DpJf//f2vI/N6n/1DoxsgsAAAAAWKAGvWPkOkl8X+IB//8+iZDW1DGyCwA==';
const ALPHA =
  'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAkVtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAADRpbG9jAAAAAERAAAIAAQAAAAACaQABAAAAAAAAAB8AAgAAAAACiAABAAAAAAAAAA4AAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAAACAABodmMxAAAAAA5waXRtAAAAAAABAAABhGlwcnAAAAFeaXBjbwAAAHhodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQArQgEBA3AAAAMAkAAAAwAAAwAeoDCBBZbqSSmubgIaDAgAAAMAyAAAAwAIQGIAAQAHRAHBcrAiQAAAABNjb2xybmNseAABAA0ABoAAAAAUaXNwZQAAAAAAAABgAAAAQAAAABBwaXhpAAAAAAMICAgAAAByaHZjQwEECAAAAJ/4AAAAAB7wAPz8+PgAAA8DYAABABdAAQwB//8ECAAAAwCf+AAAAwAAHroCQGEAAQAmQgEBBAgAAAMAn/gAAAMAAB7AwgQWW6kkprmwIAAAAwMgAAADACFiAAEAB0QBwXKwIkAAAAAOcGl4aQAAAAABCAAAACdhdXhDAAAAAHVybjptcGVnOmhldmM6MjAxNTphdXhpZDoxAAAAAB5pcG1hAAAAAAAAAAIAAQSBAgMEAAIEhQMGhwAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAAANW1kYXQAAAAbKAGvE4DlM8Cf/+dSj/9nTPD7WCq1Q9FnTvbAAAAACigBrifHI0TgT7A=';
const THUMB =
  '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';
const MULTI =
  'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAA7htZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAEZpbG9jAAAAAERAAAMAAQAAAAAD3AABAAAAAAAABOAAAgAAAAAIvAABAAAAAAAAALgAAwAAAAAJdAABAAAAAAAABUcAAABNaWluZgAAAAAAAwAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABVpbmZlAgAAAAADAABodmMxAAAAAA5waXRtAAAAAAABAAAC0GlwcnAAAAKpaXBjbwAAAHVodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQAoQgEBA3AAAAMAkAAAAwAAAwAeoDCBBZbqSSmubAgAAAMAyAAAAwAIQGIAAQAHRAHBcrAiQAAAAexjb2xycHJvZgAAAeBsY21zBCAAAG1udHJSR0IgWFlaIAfiAAMAFAAJAA4AHWFjc3BNU0ZUAAAAAHNhd3NjdHJsAAAAAAAAAAAAAAAAAAD21gABAAAAANMtaGFuZHnpv1ZaPgG2gyOFVUb3T6oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACmRlc2MAAAD8AAAAJGNwcnQAAAEgAAAAInd0cHQAAAFEAAAAFGNoYWQAAAFYAAAALHJYWVoAAAGEAAAAFGdYWVoAAAGYAAAAFGJYWVoAAAGsAAAAFHJUUkMAAAHAAAAAIGdUUkMAAAHAAAAAIGJUUkMAAAHAAAAAIG1sdWMAAAAAAAAAAQAAAAxlblVTAAAACAAAABwAcwBSAEcAQm1sdWMAAAAAAAAAAQAAAAxlblVTAAAABgAAABwAQwBDADAAAFhZWiAAAAAAAAD21gABAAAAANMtc2YzMgAAAAAAAQw/AAAF3f//8yYAAAeQAAD9kv//+6H///2iAAAD3AAAwHFYWVogAAAAAAAAb6AAADjyAAADj1hZWiAAAAAAAABilgAAt4kAABjaWFlaIAAAAAAAACSgAAAPhQAAtsRwYXJhAAAAAAADAAAAAmZpAADypwAADVkAABPQAAAKWwAAABRpc3BlAAAAAAAAAGAAAABAAAAAEHBpeGkAAAAAAwgICAAAAAlpcm90AwAAABNjb2xybmNseAABAA0ABoAAAAAfaXBtYQAAAAAAAAACAAEFgQIDBIUAAwSBBgMEAAAAGmlyZWYAAAAAAAAADmNkc2MAAgABAAEAAArnbWRhdAAABNwoAa8TgMRopcG82yFTMQQhbHvnZaiqT5JeKUEm0HVCwE8jHjRypIu5w+UY/lQm2MZhmQe/F8E6uoOAmn4iwydVsHx/ZAQtBVd1KpNJCGS2k8AwIXUD24ksLitnEQlfyi8gT0R49e6YDrK7ZPH7+1EGctHe2VxaKIo6q9Pby+r9GWok3LRNn+U99NzsdFrn1GCX+1qmIrEzMDxucfnKqJu6NUr8KxgmN1u4YbIWAL0DKQGHn/YlOns/7AZpEi5kgs+2Cr+0cA9ugysHml+RygdjcYowkwQ4QQGvdFSgiX6LUUVdHONRlDvtX7jpSH3Sv3yOObJH7IzPJwiUJMfERR5dmFEm8Pt7y3XL6eSy99T6Gx1Ayf4y9niOkIDYRPDjP9IwMIzR7Nn6PNWDlkhlRqCVERAuLL7gt8OPlhk0yEmF1ONokLcsXzzp/gmRNbKWU6wEvwnic5sY4wEqRHAMRD+S2K2i0ocYUivv477kGTQjHqZDQhS/subrzgev7ZgWCfGP6rNGCyz4SEa7HFdexId/T0LBNSNLmYy/6cJehK9MbhFE7M0VT6PlGqTTDv0bT/dcTqQ6R0q+TP5jrwaDZKek/PYltcmPuk818Edr/9ItTTOypxiVGCUIs5ucOEnMDVvZp3x0gkOrskR+ZJE93rsw/fl2ZP6M/c51bt3f+UfssicnEEMZF51FQMu0URDNBsfNlrhZT06JXHscDjWx+rs7jGoF4rjE4VqCi8FYv7csSPiiIY27MFcPG78GujwoA1bLZaZupbMjw0/3nHnSqIVGz7f5fAPJcU3OK1PRBw62QUyk2aCbQiBewL0B5l/HHL9zt6UFZcJU+rx7fhm9/dYhf58J+u8TC94/UngbvGDgW4oO5X8B7X/Tqj1TWvdWepHwKWEOyOpn5Wk0LejWf8/MnZ7rua+LRcRHfftvQT7Fcc4jGQzRb41pMnQEogiDe+WC0wJKvvPn6PfCU3x2mQmZ0vmUQbeUUojHQXRE8g3PLLFot+gt/i6crh0HxWJAPO9yJ4PvXjNf+DlURSatZe7mxks1DcWq9D6xLGFEA92GjEZY6cgnCy5Vy5YgjmKcaHozzsI3kXaR2ckxlxLNCxGQDqGigyFUsqHgMAPid69rOOUKGKNU/JYbGX6m/elL9b/lP54MGuT1XlWXxwQq22eeSpiMj9kGBuMgBXKG4qSgGYhNxyWGSncJRz8OAqSsjjcOzQ1THihX09YDzRAvTZkfmR5PgExAL4q3ExUXsI5LhJMWsj+nuKmwa2wmHafxihlZRI87CS43kb9yJ0DnVIBOVwxftJL2aQQFgoMi0/2i4mG+Ed8CuS4fujkzb+L7cfYNyK8AOel4heEBRbefQgF6qhZ3nuBKCnc+3XTtyyxoSiDqPEbhLmlkYx1daTSgQ2SICEdtk+UBiTu/KMvFpABpa6LDvnS6nMkYGNba++0nTqkN/i39Ankt8BV4QINXVWtE59KmMncC7kYVp3tGTSIGGz9QJHTf6RYEOSP3Ub3g5qG21H+Vd2pUGkRK2szsmSkdYus0AKxVlBSMD8xNnbTwUuEh+RbJb6EMnFpjpZdyOXJ35lwC4lYeoaepGvYeNlKW5A/ucu2Dk7iRjPxQ2Zrs6Iolr5t6u/ZXKG49JWbkrq5BZsKyucSqMF2YgAAAAABJSSoACAAAAAYAEgEDAAEAAAAGAAAAGgEFAAEAAABWAAAAGwEFAAEAAABeAAAAKAEDAAEAAAACAAAAEwIDAAEAAAABAAAAaYcEAAEAAABmAAAAAAAAADhjAADoAwAAOGMAAOgDAAAGAACQBwAEAAAAMDIxMAGRBwAEAAAAAQIDAACgBwAEAAAAMDEwMAGgAwABAAAA//8AAAKgBAABAAAAYAAAAAOgBAABAAAAQAAAAAAAAAAAAAVDKAGvE4DHxbM0TugSn0JlDEtBqMPuNLE3r8q/l4/tf7ecJe1Z8T6OXJAUWJeDNvsry7vK/Kshp2MnFtSk7Q8hXW6iGkMkxj/5gTM0MD/NYTWA3peIEwAsFRgdgTndsg5bjYn5zbYCw2hmwxr2rf2KAYV7XEik5yBk5d2ahHkDx4mrpWygrTEht2ncI1WBPXBub1X7TmqT08a24ZGvQlwnMWY15OpKVzfoHj8OzFALmA3Q7Loo1OlN5PZD/xtsWSjtL2MmQvGG0j9URI4lYJ7cdZk0VLAgMQ5rZNKgq3Hryihm4L93sw4nunsfEzuSznFGAR4B2wJf/nwsd0TtlEaLsjzqdhhwAQrEz5qONjVF8254XW+5MlRBufpF/f3Cugb9hfJnQTKWTsK/1FUf3YYOs8fAodi52YOxqWMZoA/CavhaPwdLFwyIPTrj8dxiEIVfkAwOiIdBi3Dmu1fPG1ZA1MdWoXv5wb3b11LZUjthMKeDg8GW32WQCGSiCrU/mCiUmeDxDVjrzygW2jDHEj8+D5uHC6pcf1/R1M6x/CpIpIYr4b3PYXL4dB/wOedyMCZ2ojoVg9HhBfs0ZfDeiVqSZMyzw6vLQnCHiZXfFiNcGMnbjcKAak0aVh4X4E/29i1ubKn2HLQXWVyvTjb6TZKvucJaL3gbdgQ6R/Na30Ki1YV6QrAr921V9B9x4nEIGXM4EGPJJFT4tG+LqPDc6LwMy56yxwzmY9+InDw3jrZTN3WrJCW1bVz1i7CFEtComKsShEAuBpnYhH/3aDZ8uedCDIkdgZvUYp/vRolCgEKY9qCygjhAWQxtCwaA3jzJQMqL+bzLdvCulyX5zFEaOgrUIIB2uyIP+LoAsL64eIiucnrkIlA9nVUdmTvFTVlQqGjuXtSLX7X/yV1Ks3/6e89U3Wy1Zw5Wi4+LROxUlS8w7a+hmlOwr4jECe/dIV8Ye7vr/Rh6CJUNznl16sNXYxH8U3sdntMKgKRTwNFP9vsHO26EKKz14i1D92jOH7kkdxXgrrpZzEjjgyaCup/teOjK0DjO2NaPxkfGK3IVYqBqpiEzs3VCkC0xxwmGeyEFZz/LiJUbtGGtCt2SDDWUzWFsDsFLsmJTR0ep24rg0jByatdZBQfqhstTDtIsnSMmy7zyftVFni1rH8Q6BTsb7UP9LUoRVmzq9+SvlTA3lvJCgg93PTuzmqdD8QUXmd8vTJng9A5SV0RYURlMOSlcVearJ1tIt4ogSgqCUitFp7UoJQHImJf0awjWPeXTKiEIjH4UoV2+1qYwckEP2BCrE6LMVuLx1G6fallx0Tp6eMk0AF+9ur0eIoM9XnY2hSjmsZbGNY5pcINCny0AbwVS0FJeTzIM937v5fBsvxXVpLKConWPzOOGr8rziGOGEn1eDLN7xZnsf6SprwsfFe78nnvZQo0EKnGNHoNKklKD2IUw+tMgc23rCDLv5vgr39ZJNDoil0BJ8sUXS5FQPJ2Aw891YMr2ufoP+ECwsF1QveWAwBIDwtkTAovzlEKrTCmEEczHjW6JSykkVl8U08xYltrOnPJ7heTBt3eRLcjloKA3b5il0M2Vt9tIWMUa5r58ivazVgZMdJNAOnuVl2g3SAJ2Oi30TaNBCBoiO7UDqWTBb+Blc7hki2N7eiNGDID6MoUTfUKp7fwQAqi4EllXOXzt02lCadi4+4cFBsszoXl3k0hzDvLmBOdZjxwATfWAA02Q8Rh+jv97qjV0Q+gUvylFViO5qWzWwbeDIOA/pYoJSU9S9JiJmW4HZAxtK700TIZWKoFA';

interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

interface HeifImage {
  readonly get_width: () => number;
  readonly get_height: () => number;
  readonly is_primary: () => boolean;
  readonly has_alpha_channel: () => boolean;
  readonly display: (target: Pixels, done: (result: Pixels | null) => void) => void;
}

interface HeifDecoder {
  readonly decode: (bytes: Uint8Array) => readonly HeifImage[];
}

const libheifModule = z.object({
  HeifDecoder: z.custom<new () => HeifDecoder>((value) => typeof value === 'function'),
});

const libheif = libheifModule.parse(require('libheif-js/wasm-bundle'));
const libheifPath = require.resolve('libheif-js/wasm-bundle');

const bytes = (base64: string): Buffer => Buffer.from(base64, 'base64');

const decodeAll = (file: Uint8Array): readonly HeifImage[] =>
  new libheif.HeifDecoder().decode(file);

const display = (image: HeifImage): Promise<Pixels> => {
  const width = image.get_width();
  const height = image.get_height();
  const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
  return new Promise((resolve, reject) => {
    image.display(target, (result) => {
      if (result === null) reject(new Error('display failed'));
      else resolve(result);
    });
  });
};

const decodePrimary = async (file: Uint8Array): Promise<Pixels> => {
  const primary = decodeAll(file).find((image) => image.is_primary());
  if (primary === undefined) throw new Error('no primary image');
  return display(primary);
};

const pixel = (image: Pixels, x: number, y: number): readonly number[] => {
  const at = (y * image.width + x) * 4;
  return [
    image.data[at] ?? 0,
    image.data[at + 1] ?? 0,
    image.data[at + 2] ?? 0,
    image.data[at + 3] ?? 0,
  ];
};

const near = (actual: readonly number[], expected: readonly number[], tolerance = 40): boolean =>
  expected.every((value, index) => Math.abs((actual[index] ?? 0) - value) <= tolerance);

const RED = [232, 42, 42];
const GREEN = [38, 208, 39];
const BLUE = [40, 40, 235];
const YELLOW = [250, 250, 50];

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const tag = Buffer.from(type, 'latin1');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])) >>> 0);
  return Buffer.concat([length, tag, data, checksum]);
};

const embedIcc = (png: Buffer, icc: Buffer): Buffer => {
  const afterHeader = 8 + 8 + 13 + 4;
  const body = Buffer.concat([Buffer.from('icc\0\0', 'latin1'), deflateSync(icc)]);
  return Buffer.concat([
    png.subarray(0, afterHeader),
    pngChunk('iCCP', body),
    png.subarray(afterHeader),
  ]);
};

const decodeInWorker = (
  file: Buffer,
  limitMb: number,
): Promise<{ readonly width: number; readonly height: number }> =>
  new Promise((resolve, reject) => {
    const source = [
      "const { parentPort, workerData } = require('node:worker_threads');",
      'const libheif = require(workerData.libheif);',
      'const image = new libheif.HeifDecoder().decode(workerData.bytes)[0];',
      'const width = image.get_width();',
      'const height = image.get_height();',
      'image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) => {',
      '  parentPort.postMessage(result ? { width, height } : null);',
      '});',
    ].join('\n');
    const worker = new Worker(source, {
      eval: true,
      workerData: { libheif: libheifPath, bytes: file },
      resourceLimits: { maxOldGenerationSizeMb: limitMb },
    });
    worker.once('message', (message) => {
      const parsed = z.object({ width: z.number(), height: z.number() }).nullable().parse(message);
      if (parsed === null) reject(new Error('worker display failed'));
      else resolve(parsed);
      void worker.terminate();
    });
    worker.once('error', reject);
  });

const scratch = mkdtempSync(join(tmpdir(), 'heic-probe-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const ffmpegDecode = async (
  file: Buffer,
  name: string,
): Promise<{ readonly width: number; readonly height: number }> => {
  const input = join(scratch, name + '.heic');
  const output = join(scratch, name + '.png');
  writeFileSync(input, file);
  await run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-i',
    input,
    '-frames:v',
    '1',
    '-update',
    '1',
    output,
  ]);
  const meta = await sharp(readFileSync(output)).metadata();
  return z.object({ width: z.number(), height: z.number() }).parse(meta);
};

describe('libheif-js decode behaviour', () => {
  it('applies the rotation transform so a 96x64 coded image displays as 64x96', async () => {
    const image = await decodePrimary(bytes(SMALL));
    expect([image.width, image.height]).toEqual([64, 96]);
    expect(near(pixel(image, 6, 6), BLUE)).toBe(true);
    expect(near(pixel(image, 57, 6), RED)).toBe(true);
    expect(near(pixel(image, 57, 89), GREEN)).toBe(true);
    expect(near(pixel(image, 6, 89), YELLOW)).toBe(true);
  });

  it('decodes every tile of a grid image, not only the first', async () => {
    const image = await decodePrimary(bytes(GRID));
    expect([image.width, image.height]).toEqual([128, 128]);
    expect(
      near(
        pixel(image, 10, 10),
        RED.map((v) => v - 12),
      ),
    ).toBe(true);
    expect(near(pixel(image, 118, 10), [30, 200, 30])).toBe(true);
    expect(near(pixel(image, 10, 118), [30, 30, 220])).toBe(true);
    expect(near(pixel(image, 118, 118), [230, 230, 30])).toBe(true);
  });

  it('keeps alpha and embedded thumbnails out of the top-level image list', async () => {
    const alpha = decodeAll(bytes(ALPHA));
    expect(alpha).toHaveLength(1);
    expect(alpha[0]?.has_alpha_channel()).toBe(true);
    const image = await decodePrimary(bytes(ALPHA));
    expect(Math.abs((pixel(image, 10, 10)[3] ?? 0) - 128)).toBeLessThanOrEqual(2);
    const thumb = decodeAll(bytes(THUMB));
    expect(thumb).toHaveLength(1);
    expect([thumb[0]?.get_width(), thumb[0]?.get_height()]).toEqual([64, 96]);
  });

  it('lists every top-level image and flags the primary one', () => {
    const images = decodeAll(bytes(MULTI));
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.is_primary())).toEqual([true, false]);
  });

  it('returns no images for a truncated or non-HEIF file instead of throwing', () => {
    expect(decodeAll(bytes(SMALL).subarray(0, 1200))).toHaveLength(0);
    expect(decodeAll(Buffer.alloc(3000, 7))).toHaveLength(0);
  });

  it('decodes inside a worker thread with a small old-generation limit', async () => {
    await expect(decodeInWorker(bytes(GRID), 64)).resolves.toEqual({ width: 128, height: 128 });
  });
});

describe('colour handling after decode', () => {
  it('reads the Display P3 profile through sharp without decoding HEVC', async () => {
    const file = bytes(SMALL);
    await expect(sharp(file).raw().toBuffer()).rejects.toThrow(/HEVC/);
    const meta = await sharp(file).metadata();
    expect(meta.compression).toBe('hevc');
    expect(meta.icc?.length).toBeGreaterThan(0);
  });

  it('converts to sRGB only when the profile is tagged and the pipeline colourspace is set', async () => {
    const file = bytes(SMALL);
    const icc = (await sharp(file).metadata()).icc;
    if (icc === undefined) throw new Error('fixture lost its profile');
    const decoded = await decodePrimary(file);
    const raw = await sharp(Buffer.from(decoded.data.buffer), {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    })
      .removeAlpha()
      .png()
      .toBuffer();
    const untagged = await sharp(raw).raw().toBuffer();
    const tagged = await sharp(embedIcc(raw, icc))
      .pipelineColourspace('rgb16')
      .toColourspace('srgb')
      .raw()
      .toBuffer();
    const at = (57 * 1 + 6 * decoded.width) * 3;
    expect(untagged[at]).toBe(pixel(decoded, 57, 6)[0]);
    expect(Math.abs((tagged[at] ?? 0) - (untagged[at] ?? 0))).toBeGreaterThanOrEqual(8);
    const plain = await sharp(embedIcc(raw, icc)).raw().toBuffer();
    expect(plain[at]).toBe(untagged[at]);
  });
});

describe('ffmpeg fallback behaviour', () => {
  it('ignores the rotation transform', async () => {
    await expect(ffmpegDecode(bytes(SMALL), 'small')).resolves.toEqual({ width: 96, height: 64 });
  });

  it('outputs only the first tile of a grid image', async () => {
    await expect(ffmpegDecode(bytes(GRID), 'grid')).resolves.toEqual({ width: 64, height: 64 });
  });
});
