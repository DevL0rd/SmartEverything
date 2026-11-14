import { createHash } from 'node:crypto';
import { lstat, open, rename, rm, stat, utimes, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { HASH_BYTES, blockCount, blockRange } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { DriveSyncDatabase, FileRecord, Transfer } from './db/index.js';
import { diskPathFor } from './scan.js';

export interface RemoteFile {
  readonly driveId: string;
  readonly itemId: string;
  readonly bytes: number;
  readonly blockSize: number;
  readonly blocksHash: string;
}

export interface BlockSource {
  readonly hashes: (file: RemoteFile) => Promise<Uint8Array>;
  readonly block: (file: RemoteFile, index: number) => Promise<Uint8Array>;
}

export interface LocalBlocks {
  readonly read: (hash: string) => Promise<Buffer | null>;
}

export interface TransferProgress {
  readonly doneBytes: number;
  readonly totalBytes: number;
  readonly resumedBytes: number;
}

export type TransferDatabase = Pick<DriveSyncDatabase, 'transfers'>;

export interface TransferOptions {
  readonly relPath: string;
  readonly txn: string;
  readonly remote: RemoteFile;
  readonly tempPath: string;
  readonly database: TransferDatabase;
  readonly source: BlockSource;
  readonly local: LocalBlocks;
  readonly progress: (progress: TransferProgress) => void;
}

export class RemoteChangedError extends Error {
  constructor(readonly itemId: string) {
    super(`The hub no longer holds the indexed content of ${itemId}`);
    this.name = 'RemoteChangedError';
  }
}

export class HubBlockError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HubBlockError';
  }
}

export class BlockCorruptError extends Error {
  constructor(
    readonly relPath: string,
    readonly index: number,
  ) {
    super(`Block ${String(index)} of ${relPath} does not match its checksum`);
    this.name = 'BlockCorruptError';
  }
}

export class DiskFullError extends Error {
  constructor(readonly relPath: string) {
    super(`There is no space left to write ${relPath}`);
    this.name = 'DiskFullError';
  }
}

const DISK_FULL_CODES: ReadonlySet<string> = new Set(['ENOSPC', 'EDQUOT']);

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function codeOf(cause: unknown): string | undefined {
  return cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

export function hashAt(packed: Uint8Array, index: number): string {
  return Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength).toString(
    'hex',
    index * HASH_BYTES,
    (index + 1) * HASH_BYTES,
  );
}

export function itemKeyOf(remote: RemoteFile): string {
  return `${remote.itemId}@${remote.blocksHash}`;
}

export interface HubBlockSourceOptions {
  readonly hubUrl: string;
  readonly token: string;
  readonly fetch: typeof fetch;
}

export class HubBlockSource implements BlockSource {
  constructor(private readonly options: HubBlockSourceOptions) {}

  hashes(file: RemoteFile): Promise<Uint8Array> {
    return this.get(this.base(file), file);
  }

  block(file: RemoteFile, index: number): Promise<Uint8Array> {
    return this.get(`${this.base(file)}/${String(index)}`, file);
  }

  private base(file: RemoteFile): string {
    return `/drive/blocks/${encodeURIComponent(file.driveId)}/${encodeURIComponent(file.itemId)}`;
  }

  private async get(path: string, file: RemoteFile): Promise<Uint8Array> {
    const response = await this.options.fetch(new URL(path, this.options.hubUrl), {
      headers: { authorization: `Bearer ${this.options.token}` },
    });
    if (response.status === 404 || response.status === 409) {
      await response.body?.cancel();
      throw new RemoteChangedError(file.itemId);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new HubBlockError(
        response.status,
        `The hub answered ${String(response.status)} for ${path}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

interface Location {
  readonly relPath: string;
  readonly index: number;
  readonly blockSize: number;
  readonly bytes: number;
}

export interface LocalBlockIndexOptions {
  readonly records: readonly FileRecord[];
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly log: Logger;
}

export class LocalBlockIndex implements LocalBlocks {
  readonly #locations = new Map<string, Location>();
  readonly #options: LocalBlockIndexOptions;

  constructor(options: LocalBlockIndexOptions) {
    this.#options = options;
    for (const record of options.records) this.#add(record);
  }

  async read(hash: string): Promise<Buffer | null> {
    const location = this.#locations.get(hash);
    if (location === undefined) return null;
    const { rootPath, platform, log } = this.#options;
    const disk = diskPathFor(platform, join(rootPath, ...location.relPath.split('/')));
    try {
      return await readBlock(disk, location, hash);
    } catch (cause) {
      log.debug('drive_sync.transfer.local_block_unreadable', () => ({
        relPath: location.relPath,
        error: messageOf(cause),
      }));
      return null;
    }
  }

  #add(record: FileRecord): void {
    const { blocks, blockSize } = record;
    if (record.kind !== 'file' || record.localHashState !== 'hashed') return;
    if (blocks === null || blockSize === null) return;
    const buffer = Buffer.from(blocks.buffer, blocks.byteOffset, blocks.byteLength);
    for (let index = 0; index * HASH_BYTES < buffer.length; index += 1) {
      const hash = buffer.toString('hex', index * HASH_BYTES, (index + 1) * HASH_BYTES);
      if (this.#locations.has(hash)) continue;
      this.#locations.set(hash, { relPath: record.relPath, index, blockSize, bytes: record.bytes });
    }
  }
}

async function readBlock(disk: string, location: Location, hash: string): Promise<Buffer | null> {
  const range = blockRange(location.bytes, location.blockSize, location.index);
  const handle = await open(disk, 'r');
  try {
    const block = Buffer.alloc(range.end - range.start);
    const { bytesRead } = await handle.read(block, 0, block.length, range.start);
    return bytesRead === block.length && sha256Of(block) === hash ? block : null;
  } finally {
    await handle.close();
  }
}

async function verifiedHashes(source: BlockSource, remote: RemoteFile): Promise<Uint8Array> {
  const packed = await source.hashes(remote);
  const count = blockCount(remote.bytes, remote.blockSize);
  if (packed.length !== count * HASH_BYTES || sha256Of(packed) !== remote.blocksHash) {
    throw new RemoteChangedError(remote.itemId);
  }
  return packed;
}

async function tempSize(tempPath: string): Promise<number | undefined> {
  try {
    return (await stat(tempPath)).size;
  } catch (cause) {
    if (codeOf(cause) === 'ENOENT') return undefined;
    throw cause;
  }
}

export function discardTransfers(
  database: TransferDatabase,
  txn: string,
  itemId: string,
  keep: string | null,
): void {
  for (const transfer of database.transfers.list()) {
    const stale = transfer.txn === txn && transfer.item.startsWith(`${itemId}@`);
    if (stale && transfer.item !== keep) database.transfers.complete(txn, transfer.item);
  }
}

export async function abandonTransfer(
  database: TransferDatabase,
  txn: string,
  itemId: string,
  tempPath: string,
): Promise<void> {
  discardTransfers(database, txn, itemId, null);
  await rm(tempPath, { force: true });
}

export function finishTransfer(database: TransferDatabase, txn: string, remote: RemoteFile): void {
  database.transfers.complete(txn, itemKeyOf(remote));
}

interface Started {
  readonly transfer: Transfer;
  readonly resumed: boolean;
}

async function start(options: TransferOptions, count: number): Promise<Started> {
  const { database, txn, remote, tempPath } = options;
  const item = itemKeyOf(remote);
  const found = database.transfers.get(txn, item);
  const size = await tempSize(tempPath);
  if (found?.blockCount === count && size === remote.bytes) {
    return { transfer: found, resumed: true };
  }
  discardTransfers(database, txn, remote.itemId, null);
  database.transfers.begin(txn, item, count);
  const created = database.transfers.get(txn, item);
  if (created === undefined) throw new Error(`The transfer of ${options.relPath} was not stored`);
  return { transfer: created, resumed: false };
}

function resumedBytesOf(options: TransferOptions, transfer: Transfer): number {
  const { bytes, blockSize } = options.remote;
  let total = 0;
  for (const [index, verified] of transfer.verified.entries()) {
    if (!verified) continue;
    const range = blockRange(bytes, blockSize, index);
    total += range.end - range.start;
  }
  return total;
}

async function blockFor(
  options: TransferOptions,
  packed: Uint8Array,
  index: number,
): Promise<Uint8Array> {
  const hash = hashAt(packed, index);
  const local = await options.local.read(hash);
  if (local !== null) return local;
  const fetched = await options.source.block(options.remote, index);
  if (sha256Of(fetched) !== hash) throw new BlockCorruptError(options.relPath, index);
  return fetched;
}

async function fill(
  options: TransferOptions,
  packed: Uint8Array,
  started: Started,
  handle: FileHandle,
): Promise<void> {
  const { remote, database, txn } = options;
  const item = itemKeyOf(remote);
  const resumedBytes = resumedBytesOf(options, started.transfer);
  let doneBytes = resumedBytes;
  options.progress({ doneBytes, totalBytes: remote.bytes, resumedBytes });
  for (const [index, verified] of started.transfer.verified.entries()) {
    if (verified) continue;
    const block = await blockFor(options, packed, index);
    await handle.write(
      block,
      0,
      block.length,
      blockRange(remote.bytes, remote.blockSize, index).start,
    );
    await handle.datasync();
    database.transfers.markVerified(txn, item, index);
    doneBytes += block.length;
    options.progress({ doneBytes, totalBytes: remote.bytes, resumedBytes });
  }
}

async function writeTemp(
  options: TransferOptions,
  packed: Uint8Array,
  started: Started,
): Promise<void> {
  const handle = await open(options.tempPath, started.resumed ? 'r+' : 'w+');
  try {
    if (!started.resumed) await handle.truncate(options.remote.bytes);
    await fill(options, packed, started, handle);
  } catch (cause) {
    if (DISK_FULL_CODES.has(codeOf(cause) ?? '')) throw new DiskFullError(options.relPath);
    throw cause;
  } finally {
    await handle.close();
  }
}

export async function downloadFile(options: TransferOptions): Promise<Uint8Array> {
  const packed = await verifiedHashes(options.source, options.remote);
  const started = await start(options, packed.length / HASH_BYTES);
  await writeTemp(options, packed, started);
  return packed;
}

export function modeOf(platform: NodeJS.Platform, mode: bigint): number {
  return platform === 'win32' ? 0 : Number(mode & 0o777n);
}

export type DiskState = 'absent' | 'same' | 'changed';

export async function diskStateOf(
  disk: string,
  record: FileRecord | undefined,
): Promise<DiskState> {
  const info = await lstat(disk, { bigint: true }).catch((cause: unknown) => {
    if (codeOf(cause) === 'ENOENT') return undefined;
    throw cause;
  });
  if (info === undefined) return 'absent';
  const same =
    record !== undefined &&
    info.isFile() &&
    Number(info.size) === record.bytes &&
    info.mtimeNs === record.mtimeNs;
  return same ? 'same' : 'changed';
}

export type Placement = 'placed' | 'new_on_both' | 'local_edit';

export interface PlaceOptions {
  readonly database: Pick<DriveSyncDatabase, 'files' | 'transfers' | 'transaction'>;
  readonly placementId: string;
  readonly txn: string;
  readonly remote: RemoteFile;
  readonly relPath: string;
  readonly platform: NodeJS.Platform;
  readonly mtime: string;
  readonly rev: number;
  readonly local: FileRecord | undefined;
  readonly target: string;
  readonly tempPath: string;
  readonly blocks: Uint8Array;
}

export async function placeFile(options: PlaceOptions): Promise<Placement> {
  const { database, remote, local, target, tempPath } = options;
  const state = await diskStateOf(target, local);
  if (local === undefined ? state !== 'absent' : state !== 'same') {
    return local === undefined ? 'new_on_both' : 'local_edit';
  }
  const modified = new Date(options.mtime);
  await utimes(tempPath, modified, modified);
  await rename(tempPath, target);
  const info = await lstat(target, { bigint: true });
  database.transaction(() => {
    database.files.upsert({
      placementId: options.placementId,
      relPath: options.relPath,
      kind: 'file',
      bytes: remote.bytes,
      mtimeNs: info.mtimeNs,
      mode: modeOf(options.platform, info.mode),
      hubRev: options.rev,
      localHashState: 'hashed',
      blockSize: remote.blockSize,
      blocks: options.blocks,
    });
    finishTransfer(database, options.txn, remote);
  });
  return 'placed';
}
