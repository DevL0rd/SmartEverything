import { randomBytes } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import type { PosixScope, PosixCaller } from '../posix/env';
import { posix } from '../posix/errors';
import type { Store } from '../../store/store';

export interface MountLink {
  readonly send: (bytes: Uint8Array) => void;
  readonly close: (code: number, reason: string) => void;
}

export class Attachment {
  private seq: number;

  constructor(
    readonly scope: PosixScope,
    sentSeq: number,
  ) {
    this.seq = sentSeq;
  }

  get sentSeq(): number {
    return this.seq;
  }

  advance(seq: number): void {
    this.seq = seq;
  }
}

export class OpenHandle {
  private file: FileHandle | null = null;
  private inodeIdentity: bigint | null = null;
  private path: string;

  constructor(
    readonly id: number,
    readonly ino: number,
    readonly scope: PosixScope,
    relPath: string,
  ) {
    this.path = relPath;
  }

  get relPath(): string {
    return this.path;
  }

  get fd(): FileHandle | null {
    return this.file;
  }

  get identity(): bigint | null {
    return this.inodeIdentity;
  }

  retarget(relPath: string): void {
    this.path = relPath;
  }

  swap(file: FileHandle, identity: bigint): FileHandle | null {
    const previous = this.file;
    this.file = file;
    this.inodeIdentity = identity;
    return previous;
  }
}

export interface Cancellable {
  readonly cancel: () => void;
}

export function sessionKey(id: Uint8Array): string {
  return Buffer.from(id).toString('hex');
}

export class MountSession {
  readonly id: Uint8Array<ArrayBuffer> = new Uint8Array(randomBytes(16));
  readonly key: string = sessionKey(this.id);
  private current: MountLink | null = null;
  private timer: NodeJS.Timeout | null = null;
  readonly attachments = new Map<string, Attachment>();
  readonly handles = new Map<number, OpenHandle>();
  readonly inflight = new Map<bigint, Cancellable>();
  readonly helperSeqs = new Map<string, number>();
  private ledger = new Set<number>();
  private tail: Promise<unknown> = Promise.resolve();
  private handleCounter = 0;

  constructor(
    readonly nodeId: string,
    readonly caller: PosixCaller,
  ) {}

  get link(): MountLink | null {
    return this.current;
  }

  bind(link: MountLink | null): MountLink | null {
    const previous = this.current;
    this.current = link;
    return previous;
  }

  expireIn(timer: NodeJS.Timeout | null): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = timer;
  }

  enqueue(run: () => Promise<void>): void {
    this.tail = this.tail.then(run);
  }

  get journal(): ReadonlySet<number> {
    return this.ledger;
  }

  keepJournal(ids: readonly number[]): void {
    this.ledger = new Set(ids);
  }

  nextHandle(): number {
    this.handleCounter += 1;
    return this.handleCounter;
  }

  scopeOf(store: Pick<Store, 'driveInodes'>, ino: number): PosixScope {
    const inode = store.driveInodes.find(ino);
    if (inode === undefined) throw posix('ESTALE', `The inode ${String(ino)} does not exist.`);
    const candidates = [...this.attachments.values()]
      .map((attachment) => attachment.scope)
      .filter((scope) => scope.drive.id === inode.rootId);
    const whole = candidates.find((scope) => scope.baseId === null);
    const scope = whole ?? candidates[0];
    if (scope === undefined) throw posix('ESTALE', 'That drive is not attached to this session.');
    return scope;
  }

  scopeOfPlacement(placementId: string): PosixScope {
    const attachment = this.attachments.get(placementId);
    if (attachment === undefined)
      throw posix('ESTALE', 'That mount is not attached to this session.');
    return attachment.scope;
  }
}
