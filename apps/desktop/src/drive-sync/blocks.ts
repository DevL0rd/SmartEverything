import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { blockCount, blockSizeFor } from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import { BLOCK_RESPONSE, type BlockRequest } from './blocks-worker.js';

export const BLOCK_WORKER_FILE = 'drive-blocks.mjs';

export class BlockHashError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'BlockHashError';
  }
}

export class FileChangedWhileHashingError extends BlockHashError {
  constructor(path: string, expected: number, read: number) {
    super(path, `expected ${String(expected)} bytes but read ${String(read)}`);
    this.name = 'FileChangedWhileHashingError';
  }
}

export interface HashedFile {
  readonly blockSize: number;
  readonly hashes: readonly string[];
}

export interface BlockHasher {
  readonly hash: (path: string, bytes: number) => Promise<HashedFile>;
  readonly close: () => Promise<void>;
}

export interface BlockHasherOptions {
  readonly workerFile: URL;
  readonly log: Logger;
}

interface Pending {
  readonly path: string;
  readonly bytes: number;
  readonly blockSize: number;
  readonly resolve: (file: HashedFile) => void;
  readonly reject: (cause: Error) => void;
}

export function bundledBlockWorker(): URL {
  return new URL(`./${BLOCK_WORKER_FILE}`, import.meta.url);
}

class WorkerBlockHasher implements BlockHasher {
  private readonly pending = new Map<number, Pending>();
  private worker: Worker | null = null;
  private next = 0;

  constructor(private readonly options: BlockHasherOptions) {}

  hash(path: string, bytes: number): Promise<HashedFile> {
    return new Promise<HashedFile>((resolve, reject) => {
      const worker = (this.worker ??= this.start());
      const id = this.next;
      this.next += 1;
      const blockSize = blockSizeFor(bytes);
      this.pending.set(id, { path, bytes, blockSize, resolve, reject });
      const request: BlockRequest = { id, path, bytes, blockSize };
      worker.postMessage(request);
    });
  }

  async close(): Promise<void> {
    const current = this.worker;
    this.worker = null;
    if (current !== null) await current.terminate();
  }

  private failAll(cause: Error): void {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const entry of waiting) entry.reject(cause);
  }

  private settle(raw: unknown): void {
    const response = BLOCK_RESPONSE.parse(raw);
    const entry = this.pending.get(response.id);
    if (entry === undefined) return;
    this.pending.delete(response.id);
    if (!response.ok) {
      entry.reject(new BlockHashError(entry.path, response.message));
    } else if (
      response.bytesRead !== entry.bytes ||
      response.hashes.length !== blockCount(entry.bytes, entry.blockSize)
    ) {
      entry.reject(new FileChangedWhileHashingError(entry.path, entry.bytes, response.bytesRead));
    } else {
      entry.resolve({ blockSize: entry.blockSize, hashes: response.hashes });
    }
  }

  private start(): Worker {
    const { workerFile, log } = this.options;
    const file = fileURLToPath(workerFile);
    if (!existsSync(file)) {
      throw new BlockHashError(file, `block hash worker ${BLOCK_WORKER_FILE} is missing`);
    }
    const created = new Worker(workerFile);
    created.on('message', (raw: unknown) => {
      this.settle(raw);
    });
    created.on('error', (cause: Error) => {
      log.error('drive.blocks.worker_failed', cause);
      if (this.worker === created) this.worker = null;
      this.failAll(cause);
    });
    created.on('exit', () => {
      if (this.worker === created) this.worker = null;
      this.failAll(new BlockHashError(file, 'block hash worker stopped'));
    });
    return created;
  }
}

export function createBlockHasher(options: BlockHasherOptions): BlockHasher {
  return new WorkerBlockHasher(options);
}
