import { createGunzip, type Gunzip } from 'node:zlib';
import { finished } from 'node:stream/promises';
import type { HomeMapScanFormat } from '@smarteverything/domain';

export type ScanVerdict =
  { readonly ok: true; readonly points: number } | { readonly ok: false; readonly problem: string };

export interface ScanValidator {
  readonly feed: (chunk: Uint8Array) => Promise<string | null>;
  readonly finish: () => Promise<ScanVerdict>;
  readonly cancel: () => void;
}

const refuse = (problem: string): ScanVerdict => ({ ok: false, problem });

const accept = (points: number): ScanVerdict => ({ ok: true, points });

export const PLY_HEADER_LIMIT = 65536;

const SPLAT_RECORD_BYTES = 32;

const PLY_TYPE_BYTES: Readonly<Record<string, number>> = {
  char: 1,
  int8: 1,
  uchar: 1,
  uint8: 1,
  short: 2,
  int16: 2,
  ushort: 2,
  uint16: 2,
  int: 4,
  int32: 4,
  uint: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8,
};

const GAUSSIAN_PROPERTIES = [
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

const FLOAT_TYPES = new Set(['float', 'float32']);

const COUNT = /^[1-9]\d*$/;

export interface PlyLayout {
  readonly vertices: number;
  readonly stride: number;
}

class PlyHeaderReader {
  private lines = 0;
  private binary = false;
  private vertices: number | null = null;
  private inVertex = false;
  private stride = 0;
  private readonly types = new Map<string, string>();

  line(text: string): string | null {
    const first = this.lines === 0;
    this.lines += 1;
    if (first) return text === 'ply' ? null : 'the file does not start with the ply header';
    const [word = '', ...rest] = text.split(/\s+/);
    if (word === 'comment' || word === 'obj_info') return null;
    if (word === 'format') return this.format(rest);
    if (word === 'element') return this.element(rest);
    if (word === 'property') return this.property(rest);
    return `the header line "${text}" is not understood`;
  }

  layout(): PlyLayout | string {
    if (!this.binary) return 'the header has no binary_little_endian format line';
    if (this.vertices === null) return 'the header has no vertex element';
    const missing = GAUSSIAN_PROPERTIES.filter((name) => !this.types.has(name));
    if (missing.length > 0) return `the vertex lacks the gaussian properties ${missing.join(', ')}`;
    const notFloat = GAUSSIAN_PROPERTIES.filter(
      (name) => !FLOAT_TYPES.has(this.types.get(name) ?? ''),
    );
    if (notFloat.length > 0) return `the gaussian properties ${notFloat.join(', ')} are not float`;
    return { vertices: this.vertices, stride: this.stride };
  }

  private format(rest: readonly string[]): string | null {
    if (rest.join(' ') !== 'binary_little_endian 1.0') {
      return 'only "format binary_little_endian 1.0" is supported';
    }
    this.binary = true;
    return null;
  }

  private element(rest: readonly string[]): string | null {
    const [name = '', count = ''] = rest;
    if (name !== 'vertex') return `the element "${name}" is not supported, only vertex`;
    if (this.vertices !== null) return 'the header has two vertex elements';
    if (!COUNT.test(count)) return `the vertex count "${count}" is not a positive whole number`;
    this.vertices = Number(count);
    this.inVertex = true;
    return null;
  }

  private property(rest: readonly string[]): string | null {
    const [type = '', name = '', ...extra] = rest;
    if (!this.inVertex) return 'a property comes before the vertex element';
    if (type === 'list') return 'list properties are not supported';
    const bytes = Object.hasOwn(PLY_TYPE_BYTES, type) ? PLY_TYPE_BYTES[type] : undefined;
    if (bytes === undefined || name === '' || extra.length > 0) {
      return `the property line "property ${rest.join(' ')}" is not valid`;
    }
    if (this.types.has(name)) return `the property ${name} appears twice`;
    this.types.set(name, type);
    this.stride += bytes;
    return null;
  }
}

export function parsePlyHeader(text: string): PlyLayout | string {
  const reader = new PlyHeaderReader();
  for (const line of text.replace(/\r?\n$/, '').split(/\r?\n/)) {
    const problem = reader.line(line);
    if (problem !== null) return problem;
  }
  return reader.layout();
}

const END_MARK = Buffer.from('end_header');

function headerEnd(head: Buffer): { readonly text: string; readonly body: number } | null {
  const mark = head.indexOf(END_MARK);
  if (mark < 0) return null;
  const after = mark + END_MARK.length;
  const newline = head[after] === 0x0d ? after + 1 : after;
  if (head.length <= newline || head[newline] !== 0x0a) return null;
  return { text: head.subarray(0, mark).toString('latin1'), body: newline + 1 };
}

class PlyValidator implements ScanValidator {
  private head: Buffer = Buffer.alloc(0);
  private layout: PlyLayout | null = null;
  private body = 0;

  feed(chunk: Uint8Array): Promise<string | null> {
    return Promise.resolve(this.layout === null ? this.header(chunk) : this.add(chunk.byteLength));
  }

  finish(): Promise<ScanVerdict> {
    if (this.layout === null) return Promise.resolve(refuse('the file ends inside the ply header'));
    const { vertices, stride } = this.layout;
    const need = vertices * stride;
    return Promise.resolve(
      this.body === need
        ? accept(vertices)
        : refuse(
            `the body has ${String(this.body)} bytes but ${String(vertices)} vertices of ${String(stride)} bytes need ${String(need)}`,
          ),
    );
  }

  cancel(): void {
    this.head = Buffer.alloc(0);
  }

  private header(chunk: Uint8Array): string | null {
    this.head = Buffer.concat([this.head, chunk]);
    const magic = this.head.subarray(0, 3).toString('latin1');
    if (!'ply'.startsWith(magic)) return 'the file does not start with the ply header';
    const end = headerEnd(this.head);
    if (end === null) {
      return this.head.length > PLY_HEADER_LIMIT
        ? `the ply header does not end within ${String(PLY_HEADER_LIMIT)} bytes`
        : null;
    }
    const layout = parsePlyHeader(end.text);
    if (typeof layout === 'string') return layout;
    this.layout = layout;
    const bodyBytes = this.head.length - end.body;
    this.head = Buffer.alloc(0);
    return this.add(bodyBytes);
  }

  private add(bytes: number): string | null {
    this.body += bytes;
    if (this.layout === null) return null;
    const need = this.layout.vertices * this.layout.stride;
    return this.body > need
      ? `the body is longer than the ${String(need)} bytes its header declares`
      : null;
  }
}

class SplatValidator implements ScanValidator {
  private total = 0;

  feed(chunk: Uint8Array): Promise<string | null> {
    this.total += chunk.byteLength;
    return Promise.resolve(null);
  }

  finish(): Promise<ScanVerdict> {
    if (this.total === 0) return Promise.resolve(refuse('the file is empty'));
    if (this.total % SPLAT_RECORD_BYTES !== 0) {
      return Promise.resolve(
        refuse(
          `${String(this.total)} bytes is not a whole number of ${String(SPLAT_RECORD_BYTES)} byte splats`,
        ),
      );
    }
    return Promise.resolve(accept(this.total / SPLAT_RECORD_BYTES));
  }

  cancel(): void {
    this.total = 0;
  }
}

const SPZ_MAGIC = 0x5053474e;

const SPZ_HEADER_BYTES = 16;

const SPZ_SH_COEFFICIENTS = [0, 3, 8, 15] as const;

interface SpzLayout {
  readonly points: number;
  readonly total: number;
}

function spzLayout(header: Buffer): SpzLayout | string {
  if (header.readUInt32LE(0) !== SPZ_MAGIC) return 'the SPZ header magic is wrong';
  const version = header.readUInt32LE(4);
  if (version < 1 || version > 3) return `the SPZ version ${String(version)} is not supported`;
  const points = header.readUInt32LE(8);
  const degree = header.readUInt8(12);
  const coefficients = SPZ_SH_COEFFICIENTS[degree];
  if (coefficients === undefined)
    return `the SPZ spherical harmonics degree ${String(degree)} is not valid`;
  if (points === 0) return 'the SPZ file has no points';
  const position = version === 1 ? 6 : 9;
  const rotation = version >= 3 ? 4 : 3;
  const perPoint = position + 1 + 3 + 3 + rotation + coefficients * 3;
  return { points, total: SPZ_HEADER_BYTES + points * perPoint };
}

class SpzValidator implements ScanValidator {
  private readonly gunzip: Gunzip = createGunzip();
  private readonly done: Promise<void>;
  private magic: Buffer = Buffer.alloc(0);
  private head: Buffer = Buffer.alloc(0);
  private layout: SpzLayout | null = null;
  private inflated = 0;
  private failure: string | null = null;

  constructor() {
    this.gunzip.on('data', (chunk: Buffer) => {
      this.inflate(chunk);
    });
    this.gunzip.on('error', (error: Error) => {
      this.failure ??= `the gzip stream is damaged or cut off (${error.message})`;
    });
    this.done = finished(this.gunzip).then(
      () => undefined,
      () => undefined,
    );
  }

  async feed(chunk: Uint8Array): Promise<string | null> {
    if (this.magic.length < 2) {
      this.magic = Buffer.concat([this.magic, chunk.subarray(0, 2 - this.magic.length)]);
      if (this.magic.length === 2 && (this.magic[0] !== 0x1f || this.magic[1] !== 0x8b)) {
        return 'the file does not start with the gzip magic';
      }
    }
    if (this.failure === null) {
      await new Promise<void>((resolve) => {
        this.gunzip.write(chunk, () => {
          resolve();
        });
      });
    }
    return this.failure;
  }

  async finish(): Promise<ScanVerdict> {
    if (this.magic.length < 2) return refuse('the file is too short to be gzip');
    this.gunzip.end();
    await this.done;
    if (this.failure !== null) return refuse(this.failure);
    if (this.layout === null) return refuse('the SPZ file ends inside its header');
    return this.inflated === this.layout.total
      ? accept(this.layout.points)
      : refuse(
          `the SPZ body has ${String(this.inflated)} bytes but ${String(this.layout.points)} points need ${String(this.layout.total)}`,
        );
  }

  cancel(): void {
    this.gunzip.destroy();
  }

  private inflate(chunk: Buffer): void {
    if (this.failure !== null) return;
    this.inflated += chunk.byteLength;
    if (this.head.length < SPZ_HEADER_BYTES) {
      this.head = Buffer.concat([
        this.head,
        chunk.subarray(0, SPZ_HEADER_BYTES - this.head.length),
      ]);
      if (this.head.length === SPZ_HEADER_BYTES) this.readHeader();
    }
    if (this.layout !== null && this.inflated > this.layout.total) {
      this.failure = `the SPZ body is longer than the ${String(this.layout.total)} bytes its header declares`;
    }
  }

  private readHeader(): void {
    const layout = spzLayout(this.head);
    if (typeof layout === 'string') this.failure = layout;
    else this.layout = layout;
  }
}

class RefusedValidator implements ScanValidator {
  constructor(private readonly problem: string) {}

  feed(): Promise<string | null> {
    return Promise.resolve(this.problem);
  }

  finish(): Promise<ScanVerdict> {
    return Promise.resolve(refuse(this.problem));
  }

  cancel(): void {
    return undefined;
  }
}

export function createScanValidator(format: HomeMapScanFormat): ScanValidator {
  switch (format) {
    case 'ply':
      return new PlyValidator();
    case 'splat':
      return new SplatValidator();
    case 'spz':
      return new SpzValidator();
    case 'rad':
      return new RefusedValidator(
        'a .rad file is made by the hub from your upload; send the .ply, .splat or .spz file',
      );
  }
}
