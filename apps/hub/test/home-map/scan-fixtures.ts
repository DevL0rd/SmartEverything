import { writeFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';

const GAUSSIAN = [
  'x',
  'y',
  'z',
  'f_dc_0',
  'f_dc_1',
  'f_dc_2',
  'opacity',
  'scale_0',
  'scale_1',
  'scale_2',
  'rot_0',
  'rot_1',
  'rot_2',
  'rot_3',
] as const;

export interface PlyOptions {
  readonly properties?: readonly string[];
  readonly format?: string;
  readonly extraLines?: readonly string[];
  readonly bodyBytes?: number;
}

export function plyFile(vertices: number, options: PlyOptions = {}): Buffer {
  const properties = options.properties ?? GAUSSIAN;
  const header = [
    'ply',
    `format ${options.format ?? 'binary_little_endian 1.0'}`,
    'comment synthetic test splats',
    `element vertex ${String(vertices)}`,
    ...properties.map((name) => `property float ${name}`),
    ...(options.extraLines ?? []),
    'end_header',
    '',
  ].join('\n');
  const body = Buffer.alloc(options.bodyBytes ?? vertices * properties.length * 4, 0x3c);
  return Buffer.concat([Buffer.from(header, 'latin1'), body]);
}

export const splatFile = (splats: number): Buffer => Buffer.alloc(splats * 32, 0x11);

export interface SpzOptions {
  readonly version?: number;
  readonly degree?: number;
  readonly bodyBytes?: number;
  readonly magic?: number;
}

const SH = [0, 3, 8, 15] as const;

export function spzFile(points: number, options: SpzOptions = {}): Buffer {
  const version = options.version ?? 2;
  const degree = options.degree ?? 0;
  const header = Buffer.alloc(16);
  header.writeUInt32LE(options.magic ?? 0x5053474e, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(points, 8);
  header.writeUInt8(degree, 12);
  header.writeUInt8(12, 13);
  const position = version === 1 ? 6 : 9;
  const rotation = version >= 3 ? 4 : 3;
  const perPoint = position + 7 + rotation + (SH[degree] ?? 0) * 3;
  const body = Buffer.alloc(options.bodyBytes ?? points * perPoint, 0x22);
  return gzipSync(Buffer.concat([header, body]));
}

export function blackHole(path: string): Writable {
  writeFileSync(path, 'partial');
  return new Writable({
    write(_chunk, _encoding, done): void {
      done();
    },
  });
}

export function fullDisk(path: string): Writable {
  writeFileSync(path, 'partial');
  return new Writable({
    write(_chunk, _encoding, done): void {
      done(Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }));
    },
  });
}
