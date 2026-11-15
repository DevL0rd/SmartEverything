import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { background } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import { TMP_DIRECTORY, locate, mountStagingRelPath, type DriveFiles } from '../intents';
import type { Store } from '../../store/store';

export interface StagingEnv {
  readonly files: DriveFiles;
  readonly store: Pick<Store, 'driveRoots'>;
}

interface Cached {
  readonly fd: FileHandle;
  timer: NodeJS.Timeout;
}

const IDLE_MS = 5000;

const ZERO_CHUNK_BYTES = 1024 * 1024;

export class Staging {
  private readonly cached = new Map<number, Cached>();
  private readonly opening = new Map<number, Promise<FileHandle>>();

  constructor(private readonly env: StagingEnv) {}

  relPath(commitId: number): string {
    return mountStagingRelPath(commitId);
  }

  async path(rootId: string, commitId: number): Promise<string> {
    return locate(this.env.store.driveRoots.byId(rootId), mountStagingRelPath(commitId));
  }

  async ensure(rootId: string, commitId: number): Promise<void> {
    const root = this.env.store.driveRoots.byId(rootId);
    await this.env.files.mkdir(await locate(root, TMP_DIRECTORY));
    const handle = await open(
      await this.path(rootId, commitId),
      constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600,
    );
    await handle.close();
  }

  async exists(rootId: string, commitId: number): Promise<boolean> {
    return (await this.env.files.stamp(await this.path(rootId, commitId))) !== null;
  }

  private fd(rootId: string, commitId: number): Promise<FileHandle> {
    const known = this.cached.get(commitId);
    if (known !== undefined) {
      known.timer.refresh();
      return Promise.resolve(known.fd);
    }
    const running = this.opening.get(commitId);
    if (running !== undefined) return running;
    const started = this.openCached(rootId, commitId).finally(() => {
      this.opening.delete(commitId);
    });
    this.opening.set(commitId, started);
    return started;
  }

  private async openCached(rootId: string, commitId: number): Promise<FileHandle> {
    const path = await this.path(rootId, commitId);
    let fd: FileHandle;
    try {
      fd = await open(path, constants.O_RDWR | constants.O_NOFOLLOW);
    } catch (cause) {
      if (fsCode(cause) !== 'ENOENT') throw cause;
      await this.ensure(rootId, commitId);
      fd = await open(path, constants.O_RDWR | constants.O_NOFOLLOW);
    }
    const timer = setTimeout(() => {
      background(this.close(commitId), 'drive_mount.staging_close_failed');
    }, IDLE_MS);
    timer.unref();
    this.cached.set(commitId, { fd, timer });
    return fd;
  }

  async write(
    target: { readonly rootId: string; readonly commitId: number },
    offset: number,
    bytes: Uint8Array,
  ): Promise<void> {
    const fd = await this.fd(target.rootId, target.commitId);
    let done = 0;
    while (done < bytes.length) {
      const { bytesWritten } = await fd.write(bytes, done, bytes.length - done, offset + done);
      done += bytesWritten;
    }
  }

  async zero(
    target: { readonly rootId: string; readonly commitId: number },
    range: { readonly offset: number; readonly length: number },
  ): Promise<void> {
    const fd = await this.fd(target.rootId, target.commitId);
    const end = range.offset + range.length;
    const size = (await fd.stat()).size;
    const inside = Math.min(end, size);
    const zeros = Buffer.alloc(Math.min(ZERO_CHUNK_BYTES, Math.max(inside - range.offset, 0)));
    for (let at = range.offset; at < inside;) {
      const wanted = Math.min(zeros.length, inside - at);
      const { bytesWritten } = await fd.write(zeros, 0, wanted, at);
      at += bytesWritten;
    }
    if (end > size) await fd.truncate(end);
  }

  async close(commitId: number): Promise<void> {
    const known = this.cached.get(commitId);
    if (known === undefined) return;
    this.cached.delete(commitId);
    clearTimeout(known.timer);
    await known.fd.close();
  }

  async remove(rootId: string, commitId: number): Promise<void> {
    await this.close(commitId);
    await this.env.files.remove(await this.path(rootId, commitId));
  }
}
