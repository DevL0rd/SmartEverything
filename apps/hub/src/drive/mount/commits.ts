import {
  ALLOCATE_MODES,
  type ReplyMeta,
  type RequestMeta,
} from '@smarteverything/domain/drive-mount';
import { messageOf } from '@smarteverything/logging';
import type { ByteRange, DriveMountCommitHead } from '../../store/repositories/drive-mount-commits';
import type { PosixChangeEnv, PosixScope } from '../posix/env';
import { posix } from '../posix/errors';
import type { DrivePosix } from '../posix/service';
import type { HandleTable } from './handles';
import type { MountSession } from './session';
import type { Staging } from './staging';

export interface CommitEnv {
  readonly posix: DrivePosix;
  readonly change: PosixChangeEnv;
  readonly staging: Staging;
  readonly handles: HandleTable;
}

export function wireRanges(ranges: readonly ByteRange[]): readonly (readonly [number, number])[] {
  return ranges.map(([start, end]) => [start, end - start] as const);
}

export function addRange(ranges: [number, number][], start: number, end: number): void {
  if (start >= end) return;
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((ranges[middle]?.[1] ?? 0) < start) low = middle + 1;
    else high = middle;
  }
  let last = low;
  let merged: [number, number] = [start, end];
  for (let next = ranges[last]; next !== undefined && next[0] <= end; next = ranges[last]) {
    merged = [Math.min(merged[0], next[0]), Math.max(merged[1], next[1])];
    last += 1;
  }
  ranges.splice(low, last - low, merged);
}

interface Received {
  readonly ranges: [number, number][];
  dirty: boolean;
}

export class MountCommits {
  private readonly received = new Map<number, Received>();
  private readonly writing = new Map<number, Set<Promise<void>>>();
  private readonly failures = new Map<number, Error>();
  private flushQueued = false;

  constructor(private readonly env: CommitEnv) {}

  rangesOf(row: DriveMountCommitHead): readonly ByteRange[] {
    return this.received.get(row.id)?.ranges ?? this.repo.ranges(row.id);
  }

  receive(row: DriveMountCommitHead, range: ByteRange): void {
    let entry = this.received.get(row.id);
    if (entry === undefined) {
      entry = {
        ranges: this.repo.ranges(row.id).map(([start, end]) => [start, end]),
        dirty: false,
      };
      this.received.set(row.id, entry);
    }
    addRange(entry.ranges, range[0], range[1]);
    entry.dirty = true;
    if (this.flushQueued) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      this.flush();
    });
  }

  cutReceived(row: DriveMountCommitHead, size: number): void {
    const kept = this.rangesOf(row).flatMap(([start, end]): [number, number][] =>
      start < size ? [[start, Math.min(end, size)]] : [],
    );
    this.received.set(row.id, { ranges: kept, dirty: false });
    this.env.change.store.write(() => {
      this.repo.setRanges(row.id, kept);
    });
  }

  settled(id: number): void {
    this.received.delete(id);
    this.failures.delete(id);
  }

  private flush(): void {
    const dirty = [...this.received].filter(([, entry]) => entry.dirty);
    if (dirty.length === 0) return;
    this.env.change.store.write(() => {
      for (const [id, entry] of dirty) {
        this.repo.setRanges(id, entry.ranges);
        entry.dirty = false;
      }
    });
  }

  private get repo(): PosixChangeEnv['store']['driveMountCommits'] {
    return this.env.change.store.driveMountCommits;
  }

  commitOf(session: MountSession, id: number): DriveMountCommitHead {
    const row = this.repo.head(id);
    if (row?.nodeId !== session.nodeId)
      throw posix('ESTALE', `The commit ${String(id)} is unknown.`);
    return row;
  }

  openCommit(session: MountSession, id: number): DriveMountCommitHead {
    const row = this.commitOf(session, id);
    if (row.state !== 'open') throw posix('ESTALE', `The commit ${String(id)} is not open.`);
    return row;
  }

  async begin(session: MountSession, request: RequestMeta<'BEGIN'>): Promise<ReplyMeta<'BEGIN'>> {
    const scope = session.scopeOf(this.env.change.store, request.ino);
    await this.env.posix.openTarget(scope, request.ino, true);
    const commit = this.repo.begin({
      placementId: scope.placementId,
      nodeId: session.nodeId,
      inodeId: request.ino,
      opKey: request.opKey,
      baseRev: request.baseRev,
    });
    if (commit.state === 'aborted') throw posix('ESTALE', 'That commit was aborted.');
    if (commit.state === 'open') await this.env.staging.ensure(scope.drive.id, commit.id);
    return { commit: commit.id, ranges: wireRanges(this.rangesOf(commit)) };
  }

  write(session: MountSession, request: RequestMeta<'WRITE'>, payload: Uint8Array): Promise<void> {
    const row = this.openCommit(session, request.commit);
    const scope = session.scopeOfPlacement(row.placementId);
    return this.track(row.id, async () => {
      await this.env.staging.write(
        { rootId: scope.drive.id, commitId: row.id },
        request.offset,
        payload,
      );
      if (payload.length > 0) this.receive(row, [request.offset, request.offset + payload.length]);
    });
  }

  allocate(session: MountSession, request: RequestMeta<'ALLOCATE'>): Promise<void> {
    const row = this.openCommit(session, request.commit);
    if (request.mode === ALLOCATE_MODES.allocate || request.mode === ALLOCATE_MODES.keepSize)
      return Promise.resolve();
    const scope = session.scopeOfPlacement(row.placementId);
    return this.track(row.id, async () => {
      await this.env.staging.zero(
        { rootId: scope.drive.id, commitId: row.id },
        { offset: request.offset, length: request.length },
      );
      this.receive(row, [request.offset, request.offset + request.length]);
    });
  }

  private track(id: number, work: () => Promise<void>): Promise<void> {
    let jobs = this.writing.get(id);
    if (jobs === undefined) {
      jobs = new Set();
      this.writing.set(id, jobs);
    }
    const job = work().catch((cause: unknown) => {
      if (!this.failures.has(id)) {
        this.failures.set(id, cause instanceof Error ? cause : new Error(messageOf(cause)));
      }
      throw cause;
    });
    const held = jobs;
    const settled: Promise<void> = job
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        held.delete(settled);
        if (held.size === 0 && this.writing.get(id) === held) this.writing.delete(id);
      });
    held.add(settled);
    return job;
  }

  async drained(id: number): Promise<void> {
    const jobs = this.writing.get(id);
    if (jobs !== undefined) await Promise.allSettled([...jobs]);
    const failure = this.failures.get(id);
    if (failure === undefined) return;
    this.failures.delete(id);
    throw failure;
  }

  state(session: MountSession, request: RequestMeta<'STATE'>): ReplyMeta<'STATE'> {
    const row = this.repo.find(request.commit);
    if (row?.nodeId !== session.nodeId || row.state === 'aborted') return { ranges: null };
    return { ranges: wireRanges(this.rangesOf(row)) };
  }

  async abort(session: MountSession, request: RequestMeta<'ABORT'>): Promise<void> {
    const row = this.repo.find(request.commit);
    if (row?.nodeId !== session.nodeId) return;
    if (row.state === 'open') this.abortRow(row.id);
    const scope = session.attachments.get(row.placementId)?.scope;
    if (scope !== undefined && row.state !== 'done') {
      await this.env.staging.remove(scope.drive.id, row.id);
    }
  }

  abortRow(id: number): void {
    this.received.delete(id);
    this.failures.delete(id);
    this.repo.abort(id);
  }

  forget(session: MountSession, request: RequestMeta<'FORGET'>): void {
    for (const id of request.commits) {
      const row = this.repo.find(id);
      if (row?.nodeId === session.nodeId) this.repo.forget(row.placementId, [id]);
    }
  }

  scopeOf(session: MountSession, row: DriveMountCommitHead): PosixScope {
    return session.scopeOfPlacement(row.placementId);
  }
}
