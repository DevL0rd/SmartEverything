import { LOCK_TYPES, type RequestMeta, type ReplyMeta } from '@smarteverything/domain/drive-mount';
import { posix } from '../posix/errors';
import { LockTable, type LockKind, type LockOwner, type LockRelease, type LockSpec } from './locks';
import { sessionKey, type MountSession } from './session';

interface Waiter {
  readonly resolve: () => void;
  readonly reject: (cause: unknown) => void;
  readonly promise: Promise<void>;
}

function kindOf(type: number): LockKind {
  return type === LOCK_TYPES.write ? 'write' : 'read';
}

function typeOf(kind: LockKind): 1 | 2 {
  return kind === 'write' ? LOCK_TYPES.write : LOCK_TYPES.read;
}

function signature(spec: LockSpec): string {
  return [
    spec.owner.session,
    spec.ino,
    spec.owner.owner,
    spec.kind,
    spec.start,
    spec.end,
    spec.flock,
  ].join('|');
}

function waiterOf(): Waiter {
  const settle = { resolve: (): void => undefined, reject: (_cause: unknown): void => undefined };
  const promise = new Promise<void>((resolve, reject) => {
    settle.resolve = resolve;
    settle.reject = reject;
  });
  return { ...settle, promise };
}

export class LockService {
  readonly table: LockTable;
  private nextId = 1;
  private readonly waiters = new Map<number, Waiter>();
  private readonly pending = new Map<string, { readonly id: number; readonly waiter: Waiter }>();

  constructor(leaseMs: number) {
    this.table = new LockTable(leaseMs);
  }

  ownerOf(session: MountSession | string, owner: bigint): LockOwner {
    return { session: typeof session === 'string' ? session : session.key, owner };
  }

  apply(release: LockRelease): void {
    for (const grant of release.granted) this.settle(grant.id, undefined);
    for (const id of release.cancelled) {
      this.settle(id, posix('EINTR', 'The lock request was cancelled.'));
    }
  }

  private settle(id: number, failure: unknown): void {
    const waiter = this.waiters.get(id);
    if (waiter === undefined) return;
    this.waiters.delete(id);
    for (const [key, entry] of this.pending) if (entry.id === id) this.pending.delete(key);
    if (failure === undefined) waiter.resolve();
    else waiter.reject(failure);
  }

  async set(
    session: MountSession,
    request: RequestMeta<'SETLK'>,
    track: (lockId: number) => void,
  ): Promise<void> {
    const id = this.nextId;
    const spec: LockSpec = {
      ino: request.ino,
      owner: this.ownerOf(session, request.owner),
      kind: kindOf(request.type),
      start: request.start,
      end: request.end,
      pid: request.pid,
      flock: request.flock,
    };
    const joined = this.pending.get(signature(spec));
    if (joined !== undefined) {
      track(joined.id);
      return joined.waiter.promise;
    }
    this.nextId += 1;
    const outcome = this.table.setLock({ ...spec, id, wait: request.wait });
    this.apply(outcome.released);
    if (outcome.status === 'granted') return;
    if (outcome.status === 'conflict') throw posix('EAGAIN', 'Another computer holds that lock.');
    if (outcome.status === 'deadlock') throw posix('EDEADLK', 'Waiting would deadlock.');
    const waiter = waiterOf();
    this.waiters.set(id, waiter);
    this.pending.set(signature(spec), { id, waiter });
    track(id);
    return waiter.promise;
  }

  cancel(lockId: number): void {
    const release = this.table.cancel(lockId);
    if (release !== null) this.apply(release);
  }

  get(session: MountSession, request: RequestMeta<'GETLK'>): ReplyMeta<'GETLK'> {
    const conflict = this.table.getLock({
      ino: request.ino,
      owner: this.ownerOf(session, request.owner),
      kind: kindOf(request.type),
      start: request.start,
      end: request.end,
      flock: false,
    });
    if (conflict === null) return { lock: null };
    return {
      lock: {
        type: typeOf(conflict.kind),
        start: conflict.start,
        end: conflict.end,
        pid: conflict.pid,
      },
    };
  }

  unlock(session: MountSession, request: RequestMeta<'UNLOCK'>): void {
    this.apply(
      this.table.unlock(request.ino, this.ownerOf(session, request.owner), {
        start: request.start,
        end: request.end,
        flock: request.flock,
      }),
    );
  }

  release(session: MountSession): void {
    this.apply(this.table.releaseSession(session.key));
  }

  reclaim(
    session: MountSession,
    previous: Uint8Array | null,
    held: readonly RequestMeta<'HELLO'>['locks'][number][],
  ): readonly LockSpec[] {
    const specs: LockSpec[] = held.map((lock) => ({
      ino: lock.ino,
      owner: this.ownerOf(session, lock.owner),
      kind: kindOf(lock.type),
      start: lock.start,
      end: lock.end,
      pid: lock.pid,
      flock: lock.flock,
    }));
    const result = this.table.reclaim(
      session.key,
      previous === null ? null : sessionKey(previous),
      specs,
    );
    this.apply(result.released);
    return result.lost;
  }
}
