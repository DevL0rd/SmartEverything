import { createHash, randomUUID } from 'node:crypto';
import { open, readdir, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { isMissing } from '../../fs-util';
import type { Store } from '../../store/store';
import { commitContent, type ChangeActor, type ChangeEnv } from '../changes';
import type { DataSpaceProbe } from '../data-space';
import { readDriveSettings } from '../settings';
import { locate, TMP_DIRECTORY, type DriveWriteRoot } from '../intents';
import { checkDriveFreeSpace, checkDriveQuota } from '../quotas';
import { freeNameAt } from '../uploads-tus-wire';
import type { PublicFileRequest } from './file-requests';

const log = new Logger('hub.drive');

const UPLOAD_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d+)$/u;
const PARTIAL_PREFIX = 'fr-';
const MAX_NAME_BYTES = 255;
const DAY_MS = 24 * 60 * 60 * 1000;
const PARTIAL_NAME =
  /^fr-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(\d+)$/u;

interface OpenPartial {
  readonly name: string;
  readonly requestId: string;
  readonly declared: number;
  readonly written: number;
}

export type IntakeStore = ChangeEnv['store'] &
  Pick<
    Store,
    'driveQuotas' | 'driveFileRequests' | 'driveNotifications' | 'context' | 'settingsKv' | 'write'
  >;

export interface IntakeEnv {
  readonly env: ChangeEnv;
  readonly store: IntakeStore;
  readonly space: DataSpaceProbe['space'];
}

export interface FileIntake {
  readonly uploader: string;
  readonly name: string;
}

export interface IntakeStart extends FileIntake {
  readonly length: number;
}

export interface IntakeAppend extends FileIntake {
  readonly uploadId: string;
  readonly offset: number;
  readonly chunks: AsyncIterable<Uint8Array>;
}

export interface IntakeProgress {
  readonly uploadId: string;
  readonly offset: number;
  readonly length: number;
  readonly done: boolean;
  readonly itemId: string | null;
  readonly name: string | null;
}

function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function invalid(message: string): ApiError {
  return new ApiError('invalid_request', message);
}

function cleaned(raw: FileIntake): FileIntake {
  return { uploader: uploaderOf(raw.uploader), name: fileNameOf(raw.name) };
}

function uploaderOf(raw: string | undefined): string {
  const name = (raw ?? '').trim();
  if (name === '') throw invalid('Type your name so they know who sent the files.');
  return name;
}

function fileNameOf(raw: string | undefined): string {
  const name = basename((raw ?? '').trim());
  if (name === '' || name === '.' || name === '..' || name.includes('\0')) {
    throw invalid('Each file needs a name.');
  }
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) throw invalid('That file name is too long.');
  return name;
}

function idOf(uploadId: string): { readonly length: number } {
  const parsed = UPLOAD_ID.exec(uploadId);
  const length = Number(parsed?.[2]);
  if (parsed === null || !Number.isSafeInteger(length)) {
    throw new ApiError('not_found', 'There is no such upload for this link.');
  }
  return { length };
}

function missingAsEmpty(cause: unknown): string[] {
  if (isMissing(cause)) return [];
  throw cause;
}

function missingAsNothing(cause: unknown): null {
  if (isMissing(cause)) return null;
  throw cause;
}

function absent(): ApiError {
  return new ApiError('not_found', 'There is no such upload for this link.');
}

export class FileRequestIntake {
  private readonly active = new Set<string>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: IntakeEnv) {}

  begin(found: PublicFileRequest, raw: IntakeStart): Promise<IntakeProgress> {
    return this.serial(`begin-${found.root.id}`, () => this.beginNow(found, raw));
  }

  private async beginNow(found: PublicFileRequest, raw: IntakeStart): Promise<IntakeProgress> {
    const { env, space, store } = this.deps;
    const root = found.root;
    const start = { ...cleaned(raw), length: raw.length };
    await this.sweepStale(root, readDriveSettings(store).uploadExpiryDays * DAY_MS);
    const partials = await this.openPartials(root);
    const mine = partials.filter((partial) => partial.requestId === found.request.id);
    this.admit(found, start.length + sum(mine, (partial) => partial.declared));
    await checkDriveFreeSpace(
      space,
      root.path,
      start.length + sum(partials, (partial) => Math.max(partial.declared - partial.written, 0)),
    );
    const uploadId = `${randomUUID()}-${String(start.length)}`;
    const path = await locate(root, this.tmpRel(found, uploadId));
    await env.files.mkdir(await locate(root, TMP_DIRECTORY));
    const created = await open(path, 'wx', 0o600);
    await created.close();
    if (start.length > 0) {
      return { uploadId, offset: 0, length: start.length, done: false, itemId: null, name: null };
    }
    return this.commit(found, uploadId, start);
  }

  async status(found: PublicFileRequest, uploadId: string): Promise<IntakeProgress> {
    const { length } = idOf(uploadId);
    const offset = await this.sizeOf(found, uploadId);
    return { uploadId, offset, length, done: false, itemId: null, name: null };
  }

  append(found: PublicFileRequest, request: IntakeAppend): Promise<IntakeProgress> {
    const { uploadId } = request;
    const intake = cleaned(request);
    if (this.active.has(uploadId)) {
      throw new ApiError('conflict', 'The upload is already being written.');
    }
    this.active.add(uploadId);
    return this.appendLocked(found, request, intake).finally(() => {
      this.active.delete(uploadId);
    });
  }

  async cancel(found: PublicFileRequest, uploadId: string): Promise<void> {
    idOf(uploadId);
    if (this.active.has(uploadId)) {
      throw new ApiError('conflict', 'The upload is being written.');
    }
    await this.deps.env.files.remove(await locate(found.root, this.tmpRel(found, uploadId)));
  }

  async sweepStale(root: DriveWriteRoot, olderThanMs: number): Promise<number> {
    const directory = await locate(root, TMP_DIRECTORY);
    const names = await readdir(directory).catch(missingAsEmpty);
    const cutoff = this.deps.env.now().getTime() - olderThanMs;
    let removed = 0;
    for (const name of names) {
      if (!name.startsWith(PARTIAL_PREFIX)) continue;
      const path = await locate(root, `${TMP_DIRECTORY}/${name}`);
      const stamp = await stat(path).catch(missingAsNothing);
      if (stamp !== null && stamp.mtimeMs < cutoff) {
        await this.deps.env.files.remove(path);
        removed += 1;
      }
    }
    return removed;
  }

  private async openPartials(root: DriveWriteRoot): Promise<OpenPartial[]> {
    const directory = await locate(root, TMP_DIRECTORY);
    const names = await readdir(directory).catch(missingAsEmpty);
    const partials: OpenPartial[] = [];
    for (const name of names) {
      const parsed = PARTIAL_NAME.exec(name);
      if (parsed === null) continue;
      const stamp = await stat(await locate(root, `${TMP_DIRECTORY}/${name}`)).catch(
        missingAsNothing,
      );
      if (stamp === null) continue;
      partials.push({
        name,
        requestId: parsed[1] ?? '',
        declared: Number(parsed[2]),
        written: stamp.size,
      });
    }
    return partials;
  }

  private async appendLocked(
    found: PublicFileRequest,
    request: IntakeAppend,
    intake: FileIntake,
  ): Promise<IntakeProgress> {
    const { uploadId, offset, chunks } = request;
    const { length } = idOf(uploadId);
    const current = await this.sizeOf(found, uploadId);
    if (offset !== current) {
      throw new ApiError('conflict', `The upload is at offset ${String(current)}.`);
    }
    const handle = await open(await locate(found.root, this.tmpRel(found, uploadId)), 'r+');
    let written = 0;
    try {
      for await (const chunk of chunks) {
        if (offset + written + chunk.byteLength > length) {
          await handle.truncate(offset);
          throw new ApiError('payload_too_large', 'The chunk passes the declared file size.');
        }
        await handle.write(chunk, 0, chunk.byteLength, offset + written);
        written += chunk.byteLength;
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    const next = offset + written;
    if (next < length) {
      return { uploadId, offset: next, length, done: false, itemId: null, name: null };
    }
    return this.commit(found, uploadId, { ...intake, length });
  }

  private commit(
    found: PublicFileRequest,
    uploadId: string,
    intake: IntakeStart,
  ): Promise<IntakeProgress> {
    return this.serial(found.folder.id, async () => {
      try {
        return await this.commitNow(found, uploadId, intake);
      } catch (cause) {
        await this.deps.env.files.remove(await locate(found.root, this.tmpRel(found, uploadId)));
        throw cause;
      }
    });
  }

  private async commitNow(
    found: PublicFileRequest,
    uploadId: string,
    intake: IntakeStart,
  ): Promise<IntakeProgress> {
    const { env } = this.deps;
    const others = (await this.openPartials(found.root)).filter(
      (partial) =>
        partial.requestId === found.request.id &&
        partial.name !== `${PARTIAL_PREFIX}${found.request.id}-${uploadId}`,
    );
    this.admit(found, intake.length + sum(others, (partial) => partial.declared));
    const staged = await this.staged(found, uploadId, intake.length);
    const relPath = await this.freeRelPath(found, intake.name);
    const actor: ChangeActor = { actorProfileId: null, via: 'share', deviceId: null };

    const result = await commitContent(env, {
      root: found.root,
      staged,
      relPath,
      actor,
      alongside: (item) => {
        this.record(found, item, intake.uploader);
      },
    });
    log.info('drive_file_request.received', {
      requestId: found.request.id,
      itemId: result.item.id,
      bytes: intake.length,
    });
    return {
      uploadId,
      offset: intake.length,
      length: intake.length,
      done: true,
      itemId: result.item.id,
      name: result.item.name,
    };
  }

  private record(found: PublicFileRequest, item: DriveItem, uploader: string): void {
    const { store } = this.deps;
    store.write(() => {
      store.context.sql.run(
        'count the received file toward the space of the drive owner',
        'update drive_items set added_by_profile_id = $owner where id = $id',
        { owner: found.receiverProfileId, id: item.id },
      );
      store.driveFileRequests.recordUpload({
        requestId: found.request.id,
        itemId: item.id,
        uploaderName: uploader,
        bytes: item.bytes,
      });
      store.driveNotifications.add({
        profileId: found.request.createdBy,
        kind: 'file_request_upload',
        itemId: found.folder.id,
        actorProfileId: null,
        actorName: uploader,
        refId: found.request.id,
      });
    });
  }

  private admit(found: PublicFileRequest, bytes: number): void {
    const { store } = this.deps;
    checkDriveQuota((profileId) => store.driveQuotas.status(profileId), {
      profileId: found.receiverProfileId,
      addBytes: bytes,
      releasedBytes: 0,
    });
  }

  private async staged(
    found: PublicFileRequest,
    uploadId: string,
    length: number,
  ): Promise<{ relPath: string; bytes: number; sha256: string }> {
    const { env } = this.deps;
    const relPath = this.tmpRel(found, uploadId);
    const hash = createHash('sha256');
    for await (const chunk of env.files.read(await locate(found.root, relPath))) hash.update(chunk);
    return { relPath, bytes: length, sha256: hash.digest('hex') };
  }

  private async freeRelPath(found: PublicFileRequest, name: string): Promise<string> {
    const { env, store } = this.deps;
    for (let attempt = 1; ; attempt += 1) {
      const candidate = freeNameAt(name, attempt);
      const relPath = `${found.folder.relPath}/${candidate}`;
      const indexed = store.driveItems.byPath(found.root.id, relPath, null);
      const onDisk = await env.files.stamp(await locate(found.root, relPath));
      if (indexed === undefined && onDisk === null) return relPath;
    }
  }

  private async sizeOf(found: PublicFileRequest, uploadId: string): Promise<number> {
    const stamp = await this.deps.env.files.stamp(
      await locate(found.root, this.tmpRel(found, uploadId)),
    );
    if (stamp === null) throw absent();
    return stamp.size;
  }

  private tmpRel(found: PublicFileRequest, uploadId: string): string {
    return `${TMP_DIRECTORY}/${PARTIAL_PREFIX}${found.request.id}-${uploadId}`;
  }

  private serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    const tail: Promise<void> = next
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (this.queues.get(key) === tail) this.queues.delete(key);
      });
    this.queues.set(key, tail);
    return next;
  }
}
