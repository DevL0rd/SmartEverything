import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import {
  API_ENDPOINTS as E,
  APP_UPDATE_BLOB_STAGED,
  type AppUpdateChange,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdateListing,
  type AppUpdatePruned,
  type AppUpdatePublication,
} from '@smarteverything/domain';
import { PublisherReplyError, send, type PublisherTarget } from './machine-update-client.ts';

export interface SourceFile {
  readonly source: string;
  readonly path: string;
  readonly contentType: string;
  readonly fileExtension?: string;
}

async function digestOf(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

export async function uploadBlob(
  target: PublisherTarget,
  file: SourceFile,
): Promise<AppUpdateFile> {
  const sha256 = await digestOf(file.source);
  const size = (await stat(file.source)).size;
  const staged = APP_UPDATE_BLOB_STAGED.parse(
    await send(target, {
      method: 'PUT',
      path: `/api/app-updates/blobs/${sha256}`,
      file: { path: file.source, size },
    }),
  );
  if (staged.sha256 !== sha256 || staged.size !== size) {
    throw new PublisherReplyError(`${file.path} as ${staged.sha256}`, sha256);
  }
  return {
    path: file.path,
    sha256,
    size,
    contentType: file.contentType,
    ...(file.fileExtension === undefined ? {} : { fileExtension: file.fileExtension }),
  };
}

export async function publishUpdate(
  target: PublisherTarget,
  publication: AppUpdatePublication,
): Promise<AppUpdateEntry> {
  return E.publishAppUpdate.response.parse(
    await send(target, {
      method: E.publishAppUpdate.method,
      path: E.publishAppUpdate.path,
      json: publication,
    }),
  );
}

export async function promoteUpdate(
  target: PublisherTarget,
  request: { readonly id: string; readonly channel: AppUpdateEntry['channel'] },
): Promise<AppUpdateChange> {
  return E.promoteAppUpdate.response.parse(
    await send(target, {
      method: E.promoteAppUpdate.method,
      path: E.promoteAppUpdate.path,
      json: request,
    }),
  );
}

export async function rollbackUpdates(
  target: PublisherTarget,
  request: {
    readonly platform: AppUpdateEntry['platform'];
    readonly channel: AppUpdateEntry['channel'];
    readonly reason: string;
    readonly toEmbedded: boolean;
  },
): Promise<AppUpdateChange> {
  return E.rollbackAppUpdate.response.parse(
    await send(target, {
      method: E.rollbackAppUpdate.method,
      path: E.rollbackAppUpdate.path,
      json: request,
    }),
  );
}

export async function withdrawUpdate(
  target: PublisherTarget,
  request: { readonly id: string; readonly reason: string },
): Promise<AppUpdateChange> {
  return E.withdrawAppUpdate.response.parse(
    await send(target, {
      method: E.withdrawAppUpdate.method,
      path: E.withdrawAppUpdate.path,
      json: request,
    }),
  );
}

export async function pruneUpdates(target: PublisherTarget): Promise<AppUpdatePruned> {
  return E.pruneAppUpdateBlobs.response.parse(
    await send(target, {
      method: E.pruneAppUpdateBlobs.method,
      path: E.pruneAppUpdateBlobs.path,
    }),
  );
}

export async function listUpdates(target: PublisherTarget): Promise<readonly AppUpdateListing[]> {
  return E.listAppUpdates.response.parse(
    await send(target, { method: E.listAppUpdates.method, path: E.listAppUpdates.path }),
  );
}
