import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { SEEK_WHENCE } from '@smarteverything/domain/drive-mount';
import { fsCode } from '../../fs-code';
import type { DriveFiles, DriveWriteRoot } from '../intents';
import { locate } from '../intents';
import type { PosixScope } from '../posix/env';
import { posix } from '../posix/errors';
import type { DrivePosix } from '../posix/service';
import type { Store } from '../../store/store';
import { OpenHandle, type MountSession } from './session';

export interface HandleEnv {
  readonly posix: DrivePosix;
  readonly files: DriveFiles;
  readonly store: Pick<Store, 'host'>;
}

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

export class HeldInodes {
  private readonly counts = new Map<number, number>();

  holds(inodeId: number): boolean {
    return (this.counts.get(inodeId) ?? 0) > 0;
  }

  add(inodeId: number): void {
    this.counts.set(inodeId, (this.counts.get(inodeId) ?? 0) + 1);
  }

  drop(inodeId: number): void {
    const count = (this.counts.get(inodeId) ?? 1) - 1;
    if (count <= 0) this.counts.delete(inodeId);
    else this.counts.set(inodeId, count);
  }
}

export class HandleTable {
  constructor(
    private readonly env: HandleEnv,
    private readonly held: HeldInodes,
  ) {}

  private root(scope: PosixScope): Promise<DriveWriteRoot> {
    return this.env.store.host.call('driveRoots', 'byId', scope.drive.id);
  }

  async open(session: MountSession, scope: PosixScope, ino: number): Promise<number> {
    const target = await this.env.posix.openTarget(scope, ino, false);
    const handle = new OpenHandle(session.nextHandle(), ino, scope, target.relPath);
    session.handles.set(handle.id, handle);
    this.held.add(ino);
    return handle.id;
  }

  find(session: MountSession, id: number): OpenHandle {
    const handle = session.handles.get(id);
    if (handle === undefined) throw posix('ESTALE', `The handle ${String(id)} is not open.`);
    return handle;
  }

  async read(
    session: MountSession,
    id: number,
    range: { readonly offset: number; readonly length: number },
  ): Promise<Uint8Array> {
    const handle = this.find(session, id);
    const fd = await this.current(handle);
    const buffer = Buffer.allocUnsafe(range.length);
    const { bytesRead } = await fd.read(buffer, 0, range.length, range.offset);
    return buffer.subarray(0, bytesRead);
  }

  async source(
    session: MountSession,
    id: number,
  ): Promise<{ readonly fd: FileHandle; readonly size: number; readonly rootId: string }> {
    const handle = this.find(session, id);
    const fd = await this.current(handle);
    return { fd, size: (await fd.stat()).size, rootId: handle.scope.drive.id };
  }

  async seek(
    session: MountSession,
    id: number,
    request: { readonly offset: number; readonly whence: number },
  ): Promise<number> {
    const handle = this.find(session, id);
    const fd = await this.current(handle);
    const size = (await fd.stat()).size;
    if (request.offset >= size)
      throw posix('EINVAL', 'The offset is at or past the end of the file.');
    return request.whence === SEEK_WHENCE.data ? request.offset : size;
  }

  async release(session: MountSession, id: number): Promise<number | null> {
    const handle = session.handles.get(id);
    if (handle === undefined) return null;
    session.handles.delete(id);
    await handle.fd?.close();
    this.held.drop(handle.ino);
    return this.held.holds(handle.ino) ? null : handle.ino;
  }

  async releaseAll(session: MountSession): Promise<readonly OpenHandle[]> {
    const released: OpenHandle[] = [];
    for (const handle of [...session.handles.values()]) {
      if ((await this.release(session, handle.id)) !== null) released.push(handle);
    }
    return released;
  }

  private async current(handle: OpenHandle): Promise<NonNullable<OpenHandle['fd']>> {
    const root = await this.root(handle.scope);
    const stamp = await this.env.files.stamp(await locate(root, handle.relPath));
    if (handle.fd !== null && (stamp === null || stamp.ino === handle.identity)) return handle.fd;
    return this.reopen(handle, root);
  }

  private async reopen(
    handle: OpenHandle,
    root: DriveWriteRoot,
  ): Promise<NonNullable<OpenHandle['fd']>> {
    const target = await this.env.posix.openTarget(handle.scope, handle.ino, false);
    handle.retarget(target.relPath);
    const fd = await this.opened(await locate(root, target.relPath));
    const previous = handle.swap(fd, (await fd.stat({ bigint: true })).ino);
    await previous?.close();
    return fd;
  }

  private async opened(path: string): Promise<NonNullable<OpenHandle['fd']>> {
    try {
      return await open(path, READ_FLAGS);
    } catch (cause) {
      if (fsCode(cause) === 'ELOOP') throw posix('ELOOP', 'A link is in the way of the file.');
      throw cause;
    }
  }
}
