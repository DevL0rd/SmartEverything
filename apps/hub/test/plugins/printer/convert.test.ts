import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pwgRasterPage, type RasterPage } from '@smarteverything/ipp';
import { workerEncoder } from '../../../src/plugins/builtin/printer/raster-encoder';
import { testLogger } from '../../support/logs';
import {
  defaultConverter,
  type Converter,
  type RasterRequest,
} from '../../../src/plugins/builtin/printer/convert';

const PDF = Buffer.from(
  [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R 3 0 R] /Count 2 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >> endobj',
    '4 0 obj << /Length 28 >> stream',
    '0 0 0 rg 20 20 100 100 re f',
    'endstream endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n'),
);

const REQUEST: RasterRequest = {
  dpi: 72,
  widthPoints: 200,
  heightPoints: 200,
  space: 'sgray',
  pageSizeName: 'custom_200x200',
  quality: 4,
  copies: 1,
  duplex: false,
  tumble: false,
  sheetBack: 'normal',
};

const HEADER_BYTES = 1796;
const SYNC = Buffer.from('RaS2');

let scripts: string;
let script: string;
let folder: string;
let converter: Converter;
let controller: AbortController;

beforeAll(async () => {
  scripts = await mkdtemp(join(tmpdir(), 'printer-worker-'));
  script = join(scripts, 'raster-worker.mjs');
  await build({
    entryPoints: [
      fileURLToPath(
        new URL('../../../src/plugins/builtin/printer/raster-worker.ts', import.meta.url),
      ),
    ],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
});

afterAll(async () => {
  await rm(scripts, { recursive: true, force: true });
});

function encoderOn(file: string): ReturnType<typeof workerEncoder> {
  return workerEncoder(file, controller.signal, testLogger('printer'));
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'printer-convert-'));
  controller = new AbortController();
  converter = defaultConverter(folder, controller.signal, encoderOn(script));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

async function png(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
}

describe('document conversion', () => {
  it('turns a two page PDF into a PWG raster with a sync word and one header per page', async () => {
    const raster = Buffer.from(await converter.pdfToRaster(PDF, REQUEST));
    expect(raster.subarray(0, 4).equals(SYNC)).toBe(true);
    expect(raster.length).toBeGreaterThan(4 + 2 * HEADER_BYTES);
    const pageSize = raster.subarray(4 + 1732, 4 + 1732 + 14).toString('ascii');
    expect(pageSize).toBe('custom_200x200');
    expect(raster.toString('latin1').split('custom_200x200')).toHaveLength(3);
  });

  it('renders colour pages in the colour space the printer asked for', async () => {
    const gray = await converter.pdfToRaster(PDF, REQUEST);
    const colour = await converter.pdfToRaster(PDF, { ...REQUEST, space: 'srgb' });
    expect(colour.length).toBeGreaterThan(0);
    expect(colour).not.toStrictEqual(gray);
  });

  it('turns a picture into a one page raster that fills the page size', async () => {
    const raster = Buffer.from(await converter.imageToRaster(await png(), REQUEST));
    expect(raster.subarray(0, 4).equals(SYNC)).toBe(true);
    expect(raster.length).toBeGreaterThan(4 + HEADER_BYTES);
  });

  it('turns a picture into a JPEG', async () => {
    const jpeg = Buffer.from(await converter.imageToJpeg(await png()));
    expect([...jpeg.subarray(0, 2)]).toStrictEqual([0xff, 0xd8]);
  });

  it('says plainly when a file is not a PDF Ghostscript can read', async () => {
    await expect(
      converter.pdfToRaster(Buffer.from('not a pdf at all'), REQUEST),
    ).rejects.toMatchObject({
      reason: 'format_unsupported',
    });
  });

  it('says plainly when Ghostscript is not installed', async () => {
    vi.stubEnv('PATH', folder);
    await expect(converter.pdfToRaster(PDF, REQUEST)).rejects.toMatchObject({
      reason: 'converter_missing',
    });
  });

  it('encodes in a worker thread to exactly the bytes the writer makes in process', async () => {
    const picture = await png();
    const raster = Buffer.from(await converter.imageToRaster(picture, REQUEST));
    const raw = await sharp(picture)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 200, height: 200, fit: 'contain', background: '#ffffff' })
      .greyscale()
      .removeAlpha()
      .toColourspace('b-w')
      .raw()
      .toBuffer();
    const page: RasterPage = {
      width: 200,
      height: 200,
      dpi: 72,
      space: 'sgray',
      pixels: raw,
      pageSizeName: REQUEST.pageSizeName,
      quality: 4,
      copies: 1,
      duplex: false,
      tumble: false,
      transform: { crossFeed: 1, feed: 1 },
    };
    expect(raster.subarray(4).equals(Buffer.from(pwgRasterPage(page)))).toBe(true);
  });

  it('turns the back sides of a two sided job the way the printer asks and leaves the fronts alone', async () => {
    const raster = Buffer.from(
      await converter.pdfToRaster(PDF, { ...REQUEST, duplex: true, sheetBack: 'rotated' }),
    );
    const name = Buffer.from('custom_200x200');
    const first = raster.indexOf(name) - 1732;
    const second = raster.indexOf(name, first + 1732 + name.length) - 1732;
    expect(second).toBeGreaterThan(first);
    const transforms = [first, second].map((start) => [
      raster.readInt32BE(start + 456),
      raster.readInt32BE(start + 460),
    ]);
    expect(transforms).toStrictEqual([
      [1, 1],
      [-1, -1],
    ]);
  });

  it('changes the back side pixels only when the printer asks for a turn', async () => {
    const name = Buffer.from('custom_200x200');
    const bodies = async (sheetBack: 'normal' | 'rotated'): Promise<[Buffer, Buffer]> => {
      const raster = Buffer.from(
        await converter.pdfToRaster(PDF, { ...REQUEST, duplex: true, sheetBack }),
      );
      const first = raster.indexOf(name) - 1732;
      const second = raster.indexOf(name, first + 1732 + name.length) - 1732;
      return [raster.subarray(first + 1796, second), raster.subarray(second + 1796)];
    };
    const [plainFront, plainBack] = await bodies('normal');
    expect(plainBack.equals(plainFront)).toBe(true);
    const [turnedFront, turnedBack] = await bodies('rotated');
    expect(turnedFront.equals(plainFront)).toBe(true);
    expect(turnedBack.equals(turnedFront)).toBe(false);
  });

  it('reports a page the worker cannot encode as a format problem', async () => {
    await expect(
      converter.imageToRaster(await png(), { ...REQUEST, pageSizeName: 'x'.repeat(70) }),
    ).rejects.toMatchObject({ reason: 'format_unsupported' });
  });

  it('says so when the worker program is missing', async () => {
    const lost = defaultConverter(folder, controller.signal, encoderOn(join(scripts, 'none.mjs')));
    await expect(lost.imageToRaster(await png(), REQUEST)).rejects.toThrow();
  });
});
