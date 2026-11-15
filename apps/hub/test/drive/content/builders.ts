import { crc32, deflateRawSync } from 'node:zlib';
import sharp from 'sharp';

export interface ZipFileSpec {
  readonly name: string;
  readonly data?: Uint8Array | string;
  readonly method?: 'stored' | 'deflated';
  readonly encrypted?: boolean;
  readonly folder?: boolean;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const END64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const MARK32 = 0xffffffff;
const MARK16 = 0xffff;

function dataOf(spec: ZipFileSpec): Buffer {
  return Buffer.from(spec.data ?? '');
}

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

function u64(value: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

interface Packed {
  readonly name: Buffer;
  readonly raw: Buffer;
  readonly body: Buffer;
  readonly flags: number;
  readonly method: number;
}

function packed(spec: ZipFileSpec): Packed {
  const raw = dataOf(spec);
  const deflated = spec.method === 'deflated';
  return {
    name: Buffer.from(spec.folder === true ? `${spec.name}/` : spec.name, 'utf8'),
    raw,
    body: deflated ? deflateRawSync(raw) : raw,
    flags: (spec.encrypted === true ? 1 : 0) | 0x0800,
    method: deflated ? 8 : 0,
  };
}

function sizeFields(file: Packed, wide: boolean): readonly [number, number] {
  return wide ? [MARK32, MARK32] : [file.body.length, file.raw.length];
}

function localRecord(file: Packed, wide: boolean): Buffer {
  const extra = wide
    ? Buffer.concat([u16(1), u16(16), u64(file.raw.length), u64(file.body.length)])
    : Buffer.alloc(0);
  const [compressed, uncompressed] = sizeFields(file, wide);
  return Buffer.concat([
    u32(LOCAL),
    u16(wide ? 45 : 20),
    u16(file.flags),
    u16(file.method),
    u16(0x6000),
    u16(0x5a21),
    u32(crc32(file.raw)),
    u32(compressed),
    u32(uncompressed),
    u16(file.name.length),
    u16(extra.length),
    file.name,
    extra,
    file.body,
  ]);
}

function centralRecord(file: Packed, wide: boolean, offset: number): Buffer {
  const extra = wide
    ? Buffer.concat([u16(1), u16(24), u64(file.raw.length), u64(file.body.length), u64(offset)])
    : Buffer.alloc(0);
  const [compressed, uncompressed] = sizeFields(file, wide);
  return Buffer.concat([
    u32(CENTRAL),
    u16(wide ? 45 : 20),
    u16(wide ? 45 : 20),
    u16(file.flags),
    u16(file.method),
    u16(0x6000),
    u16(0x5a21),
    u32(crc32(file.raw)),
    u32(compressed),
    u32(uncompressed),
    u16(file.name.length),
    u16(extra.length),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(wide ? MARK32 : offset),
    file.name,
    extra,
  ]);
}

function endRecords(count: number, directory: Buffer, directoryAt: number, wide: boolean): Buffer {
  const classic = Buffer.concat([
    u32(END),
    u16(0),
    u16(0),
    u16(wide ? MARK16 : count),
    u16(wide ? MARK16 : count),
    u32(wide ? MARK32 : directory.length),
    u32(wide ? MARK32 : directoryAt),
    u16(0),
  ]);
  if (!wide) return classic;
  const end64At = directoryAt + directory.length;
  return Buffer.concat([
    u32(END64),
    u64(44),
    u16(45),
    u16(45),
    u32(0),
    u32(0),
    u64(count),
    u64(count),
    u64(directory.length),
    u64(directoryAt),
    u32(LOCATOR64),
    u32(0),
    u64(end64At),
    u32(1),
    classic,
  ]);
}

export function zipOf(files: readonly ZipFileSpec[], options: { zip64?: boolean } = {}): Buffer {
  const wide = options.zip64 === true;
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const spec of files) {
    const file = packed(spec);
    const local = localRecord(file, wide);
    central.push(centralRecord(file, wide, offset));
    parts.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  return Buffer.concat([...parts, directory, endRecords(files.length, directory, offset, wide)]);
}

export async function pngOf(
  width: number,
  height: number,
  rgba: readonly number[],
): Promise<Buffer> {
  return sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

export function solid(
  width: number,
  height: number,
  colour: readonly [number, number, number, number],
): number[] {
  return Array.from({ length: width * height }, () => [...colour]).flat();
}

export interface IcoImage {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
  readonly bitCount: number;
}

export function icoOf(images: readonly IcoImage[]): Buffer {
  const header = Buffer.concat([u16(0), u16(1), u16(images.length)]);
  let offset = 6 + images.length * 16;
  const entries: Buffer[] = [];
  for (const image of images) {
    entries.push(
      Buffer.concat([
        Buffer.from([
          image.width === 256 ? 0 : image.width,
          image.height === 256 ? 0 : image.height,
          0,
          0,
        ]),
        u16(1),
        u16(image.bitCount),
        u32(image.data.length),
        u32(offset),
      ]),
    );
    offset += image.data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

export interface DibSpec {
  readonly width: number;
  readonly height: number;
  readonly bits: 8 | 24 | 32;
  readonly pixel: (x: number, y: number) => readonly [number, number, number, number];
  readonly palette?: readonly (readonly [number, number, number])[];
}

export function dibOf({ width, height, bits, pixel, palette = [] }: DibSpec): Buffer {
  const paletteBytes = bits === 8 ? 256 * 4 : 0;
  const rowBytes = Math.ceil((width * bits) / 32) * 4;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(width, 4);
  info.writeInt32LE(height * 2, 8);
  info.writeUInt16LE(1, 12);
  info.writeUInt16LE(bits, 14);
  info.writeUInt32LE(bits === 8 ? 256 : 0, 32);
  const colours = Buffer.alloc(paletteBytes);
  palette.forEach(([r, g, b], index) => {
    colours[index * 4] = b;
    colours[index * 4 + 1] = g;
    colours[index * 4 + 2] = r;
  });
  const pixels = Buffer.alloc(rowBytes * height);
  const mask = Buffer.alloc(maskRowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const row = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      if (bits === 8) {
        pixels[row * rowBytes + x] = r;
      } else {
        const at = row * rowBytes + x * (bits / 8);
        pixels[at] = b;
        pixels[at + 1] = g;
        pixels[at + 2] = r;
        if (bits === 32) pixels[at + 3] = a;
      }
      if (a === 0)
        mask[row * maskRowBytes + (x >> 3)] =
          (mask[row * maskRowBytes + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
    }
  }
  return Buffer.concat([info, colours, pixels, mask]);
}

function icnsElement(type: string, data: Buffer): Buffer {
  return Buffer.concat([Buffer.from(type, 'latin1'), u32Be(data.length + 8), data]);
}

function u32Be(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

export function icnsOf(
  elements: readonly { readonly type: string; readonly data: Buffer }[],
): Buffer {
  const body = Buffer.concat(elements.map((element) => icnsElement(element.type, element.data)));
  return Buffer.concat([Buffer.from('icns', 'latin1'), u32Be(body.length + 8), body]);
}

export function appleDoubleOf(icns: Buffer): Buffer {
  const typeCount = 1;
  const dataBlock = Buffer.concat([u32Be(icns.length), icns]);
  const dataOffset = 256;
  const mapOffset = dataOffset + dataBlock.length;
  const typeListOffset = 28;
  const map = Buffer.alloc(typeListOffset + 2 + 8 + 12);
  map.writeUInt16BE(typeListOffset, 24);
  map.writeUInt16BE(typeCount - 1, typeListOffset);
  map.write('icns', typeListOffset + 2, 'latin1');
  map.writeUInt16BE(0, typeListOffset + 6);
  map.writeUInt16BE(10, typeListOffset + 8);
  map.writeInt16BE(-16455, typeListOffset + 10);
  map.writeUInt16BE(0xffff, typeListOffset + 12);
  map.writeUInt32BE(0, typeListOffset + 14);
  const fork = Buffer.alloc(dataOffset);
  fork.writeUInt32BE(dataOffset, 0);
  fork.writeUInt32BE(mapOffset, 4);
  fork.writeUInt32BE(dataBlock.length, 8);
  fork.writeUInt32BE(map.length, 12);
  const resource = Buffer.concat([fork, dataBlock, map]);
  const header = Buffer.alloc(26 + 12);
  header.writeUInt32BE(0x00051607, 0);
  header.writeUInt32BE(0x00020000, 4);
  header.writeUInt16BE(1, 24);
  header.writeUInt32BE(2, 26);
  header.writeUInt32BE(38 + 0, 30);
  header.writeUInt32BE(resource.length, 34);
  return Buffer.concat([header, resource]);
}

export function pdfOf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
