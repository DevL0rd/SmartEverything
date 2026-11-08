import { createHash, randomUUID } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { messageOf } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import type { DriveItem, DriveUpload } from '@smarteverything/domain';
import type { DriveUploadOwner } from '../store/repositories/drive-uploads';
import type { Store } from '../store/store';
import { commitContent, type ChangeEnv } from './changes';
import { locate, physicalRoot, TMP_DIRECTORY, type DriveWriteRoot } from './intents';
import { checkDriveFreeSpace, checkDriveQuota } from './quotas';
import { readDriveSettings } from './settings';
import { stagedUpload } from './uploads-tus-content';
import { destinationOf, relPathOf } from './uploads-tus-target';
import {
  absent,
  actorOf,
  checksumOf,
  completedHeaders,
  writeAtPosition,
  type PositionalWrite,
  DAY_MS,
  expiresHeader,
  headerOf,
  idOf,
  lengthOf,
  OFFSET_STREAM,
  refusalOf,
  send,
  targetOf,
  tmpPath,
  TUS_EXTENSIONS,
  TUS_VERSION,
  TusError,
  UPLOADS_PATH,
  type Reply,
  type TusCaller,
} from './uploads-tus-wire';
import type { VolumeProbe } from './volumes';

export interface TusEnv extends ChangeEnv {
  readonly store: ChangeEnv['store'] & Pick<Store, 'driveUploads' | 'driveQuotas' | 'settingsKv'>;
  readonly space: VolumeProbe['space'];
  readonly completed: (item: DriveItem) => void;
  readonly authenticate: (request: IncomingMessage) => TusCaller | null;
}

export class TusUploads {
  private readonly active = new Set<string>();
  constructor(
    private readonly env: TusEnv,
    private readonly writeAt: PositionalWrite = writeAtPosition,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      send(response, await this.route(request));
    } catch (cause) {
      const refusal = refusalOf(cause);
      if (refusal !== null) {
        send(response, { status: refusal.status, body: refusal.message });
      } else if (request.socket.destroyed) {
        this.env.log.info('drive_upload.client_gone', { error: messageOf(cause) });
      } else {
        this.env.log.error('drive_upload.failed', cause);
        send(response, { status: 500, body: 'The upload failed.' });
      }
    }
  }

  async sweepExpired(): Promise<number> {
    const expired = this.env.store.driveUploads.expire(this.env.now().toISOString());
    for (const upload of expired) {
      await this.discard(upload);
    }
    return expired.length;
  }

  soonestExpiry(): string | null {
    return this.env.store.driveUploads.soonestExpiry();
  }

  private async route(request: IncomingMessage): Promise<Reply> {
    const caller = this.env.authenticate(request);
    if (caller === null) {
      return { status: 401, body: 'Sign in to upload.' };
    }
    const method = request.method ?? '';
    if (method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Tus-Version': TUS_VERSION,
          'Tus-Extension': TUS_EXTENSIONS,
          'Tus-Checksum-Algorithm': 'sha256',
        },
      };
    }
    if (headerOf(request, 'tus-resumable') !== TUS_VERSION) {
      return { status: 412, headers: { 'Tus-Version': TUS_VERSION } };
    }
    return this.dispatch(request, caller);
  }

  private async dispatch(request: IncomingMessage, caller: TusCaller): Promise<Reply> {
    const id = idOf(request.url ?? '');
    const method = request.method ?? '';
    if (method === 'POST' && id === null) {
      return this.create(request, caller);
    }
    if (id === undefined || id === null) {
      throw absent();
    }
    switch (method) {
      case 'HEAD':
        this.owned(id, caller);
        return this.locked(id, () => this.head(id, caller));
      case 'PATCH':
        return this.patch(request, id, caller);
      case 'DELETE':
        return this.terminate(id, caller);
      default:
        return { status: 405 };
    }
  }

  private async create(request: IncomingMessage, caller: TusCaller): Promise<Reply> {
    const length = lengthOf(request);
    const { target, name, sha256 } = targetOf(request);
    const destination = destinationOf(this.env.store, target, caller);
    const released = destination.item?.bytes ?? 0;
    checkDriveQuota((profileId) => this.env.store.driveQuotas.status(profileId), {
      profileId: caller.profileId,
      addBytes: length,
      releasedBytes: released,
    });
    await checkDriveFreeSpace(this.env.space, destination.root.path, length);
    const now = this.env.now();
    const days = readDriveSettings(this.env.store).uploadExpiryDays;
    const upload: DriveUpload = {
      id: randomUUID(),
      rootId: destination.root.id,
      target,
      name,
      length,
      offset: 0,
      state: 'open',
      failureReason: null,
      profileId: caller.profileId,
      clientId: caller.clientId,
      nodeId: caller.nodeId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    };
    await this.openPartial(destination.root, upload, sha256);
    const result = length === 0 ? await this.commit(upload, caller) : {};
    return {
      status: 201,
      headers: {
        ...result,
        Location: `${UPLOADS_PATH}/${upload.id}`,
        'Upload-Expires': expiresHeader(upload),
        'Upload-Offset': '0',
      },
    };
  }

  private async openPartial(
    root: DriveWriteRoot,
    upload: DriveUpload,
    expectedSha256: string | null,
  ): Promise<void> {
    const { files, store } = this.env;
    const path = await locate(root, tmpPath(upload.id));
    await files.mkdir(await locate(root, TMP_DIRECTORY));
    const created = await open(path, 'wx', 0o600);
    await created.close();
    try {
      store.driveUploads.insert(upload, expectedSha256);
    } catch (cause) {
      await files.remove(path);
      throw cause;
    }
  }

  private async head(id: string, caller: TusCaller): Promise<Reply> {
    const upload = this.owned(id, caller);
    const offset = upload.state === 'open' ? await this.currentOffset(upload) : upload.offset;
    const result =
      upload.state === 'open' && offset === upload.length
        ? await this.commit({ ...upload, offset }, caller)
        : upload.state === 'complete'
          ? completedHeaders(this.env.store.driveUploads.result(upload.id))
          : {};
    return {
      status: 200,
      headers: {
        'Upload-Offset': String(offset),
        ...result,
        'Upload-Length': String(upload.length),
        'Upload-Expires': expiresHeader(upload),
        'Cache-Control': 'no-store',
      },
    };
  }

  private async terminate(id: string, caller: TusCaller): Promise<Reply> {
    const upload = this.owned(id, caller);
    if (this.active.has(id)) {
      throw new TusError(409, 'The upload is being written.');
    }
    await this.discard(upload);
    this.env.store.driveUploads.remove(id);
    return { status: 204 };
  }

  private patch(request: IncomingMessage, id: string, caller: TusCaller): Promise<Reply> {
    const upload = this.owned(id, caller);
    return this.locked(id, () => this.patchLocked(request, upload, caller));
  }

  private async locked(id: string, work: () => Promise<Reply>): Promise<Reply> {
    if (this.active.has(id)) {
      throw new TusError(409, 'The upload is already being written.');
    }
    this.active.add(id);
    try {
      return await work();
    } finally {
      this.active.delete(id);
    }
  }

  private async patchLocked(
    request: IncomingMessage,
    upload: DriveUpload,
    caller: TusCaller,
  ): Promise<Reply> {
    if (headerOf(request, 'content-type') !== OFFSET_STREAM) {
      throw new TusError(415, `PATCH needs the content type ${OFFSET_STREAM}.`);
    }
    const claim = checksumOf(request);
    if (upload.state !== 'open') {
      throw new TusError(409, 'The upload is no longer open.');
    }
    const offset = await this.currentOffset(upload);
    if (Number(headerOf(request, 'upload-offset')) !== offset) {
      throw new TusError(409, `The upload is at offset ${String(offset)}.`);
    }
    const next = await this.append(request, { upload, offset, claim });
    const result =
      next === upload.length ? await this.commit({ ...upload, offset: next }, caller) : {};
    return {
      status: 204,
      headers: {
        ...result,
        'Upload-Offset': String(next),
        'Upload-Expires': expiresHeader(upload),
      },
    };
  }

  private owned(id: string, caller: TusCaller): DriveUpload {
    const owner: DriveUploadOwner = {
      profileId: caller.profileId,
      clientId: caller.clientId,
      nodeId: caller.nodeId,
    };
    const upload = this.env.store.driveUploads.findOwned(id, owner);
    const due =
      upload?.state === 'open' && Date.parse(upload.expiresAt) <= this.env.now().getTime();
    if (upload === undefined || upload.state === 'failed' || upload.state === 'expired' || due) {
      throw absent();
    }
    return upload;
  }

  private rootOf(upload: DriveUpload): DriveWriteRoot {
    const root = this.env.store.driveRoots.find(upload.rootId);
    if (root === undefined) {
      throw absent();
    }
    return physicalRoot(root);
  }

  private async currentOffset(upload: DriveUpload): Promise<number> {
    const root = this.rootOf(upload);
    const stamp = await this.env.files.stamp(await locate(root, tmpPath(upload.id)));
    if (stamp === null) {
      this.fail(upload, upload.state, 'The partial upload is missing from disk.');
      throw absent();
    }
    if (stamp.size !== upload.offset) {
      this.env.store.driveUploads.setOffset(upload.id, stamp.size);
    }
    return stamp.size;
  }

  private async append(
    request: IncomingMessage,
    write: { upload: DriveUpload; offset: number; claim: string | undefined },
  ): Promise<number> {
    const { upload, offset, claim } = write;
    const root = this.rootOf(upload);
    const handle = await open(await locate(root, tmpPath(upload.id)), 'r+');
    const hash = createHash('sha256');
    try {
      const chunks: AsyncIterable<Uint8Array> = request;
      let written = 0;
      for await (const chunk of chunks) {
        if (offset + written + chunk.byteLength > upload.length) {
          await handle.truncate(offset);
          throw new TusError(413, 'The chunk passes the declared upload length.');
        }
        await this.writeAt(handle, chunk, offset + written);
        hash.update(chunk);
        written += chunk.byteLength;
      }
      if (claim !== undefined && claim !== hash.digest('hex')) {
        await handle.truncate(offset);
        throw new TusError(460, 'The checksum does not match the received bytes.');
      }
      await handle.sync();
      this.env.store.driveUploads.setOffset(upload.id, offset + written);
      return offset + written;
    } catch (cause) {
      await this.afterInterruption(cause, handle, upload);
      throw cause;
    } finally {
      await handle.close();
    }
  }

  private async afterInterruption(
    cause: unknown,
    handle: FileHandle,
    upload: DriveUpload,
  ): Promise<void> {
    if (cause instanceof TusError) {
      return;
    }
    if (fsCode(cause) === 'ENOSPC') {
      await this.discard(upload);
      this.fail(upload, 'open', 'The disk ran out of space.');
      return;
    }
    const { size } = await handle.stat();
    this.env.store.driveUploads.setOffset(upload.id, size);
    this.env.log.info('drive_upload.interrupted', { uploadId: upload.id, offset: size });
  }

  private async commit(
    upload: DriveUpload,
    caller: TusCaller,
  ): Promise<Readonly<Record<string, string>>> {
    const { driveUploads } = this.env.store;
    driveUploads.transition(upload.id, 'open', 'committing', null);
    try {
      const destination = destinationOf(this.env.store, upload.target, caller);
      checkDriveQuota((profileId) => this.env.store.driveQuotas.status(profileId), {
        profileId: upload.profileId,
        addBytes: upload.length,
        releasedBytes: destination.item?.bytes ?? 0,
      });
      const staged = await stagedUpload(
        this.env,
        destination.root,
        upload,
        driveUploads.expectedHash(upload.id),
      );
      const relPath = await relPathOf(this.env, destination, upload.name);
      await commitContent(this.env, {
        root: destination.root,
        staged,
        relPath,
        actor: actorOf(upload),
        alongside: (item): void => {
          driveUploads.complete(upload.id, item);
          this.env.completed(item);
        },
      });
      return completedHeaders(this.env.store.driveUploads.result(upload.id));
    } catch (cause) {
      await this.discard(upload);
      this.fail(upload, 'committing', messageOf(cause));
      throw cause;
    }
  }

  private fail(upload: DriveUpload, from: DriveUpload['state'], reason: string): void {
    this.env.store.driveUploads.transition(upload.id, from, 'failed', reason);
  }

  private async discard(upload: DriveUpload): Promise<void> {
    const root = this.env.store.driveRoots.find(upload.rootId);
    if (root !== undefined && root.path !== null) {
      await this.env.files.remove(await locate(physicalRoot(root), tmpPath(upload.id)));
    }
  }
}
