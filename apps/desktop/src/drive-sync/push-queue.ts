import { createHash, randomUUID } from 'node:crypto';
import { appendTo } from '@smarteverything/domain';
import { SYNC_FILE_META, bytesToPacked } from '@smarteverything/domain/drive-sync';
import { z } from 'zod';
import type { DriveSyncDatabase, FileRecord, PendingOp } from './db/index.js';
import {
  PushNotReadyError,
  isHashedFile,
  pushIntentOf,
  type HashedFile,
  type PushIntent,
} from './push-intents.js';
import type { SyncWaiting } from './service.js';

const NS_PER_MS = 1_000_000n;

const REL_PATH = z.string().min(1);
const BASE_REV = z.int().nonnegative();
const PUSH_PAYLOAD = z
  .strictObject({ relPath: REL_PATH, meta: SYNC_FILE_META, blocks: z.string() })
  .readonly();
const MOVE_PAYLOAD = z.strictObject({ from: REL_PATH, to: REL_PATH, baseRev: BASE_REV }).readonly();
const TOMBSTONE_PAYLOAD = z.strictObject({ relPath: REL_PATH, baseRev: BASE_REV }).readonly();

export type PushPayload = z.infer<typeof PUSH_PAYLOAD>;
type MovePayload = z.infer<typeof MOVE_PAYLOAD>;
type TombstonePayload = z.infer<typeof TOMBSTONE_PAYLOAD>;

export type Decoded =
  | { readonly kind: 'push'; readonly op: PendingOp; readonly payload: PushPayload }
  | { readonly kind: 'move'; readonly op: PendingOp; readonly payload: MovePayload }
  | { readonly kind: 'tombstone'; readonly op: PendingOp; readonly payload: TombstonePayload };

export interface PushOutcome {
  readonly kind: PendingOp['kind'];
  readonly relPath: string;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function mtimeOf(record: FileRecord): string {
  return new Date(Number(record.mtimeNs / NS_PER_MS)).toISOString();
}

function pushPayloadOf(record: HashedFile): PushPayload {
  return {
    relPath: record.relPath,
    meta: {
      bytes: record.bytes,
      mtime: mtimeOf(record),
      blockSize: record.blockSize,
      blocksHash: sha256Of(record.blocks),
    },
    blocks: bytesToPacked(record.blocks),
  };
}

export function decode(op: PendingOp): Decoded {
  switch (op.kind) {
    case 'push':
      return { kind: 'push', op, payload: PUSH_PAYLOAD.parse(op.payload) };
    case 'move':
      return { kind: 'move', op, payload: MOVE_PAYLOAD.parse(op.payload) };
    case 'tombstone':
      return { kind: 'tombstone', op, payload: TOMBSTONE_PAYLOAD.parse(op.payload) };
  }
}

export function outcomeOf(decoded: Decoded): PushOutcome {
  switch (decoded.kind) {
    case 'push':
      return { kind: 'push', relPath: decoded.payload.relPath };
    case 'move':
      return { kind: 'move', relPath: decoded.payload.to };
    case 'tombstone':
      return { kind: 'tombstone', relPath: decoded.payload.relPath };
  }
}

export interface PushQueueDatabase {
  readonly files: DriveSyncDatabase['files'];
  readonly pendingOps: DriveSyncDatabase['pendingOps'];
  readonly transaction: DriveSyncDatabase['transaction'];
}

type PushIndex = Map<string, string[]>;

export class PushQueue {
  readonly #database: PushQueueDatabase;
  readonly #placementId: string;

  constructor(database: PushQueueDatabase, placementId: string) {
    this.#database = database;
    this.#placementId = placementId;
  }

  submit(intents: readonly PushIntent[]): void {
    this.#database.transaction(() => {
      const index = this.#pushIndex();
      for (const kind of ['move', 'tombstone', 'push'] as const) {
        for (const intent of intents) if (intent.kind === kind) this.#enqueue(intent, index);
      }
    });
  }

  next(): Decoded | undefined {
    const op = this.#database.pendingOps.list().find((entry) => entry.state === 'queued');
    return op === undefined ? undefined : decode(op);
  }

  waiting(): SyncWaiting {
    const pending = this.#database.pendingOps.list().map(decode);
    const needBytes = pending.reduce(
      (sum, entry) => sum + (entry.kind === 'push' ? entry.payload.meta.bytes : 0),
      0,
    );
    return { needBytes, pendingOps: pending.length };
  }

  #pushIndex(): PushIndex {
    const index: PushIndex = new Map();
    for (const op of this.#database.pendingOps.list()) {
      if (op.kind !== 'push') continue;
      const { relPath } = PUSH_PAYLOAD.parse(op.payload);
      appendTo(index, relPath, op.opId);
    }
    return index;
  }

  #dropPushes(index: PushIndex, matches: (relPath: string) => boolean): number {
    let dropped = 0;
    for (const [relPath, opIds] of [...index]) {
      if (!matches(relPath)) continue;
      for (const opId of opIds) this.#database.pendingOps.acknowledge(opId);
      dropped += opIds.length;
      index.delete(relPath);
    }
    return dropped;
  }

  #add(kind: PendingOp['kind'], payload: PushPayload | MovePayload | TombstonePayload): void {
    this.#database.pendingOps.enqueue({ opId: randomUUID(), kind, payload });
  }

  #enqueue(intent: PushIntent, index: PushIndex): void {
    if (intent.kind === 'push') this.#enqueuePush(intent.record, index);
    else if (intent.kind === 'move') this.#enqueueMove(intent, index);
    else this.#enqueueTombstone(intent, index);
  }

  #enqueuePush(record: FileRecord, index: PushIndex): void {
    if (!isHashedFile(record)) throw new PushNotReadyError(record.relPath);
    this.#dropPushes(index, (relPath) => relPath === record.relPath);
    this.#add('push', pushPayloadOf(record));
  }

  #enqueueMove(intent: Extract<PushIntent, { readonly kind: 'move' }>, index: PushIndex): void {
    const dropped = this.#dropPushes(index, (relPath) => relPath === intent.from);
    this.#add('move', { from: intent.from, to: intent.to, baseRev: intent.baseRev });
    if (dropped === 0) return;
    const moved = this.#database.files.get(this.#placementId, intent.to);
    for (const next of pushIntentOf(moved, intent.to)) this.#enqueue(next, index);
  }

  #enqueueTombstone(
    intent: Extract<PushIntent, { readonly kind: 'tombstone' }>,
    index: PushIndex,
  ): void {
    const prefix = `${intent.relPath}/`;
    this.#dropPushes(index, (relPath) => relPath === intent.relPath || relPath.startsWith(prefix));
    this.#add('tombstone', { relPath: intent.relPath, baseRev: intent.baseRev });
  }
}
