import { closeSync, openSync, readFileSync, readSync } from 'node:fs';

export type BinaryArch = 'x64' | 'arm64';
export type GlibcVersion = readonly [number, number];

export const ELF_MACHINE_BY_ARCH: Readonly<Record<BinaryArch, number>> = { x64: 62, arm64: 183 };

const HEADER_BYTES = 20;
const ELF_MAGIC = 0x7f454c46;
const ELF_LITTLE_ENDIAN = 1;
const ELF_DATA_OFFSET = 5;
const ELF_MACHINE_OFFSET = 18;
const WASM_HEADER = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const GLIBC_PREFIX = 'GLIBC_';
const GLIBC_VERSION = /^(\d+)\.(\d+)/u;
const GLIBC_VERSION_BYTES = 12;

function readHeader(file: string): Buffer {
  const descriptor = openSync(file, 'r');
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    return header.subarray(0, readSync(descriptor, header, 0, HEADER_BYTES, 0));
  } finally {
    closeSync(descriptor);
  }
}

export function elfMachine(file: string): number | undefined {
  const header = readHeader(file);
  if (header.length < HEADER_BYTES || header.readUInt32BE(0) !== ELF_MAGIC) return undefined;
  if (header[ELF_DATA_OFFSET] !== ELF_LITTLE_ENDIAN) return undefined;
  return header.readUInt16LE(ELF_MACHINE_OFFSET);
}

export function archOfElfMachine(machine: number): BinaryArch | undefined {
  return (['x64', 'arm64'] as const).find((arch) => ELF_MACHINE_BY_ARCH[arch] === machine);
}

export function isWasmModule(file: string): boolean {
  return readHeader(file).subarray(0, WASM_HEADER.length).equals(WASM_HEADER);
}

export function isNewerGlibc(left: GlibcVersion, right: GlibcVersion): boolean {
  return left[0] === right[0] ? left[1] > right[1] : left[0] > right[0];
}

export function highestGlibc(file: string): GlibcVersion | undefined {
  const bytes = readFileSync(file);
  let highest: GlibcVersion | undefined;
  for (let at = bytes.indexOf(GLIBC_PREFIX); at !== -1; at = bytes.indexOf(GLIBC_PREFIX, at + 1)) {
    const start = at + GLIBC_PREFIX.length;
    const match = GLIBC_VERSION.exec(bytes.toString('latin1', start, start + GLIBC_VERSION_BYTES));
    if (match === null) continue;
    const found: GlibcVersion = [Number(match[1]), Number(match[2])];
    if (highest === undefined || isNewerGlibc(found, highest)) highest = found;
  }
  return highest;
}
