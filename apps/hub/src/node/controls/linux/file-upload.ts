import { orElse } from './fs-fallback';
import type { FileUploadChunk, FileUploadResult } from '@smarteverything/domain';
import { constants } from 'node:fs';
import { lstat, open, rename, rm, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { failureOfFs, type FileScope } from './file-scope';

const PARTIAL_SUFFIX = '.se-upload';
const CREATE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW;
const APPEND_FLAGS = constants.O_WRONLY | constants.O_NOFOLLOW;
const NEW_FILE_MODE = 0o666;

function partialOf(target: string): string {
  return join(dirname(target), `.${basename(target)}${PARTIAL_SUFFIX}`);
}

export class FileUploads {
  constructor(private readonly scope: FileScope) {}

  async receive(chunk: FileUploadChunk): Promise<FileUploadResult> {
    const target = await this.scope.place(chunk.path);
    this.scope.protect(target);
    const data = Buffer.from(chunk.data, 'base64');
    await this.checkRoom(target, data.length);
    if (chunk.start === 0) {
      await this.refuseExisting(target, chunk.replace);
    }
    const partial = partialOf(target);
    const written = await this.append(partial, chunk.start, data);
    if (!chunk.final) {
      return { path: target, size: written, complete: false };
    }
    try {
      await this.refuseExisting(target, chunk.replace);
      await rename(partial, target);
    } catch (cause) {
      await rm(partial, { force: true });
      return failureOfFs(cause, 'write');
    }
    return { path: target, size: written, complete: true };
  }

  private async append(partial: string, start: number, data: Buffer): Promise<number> {
    const handle = await open(
      partial,
      start === 0 ? CREATE_FLAGS : APPEND_FLAGS,
      NEW_FILE_MODE,
    ).catch((cause: unknown) => failureOfFs(cause, 'write'));
    try {
      const size = (await handle.stat()).size;
      if (size !== start) {
        throw new NodeFailureError(
          'failed',
          `The upload arrived out of order: expected byte ${String(size)}, got ${String(start)}.`,
        );
      }
      await handle.write(data, 0, data.length, start);
      return start + data.length;
    } finally {
      await handle.close();
    }
  }

  private async refuseExisting(target: string, replace: boolean): Promise<void> {
    const present = await orElse(lstat(target), null);
    if (present === null) {
      return;
    }
    if (present.isDirectory()) {
      throw new NodeFailureError('failed', 'A folder with that name is already there.');
    }
    if (!replace) {
      throw new NodeFailureError('failed', 'A file with that name is already there.');
    }
  }

  private async checkRoom(target: string, bytes: number): Promise<void> {
    const space = await statfs(dirname(target)).catch((cause: unknown) =>
      failureOfFs(cause, 'write to'),
    );
    if (space.bavail * space.bsize < bytes) {
      throw new NodeFailureError('failed', 'There is not enough space on that drive.');
    }
  }
}
