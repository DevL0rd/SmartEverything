import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import { BICUBIC, createICNS, createICO, setLogger } from 'png2icons';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_HEADER_LENGTH = 6;
const ICO_ENTRY_LENGTH = 16;
const ICNS_HEADER_LENGTH = 8;
const LOSSLESS = 0;
export const LINUX_ICON_SIZE = 512;
const LINUX_ICON_CHUNK = 'ic09';

export class IconInvalidError extends Error {
  readonly expected: string;
  readonly received: string;

  constructor(subject: string, expected: string, received: string) {
    super(`${subject} must be ${expected}; received ${received}`);
    this.name = 'IconInvalidError';
    this.expected = expected;
    this.received = received;
  }
}

export interface PngSize {
  readonly width: number;
  readonly height: number;
}

export function pngSize(data: Buffer): PngSize {
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new IconInvalidError(
      'an icon image',
      'a PNG',
      `${String(data.length)} bytes without the PNG signature`,
    );
  }
  if (data.toString('latin1', 12, 16) !== 'IHDR') {
    throw new IconInvalidError('a PNG', 'IHDR first', data.toString('latin1', 12, 16));
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

export interface IcoEntry {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
}

function sliceWithin(container: Buffer, start: number, length: number, subject: string): Buffer {
  if (start < 0 || length <= 0 || start + length > container.length) {
    throw new IconInvalidError(
      subject,
      `inside the ${String(container.length)}-byte file`,
      `${String(length)} bytes at ${String(start)}`,
    );
  }
  return container.subarray(start, start + length);
}

const PNG_CHUNK_OVERHEAD = 12;
const CHANNELS_BY_COLOUR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

export interface PngChunk {
  readonly type: string;
  readonly data: Buffer;
}

function checkedChunk(data: Buffer, offset: number): PngChunk {
  const header = sliceWithin(data, offset, 8, `PNG chunk header at ${String(offset)}`);
  const length = header.readUInt32BE(0);
  const type = header.toString('latin1', 4, 8);
  const chunk = sliceWithin(data, offset + 4, length + 8, `PNG chunk ${type}`);
  const expected = chunk.readUInt32BE(length + 4);
  const actual = crc32(chunk.subarray(0, length + 4));
  if (actual !== expected) {
    throw new IconInvalidError(
      `PNG chunk ${type}`,
      `checksum ${String(expected)}`,
      `checksum ${String(actual)}`,
    );
  }
  return { type, data: chunk.subarray(4, length + 4) };
}

export function pngChunks(data: Buffer): readonly PngChunk[] {
  pngSize(data);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (chunks.at(-1)?.type !== 'IEND') {
    const chunk = checkedChunk(data, offset);
    chunks.push(chunk);
    offset += chunk.data.length + PNG_CHUNK_OVERHEAD;
  }
  if (offset !== data.length) {
    throw new IconInvalidError(
      'a PNG',
      `ending at its IEND chunk, byte ${String(offset)}`,
      `${String(data.length)} bytes`,
    );
  }
  return chunks;
}

function inflatedImage(chunks: readonly PngChunk[]): Buffer {
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data),
  );
  try {
    return inflateSync(compressed);
  } catch (error: unknown) {
    throw new IconInvalidError('the PNG image data', 'a zlib stream', String(error));
  }
}

export function assertCompletePng(data: Buffer): void {
  const chunks = pngChunks(data);
  const { width, height } = pngSize(data);
  const header = data.subarray(16, 29);
  const channels = CHANNELS_BY_COLOUR_TYPE.get(header.readUInt8(9));
  if (channels === undefined || header.readUInt8(12) !== 0) {
    throw new IconInvalidError(
      'a PNG',
      'non-interlaced with a known colour type',
      `colour type ${String(header.readUInt8(9))}, interlace ${String(header.readUInt8(12))}`,
    );
  }
  const rowBytes = Math.ceil((width * channels * header.readUInt8(8)) / 8);
  const expected = height * (rowBytes + 1);
  const actual = inflatedImage(chunks).length;
  if (actual !== expected) {
    throw new IconInvalidError(
      'the PNG image data',
      `${String(expected)} bytes once inflated`,
      `${String(actual)} bytes`,
    );
  }
}

function icoDimension(value: number): number {
  return value === 0 ? 256 : value;
}

export function icoEntries(ico: Buffer): readonly IcoEntry[] {
  if (ico.length < ICO_HEADER_LENGTH || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new IconInvalidError(
      'an ICO file',
      'an icon directory of type 1',
      `${String(ico.length)} bytes`,
    );
  }
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_unused, index) => {
    const entry = sliceWithin(
      ico,
      ICO_HEADER_LENGTH + index * ICO_ENTRY_LENGTH,
      ICO_ENTRY_LENGTH,
      `ICO directory entry ${String(index)}`,
    );
    return {
      width: icoDimension(entry.readUInt8(0)),
      height: icoDimension(entry.readUInt8(1)),
      data: sliceWithin(
        ico,
        entry.readUInt32LE(12),
        entry.readUInt32LE(8),
        `ICO image ${String(index)}`,
      ),
    };
  });
}

export interface IcnsChunk {
  readonly type: string;
  readonly data: Buffer;
}

export function icnsChunks(icns: Buffer): readonly IcnsChunk[] {
  if (icns.length < ICNS_HEADER_LENGTH || icns.toString('latin1', 0, 4) !== 'icns') {
    throw new IconInvalidError(
      'an ICNS file',
      'a file starting with icns',
      `${String(icns.length)} bytes`,
    );
  }
  if (icns.readUInt32BE(4) !== icns.length) {
    throw new IconInvalidError(
      'an ICNS file',
      `${String(icns.length)} bytes as its header declares`,
      `a header declaring ${String(icns.readUInt32BE(4))}`,
    );
  }
  const chunks: IcnsChunk[] = [];
  let offset = ICNS_HEADER_LENGTH;
  while (offset < icns.length) {
    const header = sliceWithin(icns, offset, ICNS_HEADER_LENGTH, `ICNS chunk at ${String(offset)}`);
    const length = header.readUInt32BE(4);
    if (length < ICNS_HEADER_LENGTH) {
      throw new IconInvalidError(
        `ICNS chunk at ${String(offset)}`,
        'at least its 8-byte header',
        String(length),
      );
    }
    const body = sliceWithin(icns, offset, length, `ICNS chunk ${header.toString('latin1', 0, 4)}`);
    chunks.push({
      type: header.toString('latin1', 0, 4),
      data: body.subarray(ICNS_HEADER_LENGTH),
    });
    offset += length;
  }
  return chunks;
}

export function linuxIconFrom(icns: Buffer): Buffer {
  const chunk = icnsChunks(icns).find((candidate) => candidate.type === LINUX_ICON_CHUNK);
  if (chunk === undefined) {
    throw new IconInvalidError('the ICNS file', `holding an ${LINUX_ICON_CHUNK} chunk`, 'none');
  }
  const size = pngSize(chunk.data);
  if (size.width !== LINUX_ICON_SIZE || size.height !== LINUX_ICON_SIZE) {
    throw new IconInvalidError(
      `the ${LINUX_ICON_CHUNK} chunk`,
      `${String(LINUX_ICON_SIZE)}x${String(LINUX_ICON_SIZE)}`,
      `${String(size.width)}x${String(size.height)}`,
    );
  }
  return chunk.data;
}

export interface RenderedIcons {
  readonly icns: Buffer;
  readonly ico: Buffer;
  readonly linux: Buffer;
}

function produced(format: string, output: Buffer | null, messages: readonly string[]): Buffer {
  if (output === null) {
    throw new IconInvalidError(
      `the generated ${format}`,
      'produced from the source PNG',
      `a failure: ${messages.join('; ')}`,
    );
  }
  return output;
}

export function renderIcons(source: Buffer): RenderedIcons {
  assertCompletePng(source);
  const size = pngSize(source);
  if (size.width !== size.height || size.width < 1024) {
    throw new IconInvalidError(
      'the source icon',
      'a square PNG of at least 1024x1024',
      `${String(size.width)}x${String(size.height)}`,
    );
  }
  const messages: string[] = [];
  setLogger((message: unknown, ...details: unknown[]) => {
    messages.push([message, ...details].map(String).join(' '));
  });
  const icns = produced('ICNS', createICNS(source, BICUBIC, LOSSLESS), messages);
  const ico = produced('ICO', createICO(source, BICUBIC, LOSSLESS, false, true), messages);
  return { icns, ico, linux: linuxIconFrom(icns) };
}

export interface IconPaths {
  readonly base: string;
  readonly icns: string;
  readonly ico: string;
  readonly linux: string;
}

export function iconPaths(outputDirectory: string): IconPaths {
  const base = path.join(outputDirectory, 'icon');
  return {
    base,
    icns: `${base}.icns`,
    ico: `${base}.ico`,
    linux: path.join(outputDirectory, `icon-${String(LINUX_ICON_SIZE)}.png`),
  };
}

export async function generateIcons(source: string, outputDirectory: string): Promise<IconPaths> {
  const rendered = renderIcons(await readFile(source));
  const paths = iconPaths(outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(paths.icns, rendered.icns),
    writeFile(paths.ico, rendered.ico),
    writeFile(paths.linux, rendered.linux),
  ]);
  return paths;
}
