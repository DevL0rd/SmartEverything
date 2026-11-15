import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { BigIntStats } from 'node:fs';
import { lutimes } from 'node:fs/promises';
import type { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { SYNC_XATTRS, type SyncXattr } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import { z } from 'zod';

const NS_PER_MS = 1_000_000n;
const USER_PREFIX = 'user.';

export type FoundXattrs = ReadonlyMap<string, readonly SyncXattr[] | null>;

export interface MetaPort {
  readonly supported: boolean;
  readonly xattrsOf: (diskPaths: readonly string[]) => Promise<FoundXattrs>;
  readonly applyXattrs: (diskPath: string, xattrs: readonly SyncXattr[]) => Promise<void>;
  readonly setMtime: (diskPath: string, mtimeNs: bigint) => Promise<void>;
  readonly close: () => Promise<void>;
}

export class MetaPortError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MetaPortError';
  }
}

export function isUserXattr(xattr: SyncXattr): boolean {
  return xattr.name.startsWith(USER_PREFIX);
}

export function canonicalXattrs(xattrs: readonly SyncXattr[]): readonly SyncXattr[] {
  return [...xattrs].sort((first, second) => (first.name < second.name ? -1 : 1));
}

export function mergedXattrs(
  local: readonly SyncXattr[],
  foreign: readonly SyncXattr[],
): readonly SyncXattr[] {
  return canonicalXattrs([...local.filter(isUserXattr), ...foreign.filter((x) => !isUserXattr(x))]);
}

export function sameXattrs(first: readonly SyncXattr[], second: readonly SyncXattr[]): boolean {
  if (first.length !== second.length) return false;
  return first.every((xattr, at) => {
    const other = second[at];
    return other?.name === xattr.name && other.value === xattr.value;
  });
}

export function linkKeyOf(platform: NodeJS.Platform, info: BigIntStats): string | null {
  return platform !== 'win32' && info.isFile() && info.nlink > 1n
    ? `${info.dev.toString()}:${info.ino.toString()}`
    : null;
}

function momentOf(mtimeNs: bigint): Date {
  return new Date(Number((mtimeNs + NS_PER_MS / 2n) / NS_PER_MS));
}

export class NoXattrPort implements MetaPort {
  readonly supported = false;

  xattrsOf(diskPaths: readonly string[]): Promise<FoundXattrs> {
    return Promise.resolve(new Map(diskPaths.map((path) => [path, null])));
  }

  applyXattrs(): Promise<void> {
    return Promise.resolve();
  }

  setMtime(diskPath: string, mtimeNs: bigint): Promise<void> {
    const moment = momentOf(mtimeNs);
    return lutimes(diskPath, moment, moment);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const REPLY = z
  .strictObject({
    id: z.number(),
    ok: z.boolean(),
    entries: z
      .array(
        z.strictObject({
          path: z.string(),
          xattrs: z.array(z.strictObject({ name: z.string(), value: z.string() })),
          code: z.string().optional(),
        }),
      )
      .optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  })
  .readonly();

type Reply = z.infer<typeof REPLY>;

type MetaChild = ChildProcessByStdio<Writable, Readable, null>;

interface Waiter {
  readonly resolve: (reply: Reply) => void;
  readonly reject: (cause: Error) => void;
}

export interface HelperMetaOptions {
  readonly binary: string;
  readonly log: Logger;
}

class MetaChildExitedError extends Error {
  constructor() {
    super('The drive helper stopped answering extended attribute requests');
    this.name = 'MetaChildExitedError';
  }
}

export class HelperMetaPort implements MetaPort {
  readonly supported = true;
  readonly #options: HelperMetaOptions;
  readonly #waiters = new Map<number, Waiter>();
  #child: MetaChild | null = null;
  #next = 0;
  #closed = false;

  constructor(options: HelperMetaOptions) {
    this.#options = options;
  }

  async xattrsOf(diskPaths: readonly string[]): Promise<FoundXattrs> {
    const found = new Map<string, readonly SyncXattr[] | null>();
    if (diskPaths.length === 0) return found;
    const reply = await this.#call({ op: 'read', paths: diskPaths });
    for (const entry of reply.entries ?? []) {
      found.set(entry.path, entry.code === undefined ? SYNC_XATTRS.parse(entry.xattrs) : null);
    }
    return found;
  }

  async applyXattrs(diskPath: string, xattrs: readonly SyncXattr[]): Promise<void> {
    await this.#call({ op: 'xattrs', path: diskPath, xattrs });
  }

  async setMtime(diskPath: string, mtimeNs: bigint): Promise<void> {
    await this.#call({ op: 'mtime', path: diskPath, mtimeNs: mtimeNs.toString() });
  }

  async close(): Promise<void> {
    this.#closed = true;
    const child = this.#child;
    this.#child = null;
    if (child === null) return;
    const exited = new Promise<void>((resolve) => {
      child.once('close', () => {
        resolve();
      });
    });
    child.stdin.end();
    await exited;
  }

  #spawned(): MetaChild {
    if (this.#child !== null) return this.#child;
    const child = spawn(this.#options.binary, ['meta'], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.#child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      this.#answered(line);
    });
    child.stdin.on('error', (cause: Error) => {
      this.#options.log.warn('drive_sync.meta.pipe_failed', { error: messageOf(cause) });
    });
    child.once('error', (cause: Error) => {
      this.#lost(child, cause);
    });
    child.once('close', () => {
      this.#lost(child, new MetaChildExitedError());
    });
    return child;
  }

  #lost(child: MetaChild, cause: Error): void {
    if (this.#child === child) this.#child = null;
    const waiting = [...this.#waiters.values()];
    this.#waiters.clear();
    for (const waiter of waiting) waiter.reject(cause);
  }

  #answered(line: string): void {
    const reply = REPLY.parse(JSON.parse(line));
    const waiter = this.#waiters.get(reply.id);
    if (waiter === undefined) return;
    this.#waiters.delete(reply.id);
    waiter.resolve(reply);
  }

  async #call(request: Readonly<Record<string, unknown>>): Promise<Reply> {
    if (this.#closed) throw new MetaChildExitedError();
    const child = this.#spawned();
    this.#next += 1;
    const id = this.#next;
    const answer = new Promise<Reply>((resolve, reject) => {
      this.#waiters.set(id, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify({ id, ...request })}\n`);
    const reply = await answer;
    if (!reply.ok) {
      throw new MetaPortError(
        reply.code ?? 'EIO',
        reply.message ?? 'The helper refused the request',
      );
    }
    return reply;
  }
}

export interface MetaPortOptions {
  readonly binary: string;
  readonly platform: NodeJS.Platform;
  readonly log: Logger;
}

export function createMetaPort(options: MetaPortOptions): MetaPort {
  return options.platform === 'linux' ? new HelperMetaPort(options) : new NoXattrPort();
}
