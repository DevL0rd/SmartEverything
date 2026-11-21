import { createHash, randomUUID } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { messageOf } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import type { DriveUpload } from '@smarteverything/domain';
import { commitContent } from './changes';
import { locate, TMP_DIRECTORY, type DriveWriteRoot } from './intents';
import { checkDriveFreeSpace, loadedQuotaCheck } from './quotas';
import { loadDriveSettings } from './settings';
import type { DriveActivity } from './activity';
import { stagedUpload, type StagedEnv } from './uploads-tus-content';
import { destinationOf, ownedUpload, relPathOf } from './uploads-tus-target';
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
import type { DataSpaceProbe } from './data-space';

export interface TusEnv extends StagedEnv {
  readonly space: DataSpaceProbe['space'];
  readonly activity: Pick<DriveActivity, 'around'>;
  readonly authenticate: (request: IncomingMessage) => Promise<TusCaller | null>;
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
    const expired = await this.env.store.host.call(
      'driveUploads',
      'expire',
      this.env.now().toISOString(),
    );
    for (const upload of expired) {
      await this.discard(upload);
    }
    return expired.length;
  }

  soonestExpiry(): Promise<string | null> {
    return this.env.store.host.call('driveUploads', 'soonestExpiry');
  }

  private async route(request: IncomingMessage): Promise<Reply> {
    const caller = await this.env.authenticate(request);
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
        await this.owned(id, caller);
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
    const destination = await destinationOf(this.env.store, target, caller);
    const released = destination.item?.bytes ?? 0;
    await loadedQuotaCheck(this.env.store, {
      profileId: caller.profileId,
      addBytes: length,
      releasedBytes: released,
    });
    await checkDriveFreeSpace(this.env.space, destination.root.path, length);
    const now = this.env.now();
    const days = (await loadDriveSettings(this.env.store)).uploadExpiryDays;
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
      await store.host.call('driveUploads', 'insert', upload, expectedSha256);
    } catch (cause) {
      await files.remove(path);
      throw cause;
    }
  }

  private async head(id: string, caller: TusCaller): Promise<Reply> {
    const upload = await this.owned(id, caller);
    const offset = upload.state === 'open' ? await this.currentOffset(upload) : upload.offset;
    const result =
      upload.state === 'open' && offset === upload.length
        ? await this.commit({ ...upload, offset }, caller)
        : upload.state === 'complete'
          ? await this.completed(upload.id)
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
    const upload = await this.owned(id, caller);
    if (this.active.has(id)) {
      throw new TusError(409, 'The upload is being written.');
    }
    await this.discard(upload);
    await this.env.store.host.call('driveUploads', 'remove', id);
    return { status: 204 };
  }

  private async patch(request: IncomingMessage, id: string, caller: TusCaller): Promise<Reply> {
    const upload = await this.owned(id, caller);
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
    const advanced = await this.append(request, { upload, offset, claim });
    const result = advanced.offset === upload.length ? await this.commit(advanced, caller) : {};
    return {
      status: 204,
      headers: {
        ...result,
        'Upload-Offset': String(advanced.offset),
        'Upload-Expires': expiresHeader(advanced),
      },
    };
  }

  private owned(id: string, caller: TusCaller): Promise<DriveUpload> {
    return ownedUpload(this.env.store, { id, caller, now: this.env.now() });
  }

  private async rootOf(upload: DriveUpload): Promise<DriveWriteRoot> {
    const root = await this.env.store.host.call('driveRoots', 'find', upload.rootId);
    if (root === undefined) {
      throw absent();
    }
    return root;
  }

  private async currentOffset(upload: DriveUpload): Promise<number> {
    const root = await this.rootOf(upload);
    const stamp = await this.env.files.stamp(await locate(root, tmpPath(upload.id)));
    if (stamp === null) {
      await this.fail(upload, upload.state, 'The partial upload is missing from disk.');
      throw absent();
    }
    if (stamp.size !== upload.offset) {
      await this.env.store.host.call('driveUploads', 'setOffset', upload.id, stamp.size);
    }
    return stamp.size;
  }

  private async append(
    request: IncomingMessage,
    write: { upload: DriveUpload; offset: number; claim: string | undefined },
  ): Promise<DriveUpload> {
    const { upload, offset, claim } = write;
    const root = await this.rootOf(upload);
    const handle = await open(await locate(root, tmpPath(upload.id)), 'r+');
    const hash = claim === undefined ? null : createHash('sha256');
    try {
      const chunks: AsyncIterable<Uint8Array> = request;
      let written = 0;
      for await (const chunk of chunks) {
        if (offset + written + chunk.byteLength > upload.length) {
          await handle.truncate(offset);
          throw new TusError(413, 'The chunk passes the declared upload length.');
        }
        await this.writeAt(handle, chunk, offset + written);
        hash?.update(chunk);
        written += chunk.byteLength;
      }
      if (hash !== null && claim !== hash.digest('hex')) {
        await handle.truncate(offset);
        throw new TusError(460, 'The checksum does not match the received bytes.');
      }
      await handle.sync();
      const days = (await loadDriveSettings(this.env.store)).uploadExpiryDays;
      const expiresAt = new Date(this.env.now().getTime() + days * DAY_MS).toISOString();
      return await this.env.store.host.call(
        'driveUploads',
        'setOffset',
        upload.id,
        offset + written,
        expiresAt,
      );
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
      await this.fail(upload, 'open', 'The disk ran out of space.');
      return;
    }
    const { size } = await handle.stat();
    await this.env.store.host.call('driveUploads', 'setOffset', upload.id, size);
    this.env.log.info('drive_upload.interrupted', { uploadId: upload.id, offset: size });
  }

  private commit(
    upload: DriveUpload,
    caller: TusCaller,
  ): Promise<Readonly<Record<string, string>>> {
    return this.env.activity.around(() => this.settle(upload, caller));
  }

  private async settle(
    upload: DriveUpload,
    caller: TusCaller,
  ): Promise<Readonly<Record<string, string>>> {
    const { host } = this.env.store;
    await host.call('driveUploads', 'transition', upload.id, 'open', 'committing', null);
    try {
      const destination = await destinationOf(this.env.store, upload.target, caller);
      await loadedQuotaCheck(this.env.store, {
        profileId: upload.profileId,
        addBytes: upload.length,
        releasedBytes: destination.item?.bytes ?? 0,
      });
      const { staged, blocks } = await stagedUpload(
        this.env,
        destination.root,
        upload,
        await host.call('driveUploads', 'expectedHash', upload.id),
      );
      const relPath = await relPathOf(this.env, destination, upload.name);
      await commitContent(this.env, {
        root: destination.root,
        staged,
        relPath,
        actor: actorOf(upload),
        alongside: [
          ...(blocks === null ? [] : [{ kind: 'blocks', ...blocks } as const]),
          { kind: 'uploadComplete', uploadId: upload.id },
          { kind: 'backupSettle' },
        ],
      });
      return await this.completed(upload.id);
    } catch (cause) {
      await this.discard(upload);
      await this.fail(upload, 'committing', messageOf(cause));
      throw cause;
    }
  }

  private async completed(id: string): Promise<Readonly<Record<string, string>>> {
    return completedHeaders(await this.env.store.host.call('driveUploads', 'result', id));
  }

  private async fail(
    upload: DriveUpload,
    from: DriveUpload['state'],
    reason: string,
  ): Promise<void> {
    await this.env.store.host.call('driveUploads', 'transition', upload.id, from, 'failed', reason);
  }

  private async discard(upload: DriveUpload): Promise<void> {
    const root = await this.env.store.host.call('driveRoots', 'find', upload.rootId);
    if (root !== undefined) {
      await this.env.files.remove(await locate(root, tmpPath(upload.id)));
    }
  }
}
