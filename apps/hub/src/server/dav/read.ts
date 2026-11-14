import type { ServerResponse } from 'node:http';
import { DrivePathError, openResolved, resolveInRoot } from '../../drive/paths';
import { serveBytes } from '../file-serve';
import { targetOf } from './collections';
import { authenticateDav, DavError, guarded, type DavDeps, type DavExchange } from './dav-auth';

export const CLASS1_METHODS = [
  'OPTIONS',
  'PROPFIND',
  'GET',
  'HEAD',
  'PUT',
  'MKCOL',
  'DELETE',
] as const;

export function sendOptions(
  response: ServerResponse,
  compliance: string,
  methods: readonly string[],
): void {
  response.writeHead(200, {
    dav: compliance,
    allow: methods.join(', '),
    'ms-author-via': 'DAV',
    'content-length': 0,
    'cache-control': 'no-store',
  });
  response.end();
}

function unreadable(cause: unknown): never {
  if (cause instanceof DrivePathError && cause.failure === 'missing') {
    throw new DavError(404, 'The file is not available on disk.');
  }
  throw cause;
}

export function handleRead(deps: DavDeps, exchange: DavExchange): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, request);
    const { root, item, relPath } = targetOf(deps, caller, request);
    if (relPath !== '' && item === undefined) {
      throw new DavError(404, 'There is nothing at that address.');
    }
    if (item === undefined || item.kind === 'folder') {
      throw new DavError(405, 'A collection has no bytes to download; list it with PROPFIND.');
    }
    const resolved = await resolveInRoot(root.path, relPath).catch(unreadable);
    const handle = await openResolved(resolved, 'read').catch(unreadable);
    try {
      await serveBytes(
        {
          size: (await handle.stat()).size,
          etag: item.etag,
          headers: {
            'content-type': item.mime,
            'cache-control': 'private, no-cache',
            'last-modified': new Date(item.modifiedAt).toUTCString(),
          },
          stream: (range) => handle.createReadStream({ autoClose: false, ...range }),
        },
        request,
        response,
      );
    } finally {
      await handle.close();
    }
  });
}
