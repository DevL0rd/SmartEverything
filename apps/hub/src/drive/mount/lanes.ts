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
  | 'RMTREE'
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

export type LaneKey = number | string;

export interface Claim {
  readonly hold: readonly LaneKey[];
  readonly shared: readonly LaneKey[];
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
  return { hold: keys, shared: [], children: [] };
}

function nameKey(parent: number, name: string): string {
  return `${String(parent)}/${name}`;
}

function inFolder(made: {
  readonly parent: number;
  readonly name: string;
  readonly ino: number;
}): Claim {
  return { hold: [made.ino, nameKey(made.parent, made.name)], shared: [made.parent], children: [] };
}

type Claimer = (meta: Uint8Array, resolver: Resolver) => Claim;

const CLAIMS: Readonly<Record<MutationName, Claimer>> = {
  SETATTR: (meta) => held(decodeKeyed(REQUEST_META, 'SETATTR', meta).ino),
  SETXATTR: (meta) => held(decodeKeyed(REQUEST_META, 'SETXATTR', meta).ino),
  REMOVEXATTR: (meta) => held(decodeKeyed(REQUEST_META, 'REMOVEXATTR', meta).ino),
  FSYNC: (meta) => held(decodeKeyed(REQUEST_META, 'FSYNC', meta).ino),
  BEGIN: (meta) => held(decodeKeyed(REQUEST_META, 'BEGIN', meta).ino),
  PUT: (meta) => held(decodeKeyed(REQUEST_META, 'PUT', meta).ino),
  END: (meta, resolver) =>
    held(resolver.commitInode(decodeKeyed(REQUEST_META, 'END', meta).commit)),
  MKDIR: (meta) => inFolder(decodeKeyed(REQUEST_META, 'MKDIR', meta)),
  CREATE: (meta) => inFolder(decodeKeyed(REQUEST_META, 'CREATE', meta)),
  MKNOD: (meta) => inFolder(decodeKeyed(REQUEST_META, 'MKNOD', meta)),
  SYMLINK: (meta) => inFolder(decodeKeyed(REQUEST_META, 'SYMLINK', meta)),
  TMPFILE: (meta) => held(decodeKeyed(REQUEST_META, 'TMPFILE', meta).parent),
  LINK: (meta) => {
    const link = decodeKeyed(REQUEST_META, 'LINK', meta);
    return held(link.parent, link.ino);
  },
  UNLINK: (meta) => inFolder(decodeKeyed(REQUEST_META, 'UNLINK', meta)),
  RMDIR: (meta) => inFolder(decodeKeyed(REQUEST_META, 'RMDIR', meta)),
  RMTREE: (meta) => {
    const tree = decodeKeyed(REQUEST_META, 'RMTREE', meta);
    const folder = inFolder(tree);
    return { ...folder, hold: [...folder.hold, ...tree.inodes] };
  },
  RENAME: (meta) => {
    const rename = decodeKeyed(REQUEST_META, 'RENAME', meta);
    return {
      hold: [rename.parent, rename.newParent],
      shared: [],
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
  readonly shared: boolean;
  readonly done: Promise<void>;
}

export type Earlier = (keys: readonly LaneKey[]) => Promise<void>;

export class Lanes {
  private arrivals = 0;
  private readonly queues = new Map<LaneKey, Slot[]>();

  run(
    hold: readonly LaneKey[],
    work: (earlier: Earlier) => Promise<void>,
    shared: readonly LaneKey[] = [],
  ): Promise<void> {
    this.arrivals += 1;
    const arrival = this.arrivals;
    const exclusive = new Set(hold);
    const keys = [...exclusive, ...new Set(shared.filter((key) => !exclusive.has(key)))];
    const before: Promise<void>[] = [];
    for (const key of keys) {
      for (const slot of this.queues.get(key) ?? []) {
        if (exclusive.has(key) || !slot.shared) before.push(slot.done);
      }
    }
    let release = (): void => undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slots = keys.map((key) => ({
      key,
      slot: { arrival, shared: !exclusive.has(key), done },
    }));
    for (const { key, slot } of slots) this.queueOf(key).push(slot);
    const earlier: Earlier = (others) => this.before(others, arrival);
    const finished = (): void => {
      for (const { key, slot } of slots) this.leave(key, slot);
      release();
    };
    return Promise.all(before)
      .then(() => work(earlier))
      .finally(finished);
  }

  get pending(): number {
    return this.queues.size;
  }

  private before(keys: readonly LaneKey[], arrival: number): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const key of new Set(keys)) {
      for (const slot of this.queues.get(key) ?? []) {
        if (slot.arrival < arrival) waits.push(slot.done);
      }
    }
    return Promise.all(waits).then(() => undefined);
  }

  private queueOf(key: LaneKey): Slot[] {
    let queue = this.queues.get(key);
    if (queue === undefined) {
      queue = [];
      this.queues.set(key, queue);
    }
    return queue;
  }

  private leave(key: LaneKey, slot: Slot): void {
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
