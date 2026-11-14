import { createHash } from 'node:crypto';
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
import { hashHandle } from '../blocks';
import { canRead, itemAccess } from '../access';
import { DriveWriteError, locate, type DriveWriteRoot } from '../intents';
import { openResolved, resolveInRoot } from '../paths';
import { blocksHashOf } from './server-index';
import {
  apiErrorOf,
  fileOf,
  type SyncEnv,
  type SyncNode,
  type SyncTxn,
  type SyncTxns,
} from './server-ops';

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;

const ID = z.uuid();
const BYTES = z.instanceof(Uint8Array);
const INDEX = /^\d+$/;
const HASH_BYTES = 32;

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function blocksFit(item: FileItem, blocks: DriveBlocks): boolean {
  return blocks.hashes.length === blockCount(item.bytes, blocks.blockSize) * HASH_BYTES;
}

export async function readExactly(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
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

export async function blocksOf(
  env: SyncEnv,
  root: DriveWriteRoot,
  item: FileItem,
): Promise<DriveBlocks> {
  const stored = env.store.driveBlocks.find(item.id, item.rev);
  if (stored !== undefined && blocksFit(item, stored)) return stored;
  const handle = await openLive(root, item.relPath);
  try {
    const hashed = await hashHandle(handle, item.bytes, true);
    if (hashed.bytes !== item.bytes || hashed.blocks === null) {
      throw new ApiError(
        'conflict',
        'The file changed on the hub outside sync; it is being scanned.',
      );
    }
    return env.store.driveBlocks.put({ itemId: item.id, rev: item.rev, ...hashed.blocks });
  } finally {
    await handle.close();
  }
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
    if (block === null || sha256Of(block) !== hash) {
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

export async function verifyAssembled(root: DriveWriteRoot, txn: SyncTxn): Promise<Assembled> {
  const { hashes, meta } = txn.spec;
  const handle = await open(await locate(root, txn.spec.tmpRel), 'r');
  try {
    const whole = createHash('sha256');
    for (const [index, hash] of hashes.entries()) {
      const range = blockRange(meta.bytes, meta.blockSize, index);
      const block = await readExactly(handle, range.start, range.end - range.start);
      if (sha256Of(block) !== hash) {
        throw new DriveWriteError('corrupt', `Block ${String(index)} does not match its checksum.`);
      }
      whole.update(block);
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

export function nodeOf(env: SyncEnv, request: IncomingMessage): SyncNode {
  const node = env.authenticate(request);
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

async function receive(request: IncomingMessage, length: number): Promise<Buffer> {
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
      const node = nodeOf(this.env, request);
      const { root, item } = this.located(node, params);
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
        if (hash !== sha256Of(bytes)) {
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
      const node = nodeOf(this.env, request);
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
    if (sha256Of(block) !== hashes[index]) {
      throw new ApiError('invalid_request', 'The block does not match its announced checksum.');
    }
    const root = this.env.store.driveRoots.byId(txn.spec.rootId);
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
  ): { readonly root: DriveWriteRoot; readonly item: FileItem } {
    const rootId = ID.safeParse(params['rootId']).data;
    const itemId = ID.safeParse(params['itemId']).data;
    const drive = rootId === undefined ? undefined : this.env.store.driveRoots.find(rootId);
    const found = itemId === undefined ? undefined : this.env.store.driveItems.find(itemId, null);
    if (drive === undefined || found?.rootId !== drive.id) {
      throw new ApiError('not_found', 'There is no such file for this person.');
    }
    if (!canRead(itemAccess(this.env.store, node.actor, drive, found))) {
      throw new ApiError('not_found', 'There is no such file for this person.');
    }
    const item = fileOf(found);
    if (item === null) throw new ApiError('invalid_request', 'A folder has no blocks.');
    return { root: drive, item };
  }
}
