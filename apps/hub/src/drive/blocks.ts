import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { blockSizeFor } from '@smarteverything/domain/drive-sync';
import { z } from 'zod';
import { fsCode } from '../fs-code';
import { packBlockHashes } from '../store/repositories/drive-blocks';
import { DrivePathError, openResolved, resolveInRoot } from './paths';

const WHOLE_FILE_CHUNK = 1024 * 1024;

const COUNT = z.int().nonnegative();
const DIGITS = z.string().regex(/^\d+$/);
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const HASH_REQUEST = z.strictObject({
  id: COUNT,
  rootPath: z.string().min(1),
  relPath: z.string().min(1),
  dev: DIGITS,
  ino: DIGITS,
  withBlocks: z.boolean(),
});

export type HashRequest = z.infer<typeof HASH_REQUEST>;

const BLOCKS = z.strictObject({
  blockSize: COUNT,
  hashes: z.instanceof(Uint8Array),
});

export const HASH_RESPONSE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('hashed'),
    id: COUNT,
    sha256: SHA256,
    bytes: COUNT,
    modifiedMs: z.number().nonnegative(),
    blocks: BLOCKS.nullable(),
  }),
  z.strictObject({
    kind: z.literal('skipped'),
    id: COUNT,
    reason: z.enum(['missing', 'changed', 'unreadable']),
    code: z.string().min(1),
  }),
]);

export type HashResponse = z.infer<typeof HASH_RESPONSE>;

type HashedBlocks = NonNullable<Extract<HashResponse, { readonly kind: 'hashed' }>['blocks']>;

export interface BlockHashes {
  readonly blockSize: number;
  readonly hashes: Uint8Array;
}

export interface FileHash {
  readonly sha256: string;
  readonly bytes: number;
  readonly blocks: BlockHashes | null;
}

async function fill(handle: FileHandle, buffer: Buffer, position: number): Promise<number> {
  let filled = 0;
  while (filled < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      filled,
      buffer.length - filled,
      position + filled,
    );
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return filled;
}

export async function hashHandle(
  handle: FileHandle,
  size: number,
  withBlocks: boolean,
): Promise<FileHash> {
  const blockSize = withBlocks ? blockSizeFor(size) : WHOLE_FILE_CHUNK;
  const buffer = Buffer.allocUnsafe(blockSize);
  const whole = createHash('sha256');
  const digests: Uint8Array[] = [];
  let bytes = 0;
  let filled = await fill(handle, buffer, bytes);
  while (filled > 0) {
    const chunk = buffer.subarray(0, filled);
    whole.update(chunk);
    if (withBlocks) digests.push(createHash('sha256').update(chunk).digest());
    bytes += filled;
    filled = await fill(handle, buffer, bytes);
  }
  return {
    sha256: whole.digest('hex'),
    bytes,
    blocks: withBlocks ? { blockSize, hashes: packBlockHashes(digests) } : null,
  };
}

function skipped(
  request: HashRequest,
  reason: 'missing' | 'changed' | 'unreadable',
  code: string,
): HashResponse {
  return { kind: 'skipped', id: request.id, reason, code };
}

function failure(request: HashRequest, cause: unknown): HashResponse {
  if (cause instanceof DrivePathError) {
    return skipped(request, cause.failure === 'missing' ? 'missing' : 'changed', cause.failure);
  }
  const code = fsCode(cause) ?? 'UNKNOWN';
  return skipped(request, code === 'ENOENT' ? 'missing' : 'unreadable', code);
}

async function hashOpened(request: HashRequest, handle: FileHandle): Promise<HashResponse> {
  const before = await handle.stat({ bigint: true });
  if (
    !before.isFile() ||
    before.dev.toString() !== request.dev ||
    before.ino.toString() !== request.ino
  ) {
    return skipped(request, 'changed', 'identity');
  }
  const hashed = await hashHandle(handle, Number(before.size), request.withBlocks);
  const after = await handle.stat({ bigint: true });
  if (
    hashed.bytes !== Number(before.size) ||
    after.size !== before.size ||
    after.mtimeNs !== before.mtimeNs
  ) {
    return skipped(request, 'changed', 'modified');
  }
  return {
    kind: 'hashed',
    id: request.id,
    sha256: hashed.sha256,
    bytes: hashed.bytes,
    modifiedMs: Number(before.mtimeMs),
    // The packed hashes are always built from `new Uint8Array`, but BlockHashes
    // keeps the generic Uint8Array type while the response schema narrows to
    // ArrayBuffer-backed storage.
    blocks: hashed.blocks as HashedBlocks | null,
  };
}

export async function hashRequested(request: HashRequest): Promise<HashResponse> {
  try {
    const handle = await openResolved(
      await resolveInRoot(request.rootPath, request.relPath),
      'read',
    );
    try {
      return await hashOpened(request, handle);
    } finally {
      await handle.close();
    }
  } catch (cause) {
    return failure(request, cause);
  }
}
