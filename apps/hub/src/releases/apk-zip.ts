import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { ApkFactsError } from './apk-error';

const END_RECORD_SIZE = 22;
const END_RECORD_MAGIC = 0x06054b50;
const ZIP64_LOCATOR_MAGIC = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP32_LIMIT = 0xffffffff;
const ZIP16_LIMIT = 0xffff;
const BLOCK_MAGIC = Buffer.from('APK Sig Block 42', 'latin1');
const BLOCK_FOOTER = 24;
const PAIR_HEADER = 12;
const CHUNK_BYTES = 1024 * 1024;

export type DigestHash = 'sha256' | 'sha512';

interface CentralDirectory {
  readonly size: number;
  readonly centralStart: number;
  readonly endRecordStart: number;
  readonly endRecord: Buffer;
}

export interface ZipLayout extends CentralDirectory {
  readonly blockStart: number;
  readonly pairs: Buffer;
}

export function malformedBlock(message: string): never {
  throw new ApkFactsError('signing_block', `The APK signing block is malformed: ${message}.`);
}

async function readInto(file: FileHandle, buffer: Buffer, position: number): Promise<Buffer> {
  let done = 0;
  while (done < buffer.length) {
    const { bytesRead } = await file.read(buffer, done, buffer.length - done, position + done);
    if (bytesRead === 0)
      throw new ApkFactsError('not_zip', 'The APK ended early while reading it.');
    done += bytesRead;
  }
  return buffer;
}

function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  return readInto(file, Buffer.alloc(length), position);
}

async function isZip64(
  file: FileHandle,
  endRecord: Buffer,
  endRecordStart: number,
): Promise<boolean> {
  if (
    endRecord.readUInt16LE(10) === ZIP16_LIMIT ||
    endRecord.readUInt32LE(12) === ZIP32_LIMIT ||
    endRecord.readUInt32LE(16) === ZIP32_LIMIT
  )
    return true;
  if (endRecordStart < ZIP64_LOCATOR_SIZE) return false;
  const locator = await readAt(file, endRecordStart - ZIP64_LOCATOR_SIZE, 4);
  return locator.readUInt32LE(0) === ZIP64_LOCATOR_MAGIC;
}

function checkEndRecord(endRecord: Buffer): void {
  if (endRecord.readUInt32LE(0) !== END_RECORD_MAGIC || endRecord.readUInt16LE(20) !== 0)
    throw new ApkFactsError(
      'zip_comment',
      'The APK must end with the ZIP end record and carry no ZIP comment.',
    );
  if (endRecord.readUInt16LE(4) !== 0 || endRecord.readUInt16LE(6) !== 0)
    throw new ApkFactsError('not_zip', 'The APK is a multi-disk ZIP.');
  if (endRecord.readUInt16LE(8) !== endRecord.readUInt16LE(10))
    throw new ApkFactsError('not_zip', 'The APK end record counts its entries twice differently.');
}

async function centralDirectory(file: FileHandle): Promise<CentralDirectory> {
  const { size } = await file.stat();
  if (size < END_RECORD_SIZE)
    throw new ApkFactsError('not_zip', 'The APK is too small to be a ZIP.');
  const endRecordStart = size - END_RECORD_SIZE;
  const endRecord = await readAt(file, endRecordStart, END_RECORD_SIZE);
  checkEndRecord(endRecord);
  if (await isZip64(file, endRecord, endRecordStart))
    throw new ApkFactsError('zip64', 'The APK is a ZIP64 archive, which Android does not accept.');
  const centralStart = endRecord.readUInt32LE(16);
  if (centralStart + endRecord.readUInt32LE(12) !== endRecordStart)
    throw new ApkFactsError(
      'not_zip',
      'The APK central directory does not end where the end record starts.',
    );
  return { size, centralStart, endRecordStart, endRecord };
}

export async function zipLayout(file: FileHandle): Promise<ZipLayout> {
  const central = await centralDirectory(file);
  const { centralStart } = central;
  if (centralStart < BLOCK_FOOTER + 8)
    throw new ApkFactsError('unsigned', 'The APK has no APK signing block.');
  const footer = await readAt(file, centralStart - BLOCK_FOOTER, BLOCK_FOOTER);
  if (!footer.subarray(8).equals(BLOCK_MAGIC))
    throw new ApkFactsError('unsigned', 'The APK has no APK signing block (v2 or v3 signature).');
  const declared = footer.readBigUInt64LE(0);
  if (declared < BigInt(BLOCK_FOOTER) || declared + 8n > BigInt(centralStart))
    malformedBlock('its size does not fit before the central directory');
  const blockSize = Number(declared);
  const blockStart = centralStart - blockSize - 8;
  const block = await readAt(file, blockStart, blockSize + 8);
  if (block.readBigUInt64LE(0) !== declared) malformedBlock('its two size fields differ');
  return { ...central, blockStart, pairs: block.subarray(8, block.length - BLOCK_FOOTER) };
}

export function pairsOf(region: Buffer): ReadonlyMap<number, Buffer> {
  const pairs = new Map<number, Buffer>();
  let at = 0;
  while (at < region.length) {
    if (at + PAIR_HEADER > region.length) malformedBlock('a pair header runs past the block');
    const length = region.readBigUInt64LE(at);
    if (length < 4n || BigInt(at + 8) + length > BigInt(region.length))
      malformedBlock('a pair runs past the block');
    const id = region.readUInt32LE(at + 8);
    if (pairs.has(id)) malformedBlock('a pair appears twice');
    const end = at + 8 + Number(length);
    pairs.set(id, region.subarray(at + PAIR_HEADER, end));
    at = end;
  }
  return pairs;
}

function counted(prefix: number, length: number): Buffer {
  const bytes = Buffer.alloc(5);
  bytes.writeUInt8(prefix, 0);
  bytes.writeUInt32LE(length, 1);
  return bytes;
}

function chunkDigest(hash: DigestHash, data: Buffer): Buffer {
  return createHash(hash).update(counted(0xa5, data.length)).update(data).digest();
}

export async function contentDigests(
  file: FileHandle,
  layout: ZipLayout,
  hashes: ReadonlySet<DigestHash>,
): Promise<ReadonlyMap<DigestHash, Buffer>> {
  const chunks = new Map<DigestHash, Buffer[]>([...hashes].map((hash) => [hash, []]));
  const add = (data: Buffer): void => {
    for (const [hash, list] of chunks) list.push(chunkDigest(hash, data));
  };
  const buffer = Buffer.alloc(CHUNK_BYTES);
  const sections = [
    [0, layout.blockStart],
    [layout.centralStart, layout.endRecordStart],
  ] as const;
  for (const [start, end] of sections)
    for (let at = start; at < end; at += CHUNK_BYTES)
      add(await readInto(file, buffer.subarray(0, Math.min(CHUNK_BYTES, end - at)), at));
  const endRecord = Buffer.from(layout.endRecord);
  endRecord.writeUInt32LE(layout.blockStart, 16);
  add(endRecord);
  return new Map(
    [...chunks].map(([hash, list]) => [
      hash,
      createHash(hash).update(counted(0x5a, list.length)).update(Buffer.concat(list)).digest(),
    ]),
  );
}
