import {
  REQUEST_META,
  REQUEST_OPS,
  REQUEST_OP_NAMES,
  decodeKeyed,
  hasKey,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import { PosixError, posixErrorOf } from '../posix/errors';
import type { MountServices } from './services';
import type { MountSession } from './session';

export type MutationName =
  | 'SETATTR'
  | 'MKDIR'
  | 'CREATE'
  | 'MKNOD'
  | 'SYMLINK'
  | 'LINK'
  | 'UNLINK'
  | 'RMDIR'
  | 'RENAME'
  | 'TMPFILE'
  | 'SETXATTR'
  | 'REMOVEXATTR'
  | 'BEGIN'
  | 'END'
  | 'PUT'
  | 'FSYNC';

export interface Entry {
  readonly parent: number;
  readonly name: string;
}

export interface Claim {
  readonly hold: readonly number[];
  readonly children: readonly Entry[];
}

export interface Resolver {
  readonly commitInode: (commit: number) => number;
  readonly child: (entry: Entry) => Promise<number | null>;
}

export type Resolvers = (session: MountSession) => Resolver;

export function resolversOf(
  services: Pick<MountServices, 'store' | 'commits' | 'posix'>,
): Resolvers {
  const { store, commits, posix } = services;
  return (session) => ({
    commitInode: (commit): number => commits.commitOf(session, commit).inodeId,
    child: async (entry): Promise<number | null> => {
      try {
        return (await posix.lookup(session.scopeOf(store, entry.parent), entry)).ino;
      } catch (cause) {
        const known = posixErrorOf(cause);
        if (known instanceof PosixError && known.code === 'ENOENT') return null;
        throw cause;
      }
    },
  });
}

function held(...keys: readonly number[]): Claim {
  return { hold: keys, children: [] };
}

type Claimer = (meta: Uint8Array, resolver: Resolver) => Claim;

function named(entry: Entry): Claim {
  return { hold: [entry.parent], children: [{ parent: entry.parent, name: entry.name }] };
}

const CLAIMS: Readonly<Record<MutationName, Claimer>> = {
  SETATTR: (meta) => held(decodeKeyed(REQUEST_META, 'SETATTR', meta).ino),
  SETXATTR: (meta) => held(decodeKeyed(REQUEST_META, 'SETXATTR', meta).ino),
  REMOVEXATTR: (meta) => held(decodeKeyed(REQUEST_META, 'REMOVEXATTR', meta).ino),
  FSYNC: (meta) => held(decodeKeyed(REQUEST_META, 'FSYNC', meta).ino),
  BEGIN: (meta) => held(decodeKeyed(REQUEST_META, 'BEGIN', meta).ino),
  PUT: (meta) => held(decodeKeyed(REQUEST_META, 'PUT', meta).ino),
  END: (meta, resolver) =>
    held(resolver.commitInode(decodeKeyed(REQUEST_META, 'END', meta).commit)),
  MKDIR: (meta) => held(decodeKeyed(REQUEST_META, 'MKDIR', meta).parent),
  CREATE: (meta) => held(decodeKeyed(REQUEST_META, 'CREATE', meta).parent),
  MKNOD: (meta) => held(decodeKeyed(REQUEST_META, 'MKNOD', meta).parent),
  SYMLINK: (meta) => held(decodeKeyed(REQUEST_META, 'SYMLINK', meta).parent),
  TMPFILE: (meta) => held(decodeKeyed(REQUEST_META, 'TMPFILE', meta).parent),
  LINK: (meta) => {
    const link = decodeKeyed(REQUEST_META, 'LINK', meta);
    return held(link.parent, link.ino);
  },
  UNLINK: (meta) => named(decodeKeyed(REQUEST_META, 'UNLINK', meta)),
  RMDIR: (meta) => named(decodeKeyed(REQUEST_META, 'RMDIR', meta)),
  RENAME: (meta) => {
    const rename = decodeKeyed(REQUEST_META, 'RENAME', meta);
    return {
      hold: [rename.parent, rename.newParent],
      children: [
        { parent: rename.parent, name: rename.name },
        { parent: rename.newParent, name: rename.newName },
      ],
    };
  },
};

export function isMutation(name: RequestOpName): name is MutationName {
  return hasKey(CLAIMS, name);
}

export function laneMismatches(): readonly RequestOpName[] {
  return REQUEST_OP_NAMES.filter(
    (name) => (REQUEST_OPS[name].lane === 'mutation') !== hasKey(CLAIMS, name),
  );
}

export function claimOf(name: MutationName, meta: Uint8Array, resolver: Resolver): Claim {
  return CLAIMS[name](meta, resolver);
}

interface Slot {
  readonly arrival: number;
  readonly done: Promise<void>;
}

export type Earlier = (keys: readonly number[]) => Promise<void>;

export class Lanes {
  private arrivals = 0;
  private readonly queues = new Map<number, Slot[]>();

  run(hold: readonly number[], work: (earlier: Earlier) => Promise<void>): Promise<void> {
    this.arrivals += 1;
    const arrival = this.arrivals;
    const keys = [...new Set(hold)];
    const before: Promise<void>[] = [];
    for (const key of keys) {
      const tail = this.queues.get(key)?.at(-1);
      if (tail !== undefined) before.push(tail.done);
    }
    let release = (): void => undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slot: Slot = { arrival, done };
    for (const key of keys) this.queueOf(key).push(slot);
    const earlier: Earlier = (others) => this.before(others, arrival);
    const finished = (): void => {
      for (const key of keys) this.leave(key, slot);
      release();
    };
    return Promise.all(before)
      .then(() => work(earlier))
      .finally(finished);
  }

  get pending(): number {
    return this.queues.size;
  }

  private before(keys: readonly number[], arrival: number): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const key of new Set(keys)) {
      const queue = this.queues.get(key);
      if (queue === undefined) continue;
      const prior = queue.findLast((slot) => slot.arrival < arrival);
      if (prior !== undefined) waits.push(prior.done);
    }
    return Promise.all(waits).then(() => undefined);
  }

  private queueOf(key: number): Slot[] {
    let queue = this.queues.get(key);
    if (queue === undefined) {
      queue = [];
      this.queues.set(key, queue);
    }
    return queue;
  }

  private leave(key: number, slot: Slot): void {
    const queue = this.queues.get(key);
    if (queue === undefined) return;
    const index = queue.indexOf(slot);
    if (index !== -1) queue.splice(index, 1);
    if (queue.length === 0) this.queues.delete(key);
  }
}

export async function childKeys(claim: Claim, resolver: Resolver): Promise<readonly number[]> {
  const found = await Promise.all(claim.children.map((entry) => resolver.child(entry)));
  return found.filter((ino): ino is number => ino !== null);
}
