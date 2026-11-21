import { createHash, type Hash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import {
  blockCount,
  blockRange,
  bytesToPacked,
  unpackHashes,
  type HubEntry,
} from '@smarteverything/domain/drive-sync';
import { z } from 'zod';
import { sendError } from '../../server/http';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import { sha256Hex } from '../digest';
import { FileHashSkippedError, type ContentHash } from '../hasher';
import { locate, type DriveWriteRoot } from '../intents';
import { DriveWriteError } from '../write-error';
import { openResolved, resolveInRoot } from '../paths';
import { blocksHashOf } from './server-index';
import { fileOf } from './file-of';
import { apiErrorOf, type SyncEnv, type SyncNode, type SyncTxn, type SyncTxns } from './server-ops';

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;

const ID = z.uuid();
const BYTES = z.instanceof(Uint8Array);
const INDEX = /^\d+$/;
const HASH_BYTES = 32;

const VERIFY_SLICE = 1024 * 1024;

function blocksFit(item: FileItem, blocks: DriveBlocks): boolean {
  return blocks.hashes.length === blockCount(item.bytes, blocks.blockSize) * HASH_BYTES;
}

export async function readExactly(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer<ArrayBuffer>> {
  const buffer = Buffer.allocUnsafe(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, position + filled);
    if (bytesRead === 0) {
      throw new ApiError('conflict', 'The file is shorter on the hub than its index says.');
    }
    filled += bytesRead;
  }
  return buffer;
}

export async function openLive(root: DriveWriteRoot, relPath: string): Promise<FileHandle> {
  return openResolved(await resolveInRoot(root.path, relPath), 'read');
}

async function hashedBlocks(
  env: SyncEnv,
  root: DriveWriteRoot,
  item: FileItem,
): Promise<ContentHash> {
  const identity = await env.store.host.call('driveItems', 'identityOf', item.id);
  if (identity === null) throw changedOutsideSync();
  const { dev, ino } = identity;
  try {
    return await env.hasher.hash(
      { rootPath: root.path, relPath: item.relPath, dev: BigInt(dev), ino: BigInt(ino) },
      true,
    );
  } catch (cause) {
    if (cause instanceof FileHashSkippedError) throw changedOutsideSync();
    throw cause;
  }
}

function changedOutsideSync(): ApiError {
  return new ApiError('conflict', 'The file changed on the hub outside sync; it is being scanned.');
}

export async function blocksOf(
  env: SyncEnv,
  root: DriveWriteRoot,
  item: FileItem,
): Promise<DriveBlocks> {
  const stored = await env.store.host.call('driveBlocks', 'find', item.id, item.rev);
  if (stored !== undefined && blocksFit(item, stored)) return stored;
  const hashed = await hashedBlocks(env, root, item);
  if (hashed.bytes !== item.bytes || hashed.blocks === null) throw changedOutsideSync();
  return env.store.host.call('driveBlocks', 'put', {
    itemId: item.id,
    rev: item.rev,
    ...hashed.blocks,
  });
}

export function hexHashesOf(blocks: DriveBlocks): readonly string[] {
  return unpackHashes(bytesToPacked(blocks.hashes));
}

export function contentToken(bytes: number, blockSize: number, blocksHash: string): string {
  return `${String(bytes)}:${String(blockSize)}:${blocksHash}`;
}

export async function hubEntryOf(
  env: SyncEnv,
  root: DriveWriteRoot,
  existing: DriveItem | undefined,
): Promise<HubEntry | undefined> {
  const file = existing === undefined ? null : fileOf(existing);
  if (file === null) return undefined;
  const blocks = await blocksOf(env, root, file);
  return {
    rev: file.rev,
    deleted: false,
    seq: 0,
    content: contentToken(file.bytes, blocks.blockSize, blocksHashOf(blocks.hashes)),
  };
}

async function copyBlocks(
  txn: SyncTxn,
  source: FileHandle,
  target: FileHandle,
  held: readonly string[],
): Promise<readonly number[]> {
  const { hashes, meta } = txn.spec;
  const missing: number[] = [];
  for (const [index, hash] of hashes.entries()) {
    if (txn.hasArrived(index)) continue;
    const range = blockRange(meta.bytes, meta.blockSize, index);
    const block =
      held[index] === hash ? await readExactly(source, range.start, range.end - range.start) : null;
    if (block === null || (await sha256Hex(block)) !== hash) {
      missing.push(index);
      continue;
    }
    await target.write(block, 0, block.length, range.start);
    txn.arrive(index);
  }
  return missing;
}

export async function fillFromHub(
  env: SyncEnv,
  root: DriveWriteRoot,
  txn: SyncTxn,
  existing: DriveItem | undefined,
): Promise<readonly number[]> {
  const file = existing === undefined ? null : fileOf(existing);
  const hub = file === null ? null : await blocksOf(env, root, file);
  const absent = txn.spec.hashes.flatMap((_, index) => (txn.hasArrived(index) ? [] : [index]));
  if (file === null || hub === null || absent.length === 0) return absent;
  const held = hub.blockSize === txn.spec.meta.blockSize ? hexHashesOf(hub) : [];
  const source = await openLive(root, file.relPath);
  try {
    const target = await open(await locate(root, txn.spec.tmpRel), 'r+');
    try {
      return await copyBlocks(txn, source, target, held);
    } finally {
      await target.close();
    }
  } finally {
    await source.close();
  }
}

export interface Assembled {
  readonly sha256: string;
  readonly bytes: number;
}

async function sliceHashes(
  handle: FileHandle,
  range: { readonly start: number; readonly end: number },
  whole: Hash,
): Promise<string> {
  const block = createHash('sha256');
  for (let at = range.start; at < range.end; at += VERIFY_SLICE) {
    const slice = await readExactly(handle, at, Math.min(VERIFY_SLICE, range.end - at));
    block.update(slice);
    whole.update(slice);
  }
  return block.digest('hex');
}

export async function verifyAssembled(root: DriveWriteRoot, txn: SyncTxn): Promise<Assembled> {
  const { hashes, meta } = txn.spec;
  const handle = await open(await locate(root, txn.spec.tmpRel), 'r');
  try {
    const whole = createHash('sha256');
    for (const [index, hash] of hashes.entries()) {
      const range = blockRange(meta.bytes, meta.blockSize, index);
      if ((await sliceHashes(handle, range, whole)) !== hash) {
        throw new DriveWriteError('corrupt', `Block ${String(index)} does not match its checksum.`);
      }
    }
    const { size } = await handle.stat();
    if (size !== meta.bytes) {
      throw new DriveWriteError('corrupt', 'The assembled file is not the announced size.');
    }
    return { sha256: whole.digest('hex'), bytes: size };
  } finally {
    await handle.close();
  }
}

export async function guarded(response: ServerResponse, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (cause) {
    const error = apiErrorOf(cause);
    if (error === null) throw cause;
    sendError(response, error);
  }
}

export async function nodeOf(env: SyncEnv, request: IncomingMessage): Promise<SyncNode> {
  const node = await env.authenticate(request);
  if (node === null) throw new ApiError('unauthorized', 'Sign in with a paired computer.');
  return node;
}

export function txnById(
  txns: SyncTxns,
  id: string,
  who: Pick<SyncNode, 'deviceId' | 'profileId'>,
): SyncTxn {
  const txn = txns.find(id);
  if (txn?.belongsTo(who.deviceId, who.profileId) !== true) {
    throw new ApiError('not_found', 'There is no such transaction for this computer.');
  }
  return txn;
}

export function txnOf(
  txns: SyncTxns,
  params: Readonly<Record<string, string>>,
  node: SyncNode,
): SyncTxn {
  return txnById(txns, params['txn'] ?? '', node);
}

function indexOf(params: Readonly<Record<string, string>>): number {
  const raw = params['index'] ?? '';
  if (!INDEX.test(raw)) throw new ApiError('invalid_request', 'The block index is a whole number.');
  return Number(raw);
}

async function receive(request: IncomingMessage, length: number): Promise<Buffer<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const piece = Buffer.from(BYTES.parse(chunk));
    total += piece.length;
    if (total > length) {
      throw new ApiError('payload_too_large', 'The block is longer than the announced size.');
    }
    chunks.push(piece);
  }
  if (total < length) {
    throw new ApiError('invalid_request', 'The block is shorter than the announced size.');
  }
  return Buffer.concat(chunks);
}

export class SyncBlockRoutes {
  constructor(
    private readonly env: SyncEnv,
    private readonly txns: SyncTxns,
  ) {}

  get(
    request: IncomingMessage,
    response: ServerResponse,
    params: Readonly<Record<string, string>>,
  ): Promise<void> {
    return guarded(response, async () => {
      const node = await nodeOf(this.env, request);
      const { root, item } = await this.located(node, params);
      const blocks = await blocksOf(this.env, root, item);
      const index = indexOf(params);
      if (index >= blockCount(item.bytes, blocks.blockSize)) {
        throw new ApiError('not_found', 'The file has no such block.');
      }
      const range = blockRange(item.bytes, blocks.blockSize, index);
      const handle = await openLive(root, item.relPath);
      try {
        const bytes = await readExactly(handle, range.start, range.end - range.start);
        const hash = hexHashesOf(blocks)[index];
        if (hash !== (await sha256Hex(bytes))) {
          throw new ApiError('conflict', 'The file changed on the hub; refresh the index.');
        }
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': bytes.length,
          'cache-control': 'no-store',
          etag: `"${hash}"`,
        });
        response.end(bytes);
      } finally {
        await handle.close();
      }
    });
  }

  put(
    request: IncomingMessage,
    response: ServerResponse,
    params: Readonly<Record<string, string>>,
  ): Promise<void> {
    return guarded(response, async () => {
      const node = await nodeOf(this.env, request);
      const txn = txnOf(this.txns, params, node);
      const index = indexOf(params);
      if (!txn.wants(index)) throw new ApiError('conflict', 'The hub does not need that block.');
      if (!txn.beginWrite()) throw new ApiError('conflict', 'The transaction is committing.');
      try {
        await this.store(request, txn, index);
      } finally {
        txn.endWrite();
      }
      response.writeHead(204);
      response.end();
    });
  }

  private async store(request: IncomingMessage, txn: SyncTxn, index: number): Promise<void> {
    const { meta, hashes } = txn.spec;
    const range = blockRange(meta.bytes, meta.blockSize, index);
    const block = await receive(request, range.end - range.start);
    if ((await sha256Hex(block)) !== hashes[index]) {
      throw new ApiError('invalid_request', 'The block does not match its announced checksum.');
    }
    const root = await this.env.store.host.call('driveRoots', 'byId', txn.spec.rootId);
    const handle = await open(await locate(root, txn.spec.tmpRel), 'r+');
    try {
      await handle.write(block, 0, block.length, range.start);
      await handle.sync();
    } finally {
      await handle.close();
    }
    txn.arrive(index);
  }

  private located(
    node: SyncNode,
    params: Readonly<Record<string, string>>,
  ): Promise<{ readonly root: DriveWriteRoot; readonly item: FileItem }> {
    return this.env.store.host.read('driveSyncBlockTarget', {
      actor: node.actor,
      rootId: ID.safeParse(params['rootId']).data ?? null,
      itemId: ID.safeParse(params['itemId']).data ?? null,
    });
  }
}
