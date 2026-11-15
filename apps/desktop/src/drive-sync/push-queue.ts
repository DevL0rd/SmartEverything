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
const PATH_PAYLOAD = z.strictObject({ relPath: REL_PATH }).readonly();

export type PushPayload = z.infer<typeof PUSH_PAYLOAD>;
type MovePayload = z.infer<typeof MOVE_PAYLOAD>;
type TombstonePayload = z.infer<typeof TOMBSTONE_PAYLOAD>;
export type PathPayload = z.infer<typeof PATH_PAYLOAD>;

export type Decoded =
  | { readonly kind: 'push'; readonly op: PendingOp; readonly payload: PushPayload }
  | { readonly kind: 'move'; readonly op: PendingOp; readonly payload: MovePayload }
  | { readonly kind: 'tombstone'; readonly op: PendingOp; readonly payload: TombstonePayload }
  | { readonly kind: 'meta'; readonly op: PendingOp; readonly payload: PathPayload }
  | { readonly kind: 'link'; readonly op: PendingOp; readonly payload: PathPayload };

export interface PushOutcome {
  readonly kind: PendingOp['kind'];
  readonly relPath: string;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function mtimeOf(record: FileRecord): string {
  return new Date(Number(record.mtimeNs / NS_PER_MS)).toISOString();
}

export function mtimeNsOf(record: FileRecord): string {
  return (record.mtimeNs < 0n ? 0n : record.mtimeNs).toString();
}

function pushPayloadOf(record: HashedFile): PushPayload {
  return {
    relPath: record.relPath,
    meta: {
      bytes: record.bytes,
      mtime: mtimeOf(record),
      mtimeNs: mtimeNsOf(record),
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
    case 'meta':
      return { kind: 'meta', op, payload: PATH_PAYLOAD.parse(op.payload) };
    case 'link':
      return { kind: 'link', op, payload: PATH_PAYLOAD.parse(op.payload) };
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
    case 'meta':
      return { kind: 'meta', relPath: decoded.payload.relPath };
    case 'link':
      return { kind: 'link', relPath: decoded.payload.relPath };
  }
}

export interface PushQueueDatabase {
  readonly files: DriveSyncDatabase['files'];
  readonly pendingOps: DriveSyncDatabase['pendingOps'];
  readonly transaction: DriveSyncDatabase['transaction'];
}

interface Queued {
  readonly opId: string;
  readonly kind: PendingOp['kind'];
  readonly state: PendingOp['state'];
}

type PushIndex = Map<string, Queued[]>;

const PATH_KINDS: ReadonlySet<PendingOp['kind']> = new Set(['push', 'meta', 'link']);

function relPathOf(op: PendingOp): string {
  return op.kind === 'push'
    ? PUSH_PAYLOAD.parse(op.payload).relPath
    : PATH_PAYLOAD.parse(op.payload).relPath;
}

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
      for (const kind of ['move', 'tombstone', 'link'] as const) {
        for (const intent of intents) if (intent.kind === kind) this.#enqueue(intent, index);
      }
      for (const intent of this.#namesFirst(intents)) this.#enqueue(intent, index);
      for (const intent of intents) if (intent.kind === 'meta') this.#enqueue(intent, index);
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

  #namesFirst(intents: readonly PushIntent[]): readonly PushIntent[] {
    const records = this.#database.files.list(this.#placementId);
    const afterPrimary = (record: FileRecord): boolean =>
      record.linkKey !== null &&
      records.some(
        (other) =>
          other.linkKey === record.linkKey &&
          other.kind === 'file' &&
          other.relPath < record.relPath,
      );
    const pushes = intents.filter((intent) => intent.kind === 'push');
    return [
      ...pushes.filter((intent) => !afterPrimary(intent.record)),
      ...pushes.filter((intent) => afterPrimary(intent.record)),
    ];
  }

  #pushIndex(): PushIndex {
    const index: PushIndex = new Map();
    for (const op of this.#database.pendingOps.list()) {
      if (PATH_KINDS.has(op.kind)) {
        appendTo(index, relPathOf(op), { opId: op.opId, kind: op.kind, state: op.state });
      }
    }
    return index;
  }

  #dropAt(
    index: PushIndex,
    matches: (relPath: string) => boolean,
    kinds: readonly PendingOp['kind'][],
  ): readonly Queued[] {
    const dropped: Queued[] = [];
    for (const [relPath, queued] of [...index]) {
      if (!matches(relPath)) continue;
      const doomed = queued.filter((entry) => kinds.includes(entry.kind));
      for (const entry of doomed) this.#database.pendingOps.acknowledge(entry.opId);
      dropped.push(...doomed);
      const kept = queued.filter((entry) => !kinds.includes(entry.kind));
      if (kept.length === 0) index.delete(relPath);
      else index.set(relPath, kept);
    }
    return dropped;
  }

  #add(
    index: PushIndex,
    kind: PendingOp['kind'],
    payload: PushPayload | MovePayload | TombstonePayload | PathPayload,
  ): void {
    const opId = randomUUID();
    this.#database.pendingOps.enqueue({ opId, kind, payload });
    if (kind === 'push' || kind === 'meta' || kind === 'link') {
      const relPath = 'relPath' in payload ? payload.relPath : '';
      appendTo(index, relPath, { opId, kind, state: 'queued' });
    }
  }

  #enqueue(intent: PushIntent, index: PushIndex): void {
    if (intent.kind === 'push') this.#enqueuePush(intent.record, index);
    else if (intent.kind === 'meta') this.#enqueueMeta(intent.record, index);
    else if (intent.kind === 'link') this.#enqueueLink(intent.record, index);
    else if (intent.kind === 'move') this.#enqueueMove(intent, index);
    else this.#enqueueTombstone(intent, index);
  }

  #enqueuePush(record: FileRecord, index: PushIndex): void {
    if (!isHashedFile(record)) throw new PushNotReadyError(record.relPath);
    this.#dropAt(index, (relPath) => relPath === record.relPath, ['push', 'meta', 'link']);
    this.#add(index, 'push', pushPayloadOf(record));
  }

  #enqueueMeta(record: FileRecord, index: PushIndex): void {
    const waiting = index.get(record.relPath) ?? [];
    const covered = waiting.some((entry) => entry.state === 'queued');
    if (!covered) this.#add(index, 'meta', { relPath: record.relPath });
  }

  #enqueueLink(record: FileRecord, index: PushIndex): void {
    this.#dropAt(index, (relPath) => relPath === record.relPath, ['push', 'meta', 'link']);
    this.#add(index, 'link', { relPath: record.relPath });
  }

  #enqueueMove(intent: Extract<PushIntent, { readonly kind: 'move' }>, index: PushIndex): void {
    const dropped = this.#dropAt(index, (relPath) => relPath === intent.from, [
      'push',
      'meta',
      'link',
    ]);
    this.#add(index, 'move', { from: intent.from, to: intent.to, baseRev: intent.baseRev });
    if (dropped.length === 0) return;
    const moved = this.#database.files.get(this.#placementId, intent.to);
    if (moved === undefined) return;
    if (dropped.some((entry) => entry.kind !== 'meta')) {
      for (const next of pushIntentOf(moved, intent.to)) this.#enqueue(next, index);
    } else {
      this.#enqueue({ kind: 'meta', record: moved }, index);
    }
  }

  #enqueueTombstone(
    intent: Extract<PushIntent, { readonly kind: 'tombstone' }>,
    index: PushIndex,
  ): void {
    const prefix = `${intent.relPath}/`;
    this.#dropAt(index, (relPath) => relPath === intent.relPath || relPath.startsWith(prefix), [
      'push',
      'meta',
      'link',
    ]);
    this.#add(index, 'tombstone', { relPath: intent.relPath, baseRev: intent.baseRev });
  }
}
