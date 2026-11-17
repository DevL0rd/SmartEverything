import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, rm, writeFile } from 'node:fs/promises';
import type { ReplyMeta, RequestMeta } from '@smarteverything/domain/drive-mount';
import { background, type Logger } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import type { Store } from '../../store/store';
import { TMP_DIRECTORY, locate, type DriveFiles } from '../intents';
import type { DriveMountCommitHead } from '../../store/repositories/drive-mount-commits';
import type { MountCommits } from './commits';
import type { HandleTable } from './handles';
import type { MountSession } from './session';
import type { Staging } from './staging';

export interface CopyEnv {
  readonly handles: HandleTable;
  readonly commits: MountCommits;
  readonly staging: Staging;
  readonly files: DriveFiles;
  readonly store: Pick<Store, 'driveRoots' | 'driveMountCommits'>;
  readonly log: Logger;
}

const COPY_CHUNK_BYTES = 1024 * 1024;

const PROBE_BYTES = 64 * 1024;

const REFLINK_UNAVAILABLE: ReadonlySet<string> = new Set(['EXDEV', 'ENOTSUP', 'EOPNOTSUPP']);

export class MountCopy {
  private readonly reflinks = new Map<string, Promise<boolean>>();

  constructor(private readonly env: CopyEnv) {}

  reflinkCapable(rootId: string): Promise<boolean> {
    const known = this.reflinks.get(rootId);
    if (known !== undefined) return known;
    const probing = this.probe(rootId);
    this.reflinks.set(rootId, probing);
    background(
      probing.then(
        (capable) => {
          this.env.log.info('drive_mount.reflink_probe', { rootId, reflink: capable });
        },
        () => {
          this.reflinks.delete(rootId);
        },
      ),
      'drive_mount.reflink_probe_failed',
    );
    return probing;
  }

  private async probe(rootId: string): Promise<boolean> {
    const root = this.env.store.driveRoots.byId(rootId);
    await this.env.files.mkdir(await locate(root, TMP_DIRECTORY));
    const name = randomUUID();
    const first = await locate(root, `${TMP_DIRECTORY}/reflink-probe-${name}`);
    const second = await locate(root, `${TMP_DIRECTORY}/reflink-probe-${name}.clone`);
    try {
      await writeFile(first, Buffer.alloc(PROBE_BYTES, 1), { mode: 0o600, flag: 'wx' });
      await copyFile(first, second, constants.COPYFILE_FICLONE_FORCE | constants.COPYFILE_EXCL);
      return true;
    } catch (cause) {
      if (REFLINK_UNAVAILABLE.has(fsCode(cause) ?? '')) return false;
      throw cause;
    } finally {
      await rm(first, { force: true });
      await rm(second, { force: true });
    }
  }

  async copy(session: MountSession, request: RequestMeta<'COPY'>): Promise<ReplyMeta<'COPY'>> {
    const row = this.env.commits.openCommit(session, request.commit);
    const scope = session.scopeOfPlacement(row.placementId);
    const source = await this.env.handles.source(session, request.srcHandle);
    const whole =
      request.srcOffset === 0 &&
      request.dstOffset === 0 &&
      source.size > 0 &&
      request.length >= source.size &&
      this.env.commits.rangesOf(row).length === 0 &&
      source.rootId === scope.drive.id;
    if (whole && (await this.reflinkCapable(scope.drive.id))) {
      await this.env.staging.clone(
        { rootId: scope.drive.id, commitId: row.id },
        `/proc/self/fd/${String(source.fd.fd)}`,
      );
      this.env.commits.receive(row, [0, source.size]);
      return { copied: source.size };
    }
    return this.streamed(session, request, row, scope.drive.id);
  }

  private async streamed(
    session: MountSession,
    request: RequestMeta<'COPY'>,
    row: DriveMountCommitHead,
    rootId: string,
  ): Promise<ReplyMeta<'COPY'>> {
    const target = { rootId, commitId: row.id };
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
    if (copied > 0)
      this.env.commits.receive(row, [request.dstOffset, request.dstOffset + copied]);
    return { copied };
  }
}
