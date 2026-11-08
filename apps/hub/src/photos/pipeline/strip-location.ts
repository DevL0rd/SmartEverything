import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'exifreader';
import sharp, { type Sharp } from 'sharp';
import { z } from 'zod';
import { messageOf, type Logger } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import { ffmpegPath } from '../../media/ffmpeg-path';
import { derivedDirectory, type DerivedLayout } from './derived-paths';
import { stripIsoBmffStill } from './strip-heif';
import { LayoutRejected, Tiff, reject, stripTiff, stripXmpPackets } from './strip-tiff';
import type { StripResult } from './strip-tiff';

const run = promisify(execFile);

const SNIFF_LENGTH = 12;
const EXIF_APP1 = 'Exif\0\0';
const XMP_APP1 = 'http://ns.adobe.com/xap/1.0/\0';
const SCAN_MARKER = 0xda;
const APP1_MARKER = 0xe1;
const HEIF_BRANDS: ReadonlySet<string> = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
  'avif',
  'avis',
]);
const REENCODE_QUALITY = 92;
const EXTENSION = z.string().regex(/^[a-z0-9]{1,8}$/u);
const REV = z.int().positive();
const RESIDUAL_IPTC = /City|Sub-location|Province|Country/u;

export type StillKind = 'jpeg' | 'tiff' | 'heif';
export type SourceKind = StillKind | 'mp4' | 'mov' | 'other';

export type StripMethod = 'patched' | 'remuxed' | 'reencoded' | 'existing';

export interface OutsideRequest {
  readonly source: string;
  readonly extension: string;
  readonly itemId: string;
  readonly rev: number;
  readonly layout: DerivedLayout;
  readonly log: Logger;
  readonly signal?: AbortSignal;
}

export interface OutsideCopy {
  readonly path: string;
  readonly extension: string;
  readonly method: StripMethod;
}

function isoKind(head: Buffer): SourceKind {
  const brand = head.toString('latin1', 8, 12);
  if (HEIF_BRANDS.has(brand)) return 'heif';
  return brand === 'qt  ' ? 'mov' : 'mp4';
}

export function sniffKind(head: Buffer): SourceKind {
  const magic = head.toString('latin1', 0, 4);
  if (head.length >= 3 && head.readUInt16BE(0) === 0xffd8 && head[2] === 0xff) return 'jpeg';
  if (magic === 'II*\0' || magic === 'MM\0*') return 'tiff';
  if (head.length >= SNIFF_LENGTH && head.toString('latin1', 4, 8) === 'ftyp') return isoKind(head);
  return 'other';
}

function stripApp1(buf: Buffer, body: number, end: number): StripResult {
  if (buf.toString('latin1', body, body + EXIF_APP1.length) === EXIF_APP1) {
    return { exif: new Tiff(buf, body + EXIF_APP1.length).removeGps(), xmpProperties: 0 };
  }
  if (buf.toString('latin1', body, body + XMP_APP1.length) === XMP_APP1) {
    return { exif: false, xmpProperties: stripXmpPackets(buf.subarray(body, end)) };
  }
  return { exif: false, xmpProperties: 0 };
}

export function stripJpeg(buf: Buffer): StripResult {
  if (sniffKind(buf) !== 'jpeg') reject('the JPEG signature is missing');
  let position = 2;
  let exif = false;
  let xmpProperties = 0;
  while (position + 4 <= buf.length && buf.readUInt8(position) === 0xff) {
    const marker = buf.readUInt8(position + 1);
    if (marker === SCAN_MARKER) break;
    const length = buf.readUInt16BE(position + 2);
    const end = position + 2 + length;
    if (length < 2 || end > buf.length) reject('a JPEG segment overruns the file');
    if (marker === APP1_MARKER) {
      const found = stripApp1(buf, position + 4, end);
      exif = found.exif || exif;
      xmpProperties += found.xmpProperties;
    }
    position = end;
  }
  return { exif, xmpProperties };
}

const PATCHERS: Readonly<Record<StillKind, (buf: Buffer) => StripResult>> = {
  jpeg: stripJpeg,
  tiff: stripTiff,
  heif: stripIsoBmffStill,
};

export function residualLocation(buf: Buffer): string | null {
  const tags = load(buf, { expanded: true });
  if (tags.gps !== undefined) return 'GPS coordinates remain';
  if (Object.keys(tags.exif ?? {}).some((name) => name.startsWith('GPS'))) {
    return 'GPS tags remain';
  }
  if (Object.keys(tags.iptc ?? {}).some((name) => RESIDUAL_IPTC.test(name))) {
    return 'IPTC location remains';
  }
  return null;
}

export function patchStill(kind: StillKind, original: Buffer): Buffer {
  const patched = Buffer.from(original);
  PATCHERS[kind](patched);
  const residual = residualLocation(patched);
  if (residual !== null) reject(residual);
  return patched;
}

export function outsidePath(
  layout: DerivedLayout,
  itemId: string,
  rev: number,
  extension: string,
): string {
  return join(
    derivedDirectory(layout, itemId),
    `${itemId}-${String(REV.parse(rev))}-outside.${EXTENSION.parse(extension)}`,
  );
}

async function findOutside(request: OutsideRequest): Promise<OutsideCopy | null> {
  const directory = derivedDirectory(request.layout, request.itemId);
  const prefix = `${request.itemId}-${String(REV.parse(request.rev))}-outside.`;
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return null;
    throw cause;
  }
  const name = names.find(
    (candidate) => candidate.startsWith(prefix) && !candidate.endsWith('.partial'),
  );
  if (name === undefined) return null;
  return { path: join(directory, name), extension: name.slice(prefix.length), method: 'existing' };
}

async function stage(target: string, produce: (staged: string) => Promise<void>): Promise<void> {
  const staged = `${target}.${randomUUID()}.partial`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await produce(staged);
    await rename(staged, target);
  } catch (cause) {
    await rm(staged, { force: true });
    throw cause;
  }
}

async function headOf(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(SNIFF_LENGTH);
    const { bytesRead } = await handle.read(head, 0, SNIFF_LENGTH, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function remux(request: OutsideRequest, kind: 'mp4' | 'mov'): Promise<OutsideCopy> {
  const target = outsidePath(request.layout, request.itemId, request.rev, kind);
  await stage(target, async (staged) => {
    await run(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-y',
        '-i',
        request.source,
        '-map',
        '0:v',
        '-map',
        '0:a?',
        '-dn',
        '-sn',
        '-c',
        'copy',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        '-movflags',
        '+faststart',
        '-f',
        kind,
        staged,
      ],
      request.signal === undefined ? {} : { signal: request.signal },
    );
  });
  return { path: target, extension: kind, method: 'remuxed' };
}

async function patched(request: OutsideRequest, kind: StillKind): Promise<OutsideCopy> {
  const bytes = patchStill(kind, await readFile(request.source));
  const target = outsidePath(request.layout, request.itemId, request.rev, request.extension);
  await stage(target, (staged) => writeFile(staged, bytes));
  return { path: target, extension: request.extension, method: 'patched' };
}

interface Encoder {
  readonly extension: string;
  readonly encode: (image: Sharp) => Sharp;
}

const JPEG_ENCODER: Encoder = {
  extension: 'jpg',
  encode: (image) => image.jpeg({ quality: REENCODE_QUALITY }),
};

const ENCODERS: Readonly<Record<string, Encoder>> = {
  png: { extension: 'png', encode: (image) => image.png() },
  webp: { extension: 'webp', encode: (image) => image.webp({ quality: REENCODE_QUALITY }) },
  avif: { extension: 'avif', encode: (image) => image.avif({ quality: REENCODE_QUALITY }) },
  tiff: { extension: 'tiff', encode: (image) => image.tiff({ quality: REENCODE_QUALITY }) },
};

async function reencoded(request: OutsideRequest): Promise<OutsideCopy> {
  const { format } = await sharp(request.source).metadata();
  const encoder = ENCODERS[format] ?? JPEG_ENCODER;
  const target = outsidePath(request.layout, request.itemId, request.rev, encoder.extension);
  const bytes = await encoder
    .encode(sharp(request.source).autoOrient().keepIccProfile())
    .toBuffer();
  await stage(target, (staged) => writeFile(staged, bytes));
  return { path: target, extension: encoder.extension, method: 'reencoded' };
}

function isRejection(cause: unknown): boolean {
  return cause instanceof LayoutRejected || cause instanceof RangeError;
}

async function stripStill(request: OutsideRequest, kind: StillKind): Promise<OutsideCopy> {
  try {
    return await patched(request, kind);
  } catch (cause) {
    if (!isRejection(cause)) throw cause;
    request.log.warn('photos.location_reencoded', {
      itemId: request.itemId,
      rev: request.rev,
      reason: messageOf(cause),
    });
    return reencoded(request);
  }
}

async function strip(request: OutsideRequest): Promise<OutsideCopy> {
  const kind = sniffKind(await headOf(request.source));
  if (kind === 'mp4' || kind === 'mov') return remux(request, kind);
  if (kind === 'other') {
    request.log.warn('photos.location_reencoded', {
      itemId: request.itemId,
      rev: request.rev,
      reason: 'no lossless location edit exists for this format',
    });
    return reencoded(request);
  }
  return stripStill(request, kind);
}

export async function outsideCopy(request: OutsideRequest): Promise<OutsideCopy> {
  const existing = await findOutside(request);
  if (existing !== null) return existing;
  const copy = await strip(request);
  request.log.info('photos.location_stripped', {
    itemId: request.itemId,
    rev: request.rev,
    method: copy.method,
  });
  return copy;
}
