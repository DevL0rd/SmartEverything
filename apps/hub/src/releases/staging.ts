import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import {
  ApiError,
  RELEASE_UPLOAD_ID,
  type ReleaseKeyRole,
  type ReleaseUpload,
  type ReleaseUploadBegin,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { unpackReleaseTar } from './release-tar';
import {
  hashOf,
  mergedRanges,
  missingRanges,
  plainUploadId,
  readRecord,
  receivedBytes,
  shownRanges,
  writeRecord,
} from './upload-record';
import { trustedReleaseKeys } from './trust';
import { ReleaseVerificationError, verifyRelease, type VerifiedRelease } from './verify';

const log = new Logger('hub.releases');

const BUNDLE_FILE = 'bundle.tar';

const RELEASE_DIRECTORY = 'release';

const UNPACKING_DIRECTORY = 'release.unpacking';

const STAGED_COPIES = 2;

const CREATE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

const WRITE_FLAGS = constants.O_WRONLY | constants.O_NOFOLLOW;

export type FreeBytes = (path: string) => Promise<number>;

export async function freeBytesAt(path: string): Promise<number> {
  const stats = await statfs(path);
  return stats.bavail * stats.bsize;
}

export interface ReleaseStagingOptions {
  readonly root: string;
  readonly keysFile: string;
  readonly now: () => Date;
  readonly freeBytes?: FreeBytes;
}

const arriving = new Map<string, number>();

const tails = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (tails.get(key) ?? Promise.resolve()).then(work);
  tails.set(key, Promise.allSettled([next]));
  return next;
}

function arrivingAt(directory: string): number {
  return arriving.get(directory) ?? 0;
}

function countChunk(directory: string, change: 1 | -1): void {
  const count = arrivingAt(directory) + change;
  if (count === 0) arriving.delete(directory);
  else arriving.set(directory, count);
}

function stagedOf(release: VerifiedRelease): NonNullable<ReleaseUpload['release']> {
  return {
    version: release.manifest.version,
    commit: release.manifest.commit,
    target: release.manifest.target,
    fingerprint: release.key.fingerprint,
    files: release.manifest.files.length,
    bytes: release.bytes,
  };
}

function lengthOf(declared: number | undefined, offset: number, size: number): void {
  if (declared !== undefined && offset + declared > size)
    throw new ApiError(
      'payload_too_large',
      `The chunk at ${String(offset)} runs past the declared size of ${String(size)} bytes.`,
    );
}

export class ReleaseStaging {
  private readonly root: string;
  private readonly keysFile: string;
  private readonly now: () => Date;
  private readonly freeBytes: FreeBytes;

  constructor(options: ReleaseStagingOptions) {
    this.root = options.root;
    this.keysFile = options.keysFile;
    this.now = options.now;
    this.freeBytes = options.freeBytes ?? freeBytesAt;
  }

  async begin(request: ReleaseUploadBegin): Promise<ReleaseUpload> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const needed = request.size * STAGED_COPIES;
    const free = await this.freeBytes(this.root);
    if (free < needed)
      throw new ApiError(
        'payload_too_large',
        `The Hub has ${String(free)} bytes free; a ${String(request.size)} byte bundle needs ${String(needed)} bytes to upload and unpack.`,
      );
    const uploadId = randomUUID();
    const directory = this.directoryOf(uploadId);
    await mkdir(directory, { mode: 0o700 });
    try {
      const bundle = await open(join(directory, BUNDLE_FILE), CREATE_FLAGS, 0o600);
      try {
        await bundle.truncate(request.size);
      } finally {
        await bundle.close();
      }
      const upload: ReleaseUpload = {
        uploadId,
        artifact: request.artifact,
        size: request.size,
        sha256: request.sha256,
        state: 'receiving',
        createdAt: this.now().toISOString(),
        received: [],
        receivedBytes: 0,
        release: null,
      };
      await writeRecord(directory, upload);
      log.info('release_upload.begun', {
        uploadId,
        artifact: request.artifact,
        size: request.size,
        sha256: request.sha256,
      });
      return upload;
    } catch (cause) {
      await rm(directory, { recursive: true, force: true });
      throw cause;
    }
  }

  read(uploadId: string): Promise<ReleaseUpload> {
    return readRecord(this.directoryOf(plainUploadId(uploadId)));
  }

  async list(): Promise<readonly ReleaseUpload[]> {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (cause) {
      if (isMissing(cause)) return [];
      throw cause;
    }
    const uploads: ReleaseUpload[] = [];
    for (const name of names.sort()) {
      if (!RELEASE_UPLOAD_ID.safeParse(name).success) continue;
      try {
        uploads.push(await readRecord(this.directoryOf(name)));
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.code === 'not_found')) throw cause;
      }
    }
    return uploads.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async chunk(
    uploadId: string,
    offset: number,
    input: Readable,
    declared: number | undefined,
  ): Promise<ReleaseUpload> {
    const directory = this.directoryOf(plainUploadId(uploadId));
    const size = await serialized(directory, async () => {
      const upload = await readRecord(directory);
      if (upload.state !== 'receiving')
        throw new ApiError('conflict', 'This upload is finished and takes no more bytes.');
      if (offset >= upload.size)
        throw new ApiError(
          'payload_too_large',
          `The offset ${String(offset)} is past the declared size of ${String(upload.size)} bytes.`,
        );
      lengthOf(declared, offset, upload.size);
      countChunk(directory, 1);
      return upload.size;
    });
    try {
      const written = await this.receive(directory, offset, size, input);
      if (written === 0) throw new ApiError('invalid_request', 'The chunk has no bytes.');
      return await serialized(directory, async () => {
        const upload = await readRecord(directory);
        const received = mergedRanges(upload.received, { start: offset, end: offset + written });
        const next: ReleaseUpload = { ...upload, received, receivedBytes: receivedBytes(received) };
        await writeRecord(directory, next);
        log.debug('release_upload.chunk', { uploadId, offset, bytes: written });
        return next;
      });
    } finally {
      countChunk(directory, -1);
    }
  }

  finish(uploadId: string, role: ReleaseKeyRole): Promise<ReleaseUpload> {
    const directory = this.directoryOf(plainUploadId(uploadId));
    return serialized(directory, async () => {
      const upload = await readRecord(directory);
      if (upload.state === 'staged') return upload;
      if (arrivingAt(directory) > 0)
        throw new ApiError('conflict', 'Chunks of this upload are still arriving.');
      return this.stage(directory, upload, role);
    });
  }

  discard(uploadId: string): Promise<ReleaseUpload> {
    const directory = this.directoryOf(plainUploadId(uploadId));
    return serialized(directory, async () => {
      const upload = await readRecord(directory);
      await rm(directory, { recursive: true, force: true });
      log.info('release_upload.discarded', {
        uploadId: upload.uploadId,
        artifact: upload.artifact,
        state: upload.state,
      });
      return upload;
    });
  }

  releaseDirectory(upload: ReleaseUpload): string {
    if (upload.state !== 'staged') throw new ApiError('conflict', 'This upload is not staged yet.');
    return join(this.directoryOf(upload.uploadId), RELEASE_DIRECTORY);
  }

  private directoryOf(uploadId: string): string {
    return join(this.root, uploadId);
  }

  private async receive(
    directory: string,
    offset: number,
    size: number,
    input: Readable,
  ): Promise<number> {
    const bundle = await open(join(directory, BUNDLE_FILE), WRITE_FLAGS);
    let written = 0;
    try {
      for await (const received of input) {
        const piece: unknown = received;
        if (!Buffer.isBuffer(piece))
          throw new ApiError('invalid_request', 'The chunk is not bytes.');
        if (offset + written + piece.length > size)
          throw new ApiError(
            'payload_too_large',
            `The chunk at ${String(offset)} runs past the declared size of ${String(size)} bytes.`,
          );
        let done = 0;
        while (done < piece.length) {
          const { bytesWritten } = await bundle.write(
            piece,
            done,
            piece.length - done,
            offset + written + done,
          );
          done += bytesWritten;
        }
        written += piece.length;
      }
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')
        throw new ApiError('payload_too_large', 'The Hub ran out of disk space for this upload.');
      throw cause;
    } finally {
      await bundle.close();
    }
    return written;
  }

  private async stage(
    directory: string,
    upload: ReleaseUpload,
    role: ReleaseKeyRole,
  ): Promise<ReleaseUpload> {
    const bundle = join(directory, BUNDLE_FILE);
    await checkBundle(bundle, upload);
    const release = await this.unpacked(directory, bundle, upload, role);
    await rename(join(directory, UNPACKING_DIRECTORY), join(directory, RELEASE_DIRECTORY));
    await rm(bundle, { force: true });
    const staged: ReleaseUpload = { ...upload, state: 'staged', release: stagedOf(release) };
    await writeRecord(directory, staged);
    log.info('release_upload.staged', {
      uploadId: upload.uploadId,
      artifact: upload.artifact,
      version: release.manifest.version,
      commit: release.manifest.commit,
      fingerprint: release.key.fingerprint,
      files: release.manifest.files.length,
      bytes: release.bytes,
    });
    return staged;
  }

  private async unpacked(
    directory: string,
    bundle: string,
    upload: ReleaseUpload,
    role: ReleaseKeyRole,
  ): Promise<VerifiedRelease> {
    const unpacking = join(directory, UNPACKING_DIRECTORY);
    await rm(unpacking, { recursive: true, force: true });
    try {
      await unpackReleaseTar(bundle, unpacking);
      return await verifyRelease(unpacking, {
        keys: await trustedReleaseKeys(this.keysFile),
        role,
        artifact: upload.artifact,
      });
    } catch (cause) {
      await rm(unpacking, { recursive: true, force: true });
      if (!(cause instanceof ReleaseVerificationError)) throw cause;
      refused(upload, cause.reason);
      throw new ApiError(
        'invalid_request',
        `The release was refused (${cause.reason}): ${cause.message}.`,
      );
    }
  }
}

function refused(upload: ReleaseUpload, reason: string): void {
  log.warn('release_upload.refused', {
    uploadId: upload.uploadId,
    artifact: upload.artifact,
    reason,
  });
}

async function checkBundle(bundle: string, upload: ReleaseUpload): Promise<void> {
  const missing = missingRanges(upload.received, upload.size);
  if (missing.length > 0)
    throw new ApiError(
      'conflict',
      `The upload still misses the byte ranges ${shownRanges(missing)}.`,
    );
  if ((await hashOf(bundle)) === upload.sha256) return;
  refused(upload, 'bundle_hash');
  throw new ApiError(
    'invalid_request',
    'The uploaded bundle does not match the sha256 given when the upload began.',
  );
}

export function releaseStaging(
  layout: HubLayout,
  now: () => Date,
  freeBytes?: FreeBytes,
): ReleaseStaging {
  return new ReleaseStaging({
    root: layout.system.updates.releaseStaging,
    keysFile: layout.system.keys.releaseKeys,
    now,
    ...(freeBytes === undefined ? {} : { freeBytes }),
  });
}
