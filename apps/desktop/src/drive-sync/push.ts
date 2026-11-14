import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SYNC_PUSH,
  bytesToPacked,
  blockRange,
  unpackHashes,
  type SyncClientMessage,
  type SyncHubMessage,
} from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { BlockUploader } from './block-upload.js';
import { isHashedFile, type PushIntent } from './push-intents.js';
import {
  PushQueue,
  outcomeOf,
  type Decoded,
  type PushOutcome,
  type PushPayload,
  type PushQueueDatabase,
} from './push-queue.js';
import { diskPathFor } from './scan.js';
import type { SyncWaiting } from './service.js';
import { ChannelClosedError } from './socket.js';

type Reply = Extract<SyncHubMessage, { readonly type: 'accept' | 'conflict' | 'need_blocks' }>;
type Final = Extract<Reply, { readonly type: 'accept' | 'conflict' }>;
type NeedBlocks = Extract<Reply, { readonly type: 'need_blocks' }>;

export interface PushChannel {
  readonly send: (message: SyncClientMessage) => Promise<void>;
}

export interface PushAccepted extends PushOutcome {
  readonly rev: number;
  readonly seq: number;
}

export interface PushConflict extends PushOutcome {
  readonly reason: Extract<SyncHubMessage, { readonly type: 'conflict' }>['reason'];
  readonly conflictPath: string | null;
  readonly hubRev: number;
}

export interface PushFailure {
  readonly relPath: string;
  readonly message: string;
}

export interface PushSink {
  readonly accepted: (result: PushAccepted) => void;
  readonly conflicted: (conflict: PushConflict) => void;
  readonly stale: (relPath: string) => void;
  readonly failed: (failure: PushFailure) => void;
}

export interface PlacementPusherOptions {
  readonly placementId: string;
  readonly rootPath: string;
  readonly database: PushQueueDatabase;
  readonly channel: PushChannel;
  readonly uploader: BlockUploader;
  readonly sink: PushSink;
  readonly log: Logger;
}

class FileChangedError extends Error {
  constructor(readonly relPath: string) {
    super(`${relPath} changed after it was hashed`);
    this.name = 'FileChangedError';
  }
}

interface Waiter {
  readonly resolve: (reply: Reply) => void;
  readonly reject: (cause: Error) => void;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}

function isReply(message: SyncHubMessage): message is Reply {
  return message.type === 'accept' || message.type === 'conflict' || message.type === 'need_blocks';
}

function finalOf(reply: Reply): Final {
  if (reply.type === 'need_blocks') {
    throw new Error('The hub asked for blocks of an operation that has none');
  }
  return reply;
}

export class PlacementPusher {
  readonly #options: PlacementPusherOptions;
  readonly #queue: PushQueue;
  readonly #waiters = new Map<string, Waiter>();
  #chain: Promise<void> = Promise.resolve();

  constructor(options: PlacementPusherOptions) {
    this.#options = options;
    this.#queue = new PushQueue(options.database, options.placementId);
  }

  async submit(intents: readonly PushIntent[]): Promise<void> {
    this.#queue.submit(intents);
    await this.#drain();
  }

  resume(): Promise<void> {
    this.#options.database.pendingOps.requeueSent();
    return this.#drain();
  }

  interrupted(): void {
    const waiting = [...this.#waiters.values()];
    this.#waiters.clear();
    for (const waiter of waiting) waiter.reject(new ChannelClosedError(this.#options.placementId));
  }

  receive(message: SyncHubMessage): void {
    if (!isReply(message)) return;
    const waiter = this.#waiters.get(message.opId);
    if (waiter === undefined) {
      this.#options.log.warn('drive_sync.push.unexpected_reply', { opId: message.opId });
      return;
    }
    this.#waiters.delete(message.opId);
    waiter.resolve(message);
  }

  waiting(): SyncWaiting {
    return this.#queue.waiting();
  }

  #drain(): Promise<void> {
    this.#chain = this.#chain
      .then(() => this.#run())
      .catch((cause: unknown) => {
        this.#options.log.error('drive_sync.push.drain_failed', cause);
      });
    return this.#chain;
  }

  async #run(): Promise<void> {
    for (;;) {
      const decoded = this.#queue.next();
      if (decoded === undefined) return;
      try {
        await this.#execute(decoded);
      } catch (cause) {
        this.#halted(decoded, cause);
        return;
      }
    }
  }

  #halted(decoded: Decoded, cause: unknown): void {
    if (cause instanceof ChannelClosedError) {
      this.#options.log.info('drive_sync.push.interrupted', { opId: decoded.op.opId });
      return;
    }
    const { relPath } = outcomeOf(decoded);
    this.#options.log.warn('drive_sync.push.failed', {
      opId: decoded.op.opId,
      relPath,
      error: messageOf(cause),
    });
    this.#options.sink.failed({ relPath, message: messageOf(cause) });
  }

  async #execute(decoded: Decoded): Promise<void> {
    this.#options.database.pendingOps.markSent(decoded.op.opId);
    try {
      const final = await this.#exchange(decoded);
      if (final !== undefined) this.#settle(decoded, final);
    } catch (cause) {
      if (!(cause instanceof FileChangedError)) throw cause;
      this.#supersede(decoded, cause.relPath);
    }
  }

  async #exchange(decoded: Decoded): Promise<Final | undefined> {
    const { opId } = decoded.op;
    if (decoded.kind === 'move') {
      return finalOf(await this.#call({ type: 'move', opId, ...decoded.payload }));
    }
    if (decoded.kind === 'tombstone') {
      return finalOf(await this.#call({ type: 'tombstone', opId, ...decoded.payload }));
    }
    return this.#exchangePush(decoded, decoded.payload);
  }

  async #exchangePush(decoded: Decoded, payload: PushPayload): Promise<Final | undefined> {
    const { opId } = decoded.op;
    const record = this.#options.database.files.get(this.#options.placementId, payload.relPath);
    if (!isHashedFile(record) || bytesToPacked(record.blocks) !== payload.blocks) {
      this.#drop(decoded, payload.relPath);
      return undefined;
    }
    let reply = await this.#call(
      SYNC_PUSH.parse({
        type: 'push',
        opId,
        relPath: payload.relPath,
        baseRev: record.hubRev,
        meta: payload.meta,
        blocks: payload.blocks,
      }),
    );
    while (reply.type === 'need_blocks') {
      await this.#upload(payload, reply);
      reply = await this.#call({ type: 'commit', opId, txn: reply.txn });
    }
    return reply;
  }

  async #call(message: SyncClientMessage & { readonly opId: string }): Promise<Reply> {
    const reply = new Promise<Reply>((resolve, reject) => {
      this.#waiters.set(message.opId, { resolve, reject });
    });
    try {
      await this.#options.channel.send(message);
    } catch (cause) {
      this.#waiters.delete(message.opId);
      throw cause;
    }
    return reply;
  }

  async #upload(payload: PushPayload, need: NeedBlocks): Promise<void> {
    const hashes = unpackHashes(payload.blocks);
    const disk = diskPathFor(
      process.platform,
      join(this.#options.rootPath, ...payload.relPath.split('/')),
    );
    const handle = await this.#openFile(disk, payload.relPath);
    try {
      for (const index of need.indexes) {
        const range = blockRange(payload.meta.bytes, payload.meta.blockSize, index);
        const block = Buffer.alloc(range.end - range.start);
        const { bytesRead } = await handle.read(block, 0, block.length, range.start);
        if (bytesRead !== block.length || sha256Of(block) !== hashes[index]) {
          throw new FileChangedError(payload.relPath);
        }
        await this.#options.uploader.put(need.txn, index, block);
      }
    } finally {
      await handle.close();
    }
  }

  async #openFile(disk: string, relPath: string): Promise<FileHandle> {
    try {
      return await open(disk, 'r');
    } catch (cause) {
      if (isMissing(cause)) throw new FileChangedError(relPath);
      throw cause;
    }
  }

  #settle(decoded: Decoded, reply: Final): void {
    const { database, placementId, sink, log } = this.#options;
    const outcome = outcomeOf(decoded);
    database.transaction(() => {
      if (reply.type === 'accept') this.#applyRev(decoded, reply.rev);
      database.pendingOps.acknowledge(decoded.op.opId);
    });
    if (reply.type === 'accept') {
      sink.accepted({ ...outcome, rev: reply.rev, seq: reply.seq });
      return;
    }
    log.info('drive_sync.push.conflict', {
      placementId,
      opId: decoded.op.opId,
      reason: reply.reason,
    });
    sink.conflicted({
      ...outcome,
      reason: reply.reason,
      conflictPath: reply.conflictPath,
      hubRev: reply.hubRev,
    });
  }

  #applyRev(decoded: Decoded, rev: number): void {
    const { files } = this.#options.database;
    const { placementId } = this.#options;
    if (decoded.kind === 'push') files.setHubRev(placementId, decoded.payload.relPath, rev);
    if (decoded.kind === 'move') {
      files.rename(placementId, decoded.payload.from, decoded.payload.to);
      files.setHubRev(placementId, decoded.payload.to, rev);
    }
  }

  #drop(decoded: Decoded, relPath: string): void {
    const { database, placementId, log } = this.#options;
    database.pendingOps.acknowledge(decoded.op.opId);
    log.info('drive_sync.push.superseded', { placementId, opId: decoded.op.opId, relPath });
  }

  #supersede(decoded: Decoded, relPath: string): void {
    const { database, placementId, sink } = this.#options;
    database.transaction(() => {
      this.#drop(decoded, relPath);
      database.files.markStale(placementId, relPath);
    });
    sink.stale(relPath);
  }
}
