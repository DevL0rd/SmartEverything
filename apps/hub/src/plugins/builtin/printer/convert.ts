import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PrinterError } from '@smarteverything/domain';
import {
  backTransform,
  pwgRasterSync,
  type PageTransform,
  type RasterPage,
  type RasterSpace,
  type SheetBack,
} from '@smarteverything/ipp';
import type { PageEncoder } from './raster-encoder';

export interface RasterRequest {
  readonly dpi: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly space: RasterSpace;
  readonly pageSizeName: string;
  readonly quality: number;
  readonly copies: number;
  readonly duplex: boolean;
  readonly tumble: boolean;
  readonly sheetBack: SheetBack;
}

export interface Converter {
  readonly pdfToRaster: (data: Uint8Array, request: RasterRequest) => Promise<Uint8Array>;
  readonly imageToRaster: (data: Uint8Array, request: RasterRequest) => Promise<Uint8Array>;
  readonly imageToJpeg: (data: Uint8Array) => Promise<Uint8Array>;
}

const POINTS_PER_INCH = 72;
const JPEG_QUALITY = 92;
const WHITE = '#ffffff';
const LOW_PRIORITY = 19;
const GHOSTSCRIPT = 'gs';
const UNCHANGED: PageTransform = { crossFeed: 1, feed: 1 };

function runGhostscript(args: readonly string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(GHOSTSCRIPT, [...args], { stdio: ['ignore', 'ignore', 'pipe'], signal });
    const errors: Buffer[] = [];
    if (child.pid !== undefined) setPriority(child.pid, LOW_PRIORITY);
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.once('error', (cause) => {
      const missing = 'code' in cause && cause.code === 'ENOENT';
      reject(
        missing
          ? new PrinterError(
              'converter_missing',
              'Ghostscript (gs) is not installed, so this document cannot be turned into a page image. A printer that takes PDF directly does not need it.',
            )
          : cause,
      );
    });
    child.once('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new PrinterError(
            'format_unsupported',
            `Ghostscript could not read the document: ${Buffer.concat(errors).toString().trim().slice(0, 300)}`,
          ),
        );
    });
  });
}

function transformOf(request: RasterRequest, index: number): PageTransform {
  const back = request.duplex && index % 2 === 1;
  return back ? backTransform(request.sheetBack, request.tumble) : UNCHANGED;
}

async function pageOf(png: Uint8Array, request: RasterRequest, index: number): Promise<RasterPage> {
  const channels = request.space === 'srgb' ? 3 : 1;
  const transform = transformOf(request, index);
  const width = Math.round((request.widthPoints / POINTS_PER_INCH) * request.dpi);
  const height = Math.round((request.heightPoints / POINTS_PER_INCH) * request.dpi);
  let image = sharp(png)
    .rotate()
    .flatten({ background: WHITE })
    .resize({ width, height, fit: 'contain', background: WHITE });
  if (request.space === 'sgray') image = image.greyscale();
  if (transform.crossFeed === -1) image = image.flop();
  if (transform.feed === -1) image = image.flip();
  const raw = await image
    .removeAlpha()
    .toColourspace(request.space === 'srgb' ? 'srgb' : 'b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (raw.info.channels !== channels) {
    throw new PrinterError(
      'format_unsupported',
      `The page image has ${String(raw.info.channels)} colour channels, expected ${String(channels)}.`,
    );
  }
  return {
    width: raw.info.width,
    height: raw.info.height,
    dpi: request.dpi,
    space: request.space,
    pixels: raw.data,
    pageSizeName: request.pageSizeName,
    quality: request.quality,
    copies: request.copies,
    duplex: request.duplex,
    tumble: request.tumble,
    transform,
  };
}

function concatenated(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

async function* pagesOf(
  work: string,
  names: readonly string[],
  request: RasterRequest,
): AsyncGenerator<RasterPage> {
  for (const [index, name] of names.entries()) {
    yield await pageOf(await readFile(join(work, name)), request, index);
  }
}

interface Workshop {
  readonly folder: string;
  readonly signal: AbortSignal;
  readonly encode: PageEncoder;
}

async function ghostscriptPages(
  data: Uint8Array,
  request: RasterRequest,
  { folder, signal, encode }: Workshop,
): Promise<Uint8Array> {
  const work = await mkdtemp(join(folder, 'convert-'));
  try {
    await writeFile(join(work, 'in.pdf'), data);
    const device = request.space === 'srgb' ? 'png16m' : 'pnggray';
    await runGhostscript(gsArguments(work, device, request), signal);
    const names = (await readdir(work)).filter((name) => name.startsWith('page-')).sort();
    return concatenated([pwgRasterSync(), ...(await encode(pagesOf(work, names, request)))]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function gsArguments(work: string, device: string, request: RasterRequest): readonly string[] {
  return [
    '-q',
    '-dSAFER',
    '-dNOPAUSE',
    '-dBATCH',
    `-sDEVICE=${device}`,
    `-r${String(request.dpi)}`,
    `-dDEVICEWIDTHPOINTS=${String(request.widthPoints)}`,
    `-dDEVICEHEIGHTPOINTS=${String(request.heightPoints)}`,
    '-dFIXEDMEDIA',
    '-dPDFFitPage',
    `-sOutputFile=${join(work, 'page-%04d.png')}`,
    join(work, 'in.pdf'),
  ];
}

async function* single(page: () => Promise<RasterPage>): AsyncGenerator<RasterPage> {
  yield await page();
}

export function defaultConverter(
  folder: string,
  signal: AbortSignal,
  encode: PageEncoder,
): Converter {
  return {
    pdfToRaster: (data, request): Promise<Uint8Array> =>
      ghostscriptPages(data, request, { folder, signal, encode }),
    imageToRaster: async (data, request): Promise<Uint8Array> =>
      concatenated([pwgRasterSync(), ...(await encode(single(() => pageOf(data, request, 0))))]),
    imageToJpeg: (data): Promise<Uint8Array> =>
      sharp(data)
        .rotate()
        .flatten({ background: WHITE })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer(),
  };
}
