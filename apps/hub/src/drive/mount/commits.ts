import {
  ALLOCATE_MODES,
  type ReplyMeta,
  type RequestMeta,
} from '@smarteverything/domain/drive-mount';
import type { DriveMountCommit } from '../../store/repositories/drive-mount-commits';
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

const COPY_CHUNK_BYTES = 1024 * 1024;

export function wireRanges(commit: DriveMountCommit): readonly (readonly [number, number])[] {
  return commit.ranges.map(([start, end]) => [start, end - start] as const);
}

export class MountCommits {
  constructor(private readonly env: CommitEnv) {}

  private get repo(): PosixChangeEnv['store']['driveMountCommits'] {
    return this.env.change.store.driveMountCommits;
  }

  commitOf(session: MountSession, id: number): DriveMountCommit {
    const row = this.repo.find(id);
    if (row?.nodeId !== session.nodeId)
      throw posix('ESTALE', `The commit ${String(id)} is unknown.`);
    return row;
  }

  private openCommit(session: MountSession, id: number): DriveMountCommit {
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
    return { commit: commit.id, ranges: wireRanges(commit) };
  }

  async write(
    session: MountSession,
    request: RequestMeta<'WRITE'>,
    payload: Uint8Array,
  ): Promise<void> {
    const row = this.openCommit(session, request.commit);
    const scope = session.scopeOfPlacement(row.placementId);
    await this.env.staging.write(
      { rootId: scope.drive.id, commitId: row.id },
      request.offset,
      payload,
    );
    if (payload.length > 0)
      this.repo.received(row.id, [request.offset, request.offset + payload.length]);
  }

  async allocate(session: MountSession, request: RequestMeta<'ALLOCATE'>): Promise<void> {
    const row = this.openCommit(session, request.commit);
    if (request.mode === ALLOCATE_MODES.allocate || request.mode === ALLOCATE_MODES.keepSize)
      return;
    const scope = session.scopeOfPlacement(row.placementId);
    await this.env.staging.zero(
      { rootId: scope.drive.id, commitId: row.id },
      { offset: request.offset, length: request.length },
    );
    this.repo.received(row.id, [request.offset, request.offset + request.length]);
  }

  state(session: MountSession, request: RequestMeta<'STATE'>): ReplyMeta<'STATE'> {
    const row = this.repo.find(request.commit);
    if (row?.nodeId !== session.nodeId || row.state === 'aborted') return { ranges: null };
    return { ranges: wireRanges(row) };
  }

  async abort(session: MountSession, request: RequestMeta<'ABORT'>): Promise<void> {
    const row = this.repo.find(request.commit);
    if (row?.nodeId !== session.nodeId) return;
    if (row.state === 'open') this.repo.abort(row.id);
    const scope = session.attachments.get(row.placementId)?.scope;
    if (scope !== undefined && row.state !== 'done') {
      await this.env.staging.remove(scope.drive.id, row.id);
    }
  }

  forget(session: MountSession, request: RequestMeta<'FORGET'>): void {
    for (const id of request.commits) {
      const row = this.repo.find(id);
      if (row?.nodeId === session.nodeId) this.repo.forget(row.placementId, [id]);
    }
  }

  async copy(session: MountSession, request: RequestMeta<'COPY'>): Promise<ReplyMeta<'COPY'>> {
    const row = this.openCommit(session, request.commit);
    const scope = session.scopeOfPlacement(row.placementId);
    const target = { rootId: scope.drive.id, commitId: row.id };
    let copied = 0;
    while (copied < request.length) {
      const wanted = Math.min(COPY_CHUNK_BYTES, request.length - copied);
      const chunk = await this.env.handles.read(session, request.srcHandle, {
        offset: request.srcOffset + copied,
        length: wanted,
      });
      if (chunk.length === 0) break;
      await this.env.staging.write(target, request.dstOffset + copied, chunk);
      copied += chunk.length;
    }
    if (copied > 0) this.repo.received(row.id, [request.dstOffset, request.dstOffset + copied]);
    return { copied };
  }

  scopeOf(session: MountSession, row: DriveMountCommit): PosixScope {
    return session.scopeOfPlacement(row.placementId);
  }
}
