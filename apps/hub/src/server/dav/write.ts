import type { IncomingMessage } from 'node:http';
import type { DriveItem } from '@smarteverything/domain';
import { commitContent, parentOf } from '../../drive/changes';
import { locate, type DriveWriteRoot } from '../../drive/intents';
import { checkDriveWrite, DriveQuotaMeter } from '../../drive/quotas';
import { commitTrash } from '../../drive/trash-purge';
import { stageBytes, type StagedBytes } from '../../drive/versions';
import { matchesEntityTag } from '../entity-tag';
import { headerOf, targetOf, writableOf, type DavTarget } from './collections';
import {
  authenticateDav,
  DavError,
  guarded,
  type DavCaller,
  type DavDeps,
  type DavExchange,
} from './dav-auth';

async function* metered(
  source: AsyncIterable<Uint8Array>,
  meter: DriveQuotaMeter,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of source) {
    meter.admit(chunk.byteLength);
    yield chunk;
  }
}

function declaredLength(request: IncomingMessage): number | null {
  const header = request.headers['content-length'];
  if (header === undefined) return null;
  const length = Number(header);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
}

function precondition(failed: boolean): void {
  if (failed) {
    throw new DavError(412, 'The file is not in the state the request expected.');
  }
}

function assertIfMatch(request: IncomingMessage, item: DriveItem | undefined): void {
  const match = request.headers['if-match'];
  precondition(match !== undefined && (item === undefined || !matchesEntityTag(match, item.etag)));
}

function assertIfNoneMatch(request: IncomingMessage, item: DriveItem | undefined): void {
  const none = request.headers['if-none-match'];
  precondition(none !== undefined && item !== undefined && matchesEntityTag(none, item.etag));
}

function assertWritableFile(request: IncomingMessage, target: DavTarget): void {
  if (target.relPath === '' || target.item?.kind === 'folder') {
    throw new DavError(405, 'A collection cannot be replaced with a file.');
  }
  if (request.headers['content-range'] !== undefined) {
    throw new DavError(400, 'A partial PUT is not supported; send the whole file.');
  }
  assertIfMatch(request, target.item);
  assertIfNoneMatch(request, target.item);
}

interface Upload {
  readonly caller: DavCaller;
  readonly request: IncomingMessage;
  readonly target: DavTarget;
  readonly root: DriveWriteRoot;
}

async function stageUpload(deps: DavDeps, upload: Upload): Promise<StagedBytes> {
  const { caller, request, target, root } = upload;
  const released = target.item?.bytes ?? 0;
  const length = declaredLength(request);
  if (length !== null) {
    await checkDriveWrite(deps.guard, {
      profileId: caller.actor.profileId,
      addBytes: length,
      releasedBytes: released,
      path: root.path,
    });
  }
  const meter = new DriveQuotaMeter(deps.guard.status, caller.actor.profileId, released);
  return stageBytes(deps.env, root, metered(request, meter));
}

export function handlePut(deps: DavDeps, exchange: DavExchange): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, request);
    const target = targetOf(deps, caller, request);
    assertWritableFile(request, target);
    const root = writableOf(target.root);
    parentOf(deps.env, root.id, target.relPath);
    const staged = await stageUpload(deps, { caller, request, target, root });
    try {
      const written = await commitContent(deps.env, {
        root,
        staged,
        relPath: target.relPath,
        actor: caller.change,
      });
      response.writeHead(written.created ? 201 : 204, {
        etag: `"${written.item.etag}"`,
        'content-length': 0,
        'cache-control': 'no-store',
      });
      response.end();
    } catch (cause) {
      await deps.env.files.remove(await locate(root, staged.relPath));
      throw cause;
    }
  });
}

export function handleDelete(deps: DavDeps, exchange: DavExchange): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, request);
    const target = targetOf(deps, caller, request);
    if (target.relPath === '') {
      throw new DavError(403, 'The top folder of a library folder cannot be deleted.');
    }
    if (target.item === undefined) {
      throw new DavError(404, 'There is nothing at that address.');
    }
    const depth = headerOf(request, 'depth');
    if (target.item.kind === 'folder' && depth !== undefined && depth !== 'infinity') {
      throw new DavError(400, 'A collection is deleted with Depth infinity.');
    }
    assertIfMatch(request, target.item);
    await commitTrash(deps.env, writableOf(target.root), target.item.id, caller.change);
    response.writeHead(204, { 'content-length': 0, 'cache-control': 'no-store' });
    response.end();
  });
}
