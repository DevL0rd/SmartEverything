import type { IncomingMessage } from 'node:http';
import { ApiError } from '@smarteverything/domain';
import type { SyncFileMeta, SyncHubMessage, SyncXattr } from '@smarteverything/domain/drive-sync';
import { SYNC_HUB_MESSAGE } from '@smarteverything/domain/drive-sync';
import type { ComputerNodeAccess } from '../../computers/node-access';
import { fsCode } from '../../fs-code';
import { profileIdOf } from '../../server/auth';
import { bearerOf } from '../../server/http';
import type { Store } from '../../store/store';
import type { ChangeActor, ChangeEnv } from '../changes';
import type { ConflictEnv } from '../conflicts';
import { DriveWriteError } from '../write-error';
import { nodeCaller } from '../node-caller';
import { DrivePathError } from '../paths';
import { PosixError } from '../posix/errors';
import type { DrivePosix } from '../posix/service';
import { DriveFreeSpaceError, DriveQuotaExceededError } from '../quotas';
import type { DriveActor } from '../access';
import type { DataSpaceProbe } from '../data-space';
import type { ContentHasher } from '../hasher';

export interface SyncNode {
  readonly deviceId: string;
  readonly profileId: string;
  readonly actor: DriveActor;
}

export type SyncPosix = Pick<
  DrivePosix,
  'setattr' | 'symlink' | 'link' | 'setxattr' | 'removexattr' | 'listxattr' | 'getxattr'
>;

export interface SyncEnv extends ConflictEnv {
  readonly store: ChangeEnv['store'] & Pick<Store, 'host' | 'now'>;
  readonly posix: SyncPosix;
  readonly space: DataSpaceProbe['space'];
  readonly hasher: Pick<ContentHasher, 'hash'>;
  readonly authenticate: (request: IncomingMessage) => Promise<SyncNode | null>;
}

export function syncAuthentication(
  store: Store,
  nodes: Pick<ComputerNodeAccess, 'authenticate'>,
): (request: IncomingMessage) => Promise<SyncNode | null> {
  return async (request) => {
    const token = bearerOf(request);
    if (token === null) return null;
    try {
      const identity = await nodes.authenticate(token);
      const caller = await nodeCaller(store, identity);
      const profileId = profileIdOf(caller);
      return {
        deviceId: identity.device_id,
        profileId,
        actor: { profileId },
      };
    } catch (cause) {
      if (cause instanceof ApiError) return null;
      throw cause;
    }
  };
}

export type AcceptMessage = Extract<SyncHubMessage, { readonly type: 'accept' }>;
export type ConflictMessage = Extract<SyncHubMessage, { readonly type: 'conflict' }>;
export type NeedBlocksMessage = Extract<SyncHubMessage, { readonly type: 'need_blocks' }>;
export type ConflictReason = ConflictMessage['reason'];

export interface Origin {
  readonly placementId: string;
  readonly deviceId: string;
  readonly profileId: string;
}

export function syncActor(origin: Pick<Origin, 'deviceId' | 'profileId'>): ChangeActor {
  return { actorProfileId: origin.profileId, via: 'sync', deviceId: origin.deviceId };
}

export async function acceptOf(
  env: SyncEnv,
  rootId: string,
  opId: string,
  rev: number,
): Promise<AcceptMessage> {
  return {
    type: 'accept',
    opId,
    rev,
    seq: await env.store.host.call('driveFeed', 'latestSeqInRoot', rootId),
  };
}

export function conflictOf(
  opId: string,
  reason: ConflictReason,
  hubRev: number,
  conflictPath: string | null,
): ConflictMessage {
  return { type: 'conflict', opId, reason, conflictPath, hubRev };
}

export async function remember(
  env: SyncEnv,
  origin: Pick<Origin, 'placementId'>,
  message: AcceptMessage | ConflictMessage,
): Promise<void> {
  await env.store.host.call('driveSyncOps', 'remember', origin.placementId, message.opId, message);
}

export async function recall(
  env: SyncEnv,
  origin: Pick<Origin, 'placementId'>,
  opId: string,
): Promise<AcceptMessage | ConflictMessage | null> {
  const stored = await env.store.host.call('driveSyncOps', 'recall', origin.placementId, opId);
  if (stored === undefined) return null;
  const message = SYNC_HUB_MESSAGE.parse(stored);
  if (message.type !== 'accept' && message.type !== 'conflict') {
    throw new ApiError('internal', 'A remembered sync result is neither accepted nor refused.');
  }
  return message;
}

const WRITE_FAILURE_CODE = {
  'read-only': 'forbidden',
  'no-physical-root': 'forbidden',
  exists: 'conflict',
  missing: 'not_found',
  corrupt: 'internal',
} as const;

const POSIX_API_CODES: Readonly<Record<string, ApiError['code']>> = {
  ENOENT: 'not_found',
  EACCES: 'forbidden',
  EPERM: 'forbidden',
  EEXIST: 'conflict',
  ESTALE: 'conflict',
  ENOSPC: 'payload_too_large',
  EDQUOT: 'payload_too_large',
};

export function apiErrorOf(cause: unknown): ApiError | null {
  if (cause instanceof ApiError) return cause;
  if (cause instanceof PosixError) {
    return new ApiError(POSIX_API_CODES[cause.code] ?? 'invalid_request', cause.message);
  }
  if (cause instanceof DriveQuotaExceededError) {
    return new ApiError('payload_too_large', cause.message);
  }
  if (cause instanceof DriveFreeSpaceError || fsCode(cause) === 'ENOSPC') {
    return new ApiError('payload_too_large', 'The disk has no space left for this file.');
  }
  if (cause instanceof DriveWriteError) {
    return new ApiError(WRITE_FAILURE_CODE[cause.failure], cause.message);
  }
  if (cause instanceof DrivePathError) return new ApiError('invalid_request', cause.message);
  return null;
}

export interface TxnSpec extends Origin {
  readonly id: string;
  readonly opId: string;
  readonly rootId: string;
  readonly relPath: string;
  readonly baseRev: number | null;
  readonly meta: SyncFileMeta;
  readonly mode: number;
  readonly xattrs: readonly SyncXattr[];
  readonly hashes: readonly string[];
  readonly tmpRel: string;
}

export class SyncTxn {
  private wanted: ReadonlySet<number>;
  private readonly arrived = new Set<number>();
  private writers = 0;
  private committing = false;

  constructor(
    readonly spec: TxnSpec,
    wanted: readonly number[],
  ) {
    this.wanted = new Set(wanted);
  }

  belongsTo(deviceId: string, profileId: string): boolean {
    return this.spec.deviceId === deviceId && this.spec.profileId === profileId;
  }

  wants(index: number): boolean {
    return this.wanted.has(index);
  }

  want(indexes: readonly number[]): void {
    this.wanted = new Set(indexes);
    for (const index of indexes) this.arrived.delete(index);
  }

  arrive(index: number): void {
    this.arrived.add(index);
  }

  hasArrived(index: number): boolean {
    return this.arrived.has(index);
  }

  beginWrite(): boolean {
    if (this.committing) return false;
    this.writers += 1;
    return true;
  }

  endWrite(): void {
    this.writers -= 1;
  }

  lockCommit(): boolean {
    if (this.committing || this.writers > 0) return false;
    this.committing = true;
    return true;
  }

  unlockCommit(): void {
    this.committing = false;
  }
}

export class SyncTxns {
  private readonly byId = new Map<string, SyncTxn>();
  private readonly byKey = new Map<string, string>();

  open(txn: SyncTxn): SyncTxn | undefined {
    const key = `${txn.spec.deviceId}\u0000${txn.spec.rootId}\u0000${txn.spec.relPath}`;
    const earlier = this.find(this.byKey.get(key) ?? '');
    if (earlier !== undefined) this.drop(earlier);
    this.byId.set(txn.spec.id, txn);
    this.byKey.set(key, txn.spec.id);
    return earlier;
  }

  find(id: string): SyncTxn | undefined {
    return this.byId.get(id);
  }

  drop(txn: SyncTxn): void {
    this.byId.delete(txn.spec.id);
    const key = `${txn.spec.deviceId}\u0000${txn.spec.rootId}\u0000${txn.spec.relPath}`;
    if (this.byKey.get(key) === txn.spec.id) this.byKey.delete(key);
  }

  ofDevice(deviceId: string): readonly SyncTxn[] {
    return [...this.byId.values()].filter((txn) => txn.spec.deviceId === deviceId);
  }
}

export class RootQueues {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(rootId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(rootId) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(rootId, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(rootId) === tail) this.tails.delete(rootId);
    }
  }
}
