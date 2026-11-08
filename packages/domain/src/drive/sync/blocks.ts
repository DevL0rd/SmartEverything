export const MIN_BLOCK_SIZE = 128 * 1024;
export const MAX_BLOCK_SIZE = 16 * 1024 * 1024;
export const MAX_BLOCK_COUNT = 2000;
export const HASH_BYTES = 32;

const HASH_HEX = /^[0-9a-f]{64}$/;
const PACKED_HEX = /^(?:[0-9a-f]{64})*$/;

export function isValidBlockSize(size: number): boolean {
  return (
    Number.isInteger(size) &&
    size >= MIN_BLOCK_SIZE &&
    size <= MAX_BLOCK_SIZE &&
    (size & (size - 1)) === 0
  );
}

export function blockCount(bytes: number, blockSize: number): number {
  if (!isValidBlockSize(blockSize)) throw new RangeError(`invalid block size ${String(blockSize)}`);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError('invalid byte length');
  return Math.ceil(bytes / blockSize);
}

export function blockSizeFor(bytes: number): number {
  let size = MIN_BLOCK_SIZE;
  while (size < MAX_BLOCK_SIZE && blockCount(bytes, size) >= MAX_BLOCK_COUNT) size *= 2;
  return size;
}

export interface BlockRange {
  readonly start: number;
  readonly end: number;
}

export function blockRange(bytes: number, blockSize: number, index: number): BlockRange {
  const count = blockCount(bytes, blockSize);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`block ${String(index)} is outside 0..${String(count)}`);
  }
  return { start: index * blockSize, end: Math.min(bytes, (index + 1) * blockSize) };
}

export function isPackedHashes(packed: string): boolean {
  return PACKED_HEX.test(packed);
}

export function packHashes(hashes: readonly string[]): string {
  for (const hash of hashes) {
    if (!HASH_HEX.test(hash))
      throw new RangeError('block hash must be 64 lowercase hex characters');
  }
  return hashes.join('');
}

export function unpackHashes(packed: string): readonly string[] {
  if (!isPackedHashes(packed)) throw new RangeError('packed hashes must be 32-byte lowercase hex');
  const hashes: string[] = [];
  for (let at = 0; at < packed.length; at += HASH_BYTES * 2) {
    hashes.push(packed.slice(at, at + HASH_BYTES * 2));
  }
  return hashes;
}

export function packedHashCount(packed: string): number {
  return packed.length / (HASH_BYTES * 2);
}

export function packedToBytes(packed: string): Uint8Array {
  if (!isPackedHashes(packed)) throw new RangeError('packed hashes must be 32-byte lowercase hex');
  const bytes = new Uint8Array(packed.length / 2);
  for (let at = 0; at < bytes.length; at += 1) {
    bytes[at] = Number.parseInt(packed.slice(at * 2, at * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToPacked(bytes: Uint8Array): string {
  if (bytes.length % HASH_BYTES !== 0)
    throw new RangeError('packed hashes must be whole 32-byte hashes');
  let packed = '';
  for (const byte of bytes) packed += byte.toString(16).padStart(2, '0');
  return packed;
}

export function packedMatchesSize(packed: string, bytes: number, blockSize: number): boolean {
  return (
    isValidBlockSize(blockSize) &&
    isPackedHashes(packed) &&
    packedHashCount(packed) === blockCount(bytes, blockSize)
  );
}
