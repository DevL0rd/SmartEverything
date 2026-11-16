import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { rename, truncate } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import type { ReplyMeta, RequestMeta } from '@smarteverything/domain/drive-mount';
import type { DriveMountCommit } from '../../store/repositories/drive-mount-commits';
import { locate, type DriveWriteRoot } from '../intents';
import type { OpenTarget } from '../posix/open';
import type { PosixChangeEnv, PosixScope } from '../posix/env';
import { PosixError, posix } from '../posix/errors';
import { actorOf } from '../posix/records';
import { checkDriveWrite, type DriveWriteGuard } from '../quotas';
import { stageBytes } from '../versions';
import type { ByteRange } from '../patch-files';
import { applyContent, changedElsewhere, clampRanges } from './apply';
import type { CommitEnv, MountCommits } from './commits';
import type { MountDedupe } from './dedupe';
import type { GroupFsync } from './fsync';
import type { SettleGroup } from './settle-group';
import type { MountSession } from './session';
import { coveredBytes, coversRanges } from '../../store/repositories/drive-mount-commits';

export interface FinishEnv extends CommitEnv {
  readonly guard: DriveWriteGuard;
  readonly fsync: GroupFsync;
  readonly settle: SettleGroup;
  readonly dedupe: MountDedupe;
}

interface Landing {
  readonly scope: PosixScope;
  readonly root: DriveWriteRoot;
  readonly target: OpenTarget;
  readonly item: DriveItem | undefined;
}

interface Content {
  readonly staged: string;
  readonly ranges: readonly ByteRange[];
  readonly size: number;
  readonly baseRev: number;
  readonly fsync: boolean;
  readonly writtenNs: bigint;
  readonly atimeNs: bigint | undefined;
  readonly digest: () => Promise<string>;
  readonly settle: (rev: number) => void;
}

export class MountFinish {
  private readonly change: PosixChangeEnv;

  constructor(
    private readonly env: FinishEnv,
    private readonly commits: MountCommits,
  ) {
    this.change = { ...env.change, settle: env.settle.run };
  }

  private async landing(scope: PosixScope, ino: number): Promise<Landing> {
    const target = await this.env.posix.openTarget(scope, ino, true);
    const item = this.change.store.driveItems.byPath(scope.drive.id, target.relPath, null);
    return { scope, root: this.change.store.driveRoots.byId(scope.drive.id), target, item };
  }

  private async checked(session: MountSession, landing: Landing, content: Content): Promise<void> {
    const { item, target, scope, root } = landing;
    if (
      item !== undefined &&
      changedElsewhere(this.change, item, session.nodeId, content.baseRev)
    ) {
      throw new PosixError('ESTALE', 'The file changed on the Hub.', item.rev);
    }
    await checkDriveWrite(this.env.guard, {
      profileId: scope.caller.profileId,
      addBytes: content.size,
      releasedBytes: target.size,
      path: root.path,
    });
  }

  private async apply(session: MountSession, landing: Landing, content: Content): Promise<number> {
    await this.checked(session, landing, content);
    const { item, root, scope } = landing;
    if (item === undefined) return this.orphan(landing, content);
    const written = await applyContent(this.change, {
      root,
      relPath: item.relPath,
      staged: content.staged,
      ranges: content.ranges,
      size: content.size,
      digest: content.digest,
      actor: actorOf(scope.caller),
      settled: (stored) => {
        content.settle(stored.rev);
      },
    });
    return written.rev;
  }

  private async land(
    session: MountSession,
    target: { readonly scope: PosixScope; readonly ino: number },
    content: Content,
  ): Promise<number> {
    const { scope, ino } = target;
    const landed = await this.env.posix.landing(scope.drive.id, ino, async () => {
      const landing = await this.landing(scope, ino);
      const rev = await this.apply(session, landing, content);
      await this.env.posix.stampWrite(scope, ino, {
        mtimeNs: content.writtenNs,
        atimeNs: content.atimeNs,
      });
      return { landing, rev };
    });
    if (content.fsync) {
      const live = await locate(landed.landing.root, landed.landing.target.relPath);
      await this.env.fsync.request([live, dirname(live)]);
    }
    return landed.rev;
  }

  private async orphan(landing: Landing, content: Content): Promise<number> {
    const { root, target } = landing;
    const live = await locate(root, target.relPath);
    const staged = await locate(root, content.staged);
    if (coversRanges(content.ranges, content.size)) {
      await truncate(staged, content.size);
      await rename(staged, live);
    } else {
      await this.change.files.applyPatch(live, staged, {
        ranges: clampRanges(content.ranges, content.size),
        size: content.size,
      });
      await this.change.files.remove(staged);
    }
    content.settle(0);
    return 0;
  }

  private async reply(
    scope: PosixScope,
    ino: number,
    rev: number | null,
  ): Promise<ReplyMeta<'END'>> {
    const attr = await this.env.posix.getattr(scope, ino);
    return { attr, rev: rev ?? attr.rev };
  }

  async end(session: MountSession, request: RequestMeta<'END'>): Promise<ReplyMeta<'END'>> {
    const row = this.commits.commitOf(session, request.commit);
    const scope = this.commits.scopeOf(session, row);
    await this.commits.drained(row.id);
    return this.env.dedupe.once(row.placementId, { name: 'END', key: request.opKey }, () =>
      this.complete(session, scope, row, request),
    );
  }

  private async complete(
    session: MountSession,
    scope: PosixScope,
    row: DriveMountCommit,
    request: RequestMeta<'END'>,
  ): Promise<ReplyMeta<'END'>> {
    const current = this.change.store.driveMountCommits.byId(row.id);
    if (current.state === 'aborted') throw posix('ESTALE', 'That commit was aborted.');
    if (current.state === 'done') return this.reply(scope, row.inodeId, current.resultRev);
    const ranges = this.commits.rangesOf(current);
    if (coveredBytes(ranges) !== request.length) {
      throw posix('EAGAIN', 'Some written ranges of this commit have not arrived yet.');
    }
    if (!(await this.env.staging.exists(scope.drive.id, row.id))) {
      const attr = await this.env.posix.getattr(scope, row.inodeId);
      this.change.store.driveMountCommits.finish(row.id, request.size, attr.rev);
      return { attr, rev: attr.rev };
    }
    const rev = await this.land(
      session,
      { scope, ino: row.inodeId },
      {
        staged: this.env.staging.relPath(row.id),
        ranges,
        size: request.size,
        baseRev: row.baseRev,
        fsync: request.fsync,
        writtenNs: request.mtimeNs,
        atimeNs: request.atimeNs,
        digest: () => this.env.staging.digest(scope.drive.id, row.id, request.size),
        settle: (written) => {
          this.change.store.driveMountCommits.finish(row.id, request.size, written);
        },
      },
    );
    this.commits.settled(row.id);
    await this.env.staging.release(row.id);
    return this.reply(scope, row.inodeId, rev);
  }

  async put(
    session: MountSession,
    request: RequestMeta<'PUT'>,
    payload: Uint8Array,
  ): Promise<ReplyMeta<'PUT'>> {
    const scope = session.scopeOf(this.change.store, request.ino);
    return this.env.dedupe.once(scope.placementId, { name: 'PUT', key: request.opKey }, () =>
      this.putBytes(session, scope, request, payload),
    );
  }

  private async putBytes(
    session: MountSession,
    scope: PosixScope,
    request: RequestMeta<'PUT'>,
    payload: Uint8Array,
  ): Promise<ReplyMeta<'PUT'>> {
    const root = this.change.store.driveRoots.byId(scope.drive.id);
    const staged = await stageBytes(this.change, root, Readable.from([Buffer.from(payload)]));
    try {
      const rev = await this.land(
        session,
        { scope, ino: request.ino },
        {
          staged: staged.relPath,
          ranges: request.size === 0 ? [] : [[0, request.size]],
          size: request.size,
          baseRev: request.baseRev,
          fsync: request.fsync,
          writtenNs: request.mtimeNs,
          atimeNs: request.atimeNs,
          digest: () => Promise.resolve(staged.sha256),
          settle: (): void => undefined,
        },
      );
      return await this.reply(scope, request.ino, rev);
    } catch (cause) {
      await this.change.files.remove(await locate(root, staged.relPath));
      throw cause;
    }
  }
}
