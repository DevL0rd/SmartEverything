import { extname } from 'node:path';
import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, AI_PROJECT_CHUNK_BYTES } from '@smarteverything/domain';
import type { HtmlPublication } from './documents';
import { projectEntryUrl } from './project-content';
import { previewRequester } from './websocket';
const RANGE_BYTES_MAX = 8 * 1024 * 1024;
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
};
export function projectCsp(ancestors: readonly string[]): string {
  return `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors ${ancestors.join(' ')}; sandbox allow-scripts allow-same-origin allow-modals`;
}
interface AssetRange {
  readonly start: number;
  readonly end: number;
  readonly partial: boolean;
}
function rangeParts(value: string): { readonly start: string; readonly end: string } {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  const start = match?.[1];
  const end = match?.[2];
  if (start === undefined || end === undefined || (start === '' && end === ''))
    throw new ApiError('invalid_request', 'Project assets require one bounded byte range.');
  return { start, end };
}
function byteRange(value: string | undefined, size: number): AssetRange {
  if (value === undefined) return { start: 0, end: size - 1, partial: false };
  const parts = rangeParts(value);
  const start = parts.start === '' ? Math.max(0, size - Number(parts.end)) : Number(parts.start);
  const end = parts.end === '' ? size - 1 : Math.min(Number(parts.end), size - 1);
  const last = parts.start === '' ? size - 1 : end;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(last) ||
    start > last ||
    start >= size ||
    last - start + 1 > RANGE_BYTES_MAX
  )
    throw new ApiError(
      'invalid_request',
      'The project range is unsatisfiable or exceeds eight MiB.',
    );
  return { start, end: last, partial: true };
}
function requestedRange(
  request: IncomingMessage,
  response: ServerResponse,
  size: number,
): AssetRange | null {
  try {
    return byteRange(request.headers.range, size);
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.code !== 'invalid_request') throw cause;
    response.writeHead(416, {
      'content-range': `bytes */${String(size)}`,
      'content-length': 0,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end();
    return null;
  }
}
function assetHeaders(
  response: ServerResponse,
  input: {
    readonly path: string;
    readonly range: AssetRange;
    readonly size: number;
    readonly ancestors: readonly string[];
  },
): void {
  const { range } = input;
  const path = decodeURIComponent(new URL(input.path, 'https://preview.invalid').pathname);
  const extension = path.endsWith('/') ? '.html' : extname(path).toLowerCase();
  response.writeHead(range.partial ? 206 : 200, {
    'content-type': MIME[extension] ?? 'application/octet-stream',
    'content-length': range.end - range.start + 1,
    'accept-ranges': 'bytes',
    ...(range.partial
      ? {
          'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(input.size)}`,
        }
      : {}),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': projectCsp(input.ancestors),
  });
}
async function streamAsset(
  response: ServerResponse,
  read: NonNullable<HtmlPublication['readAsset']>,
  input: {
    readonly path: string;
    readonly range: AssetRange;
    readonly version: string;
    readonly signal: AbortSignal;
  },
): Promise<void> {
  const { signal } = input;
  const abort = (): void => {
    response.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    let offset = input.range.start;
    while (offset <= input.range.end) {
      signal.throwIfAborted();
      const chunk = await read(
        input.path,
        offset,
        Math.min(AI_PROJECT_CHUNK_BYTES, input.range.end - offset + 1),
      );
      signal.throwIfAborted();
      if (chunk.version !== input.version || chunk.bytes.length === 0)
        throw new ApiError('conflict', 'The project asset changed during streaming.');
      if (!response.write(chunk.bytes)) await once(response, 'drain', { signal });
      offset += chunk.bytes.length;
    }
    response.end();
  } catch (cause) {
    response.destroy();
    throw cause;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
export async function serveProjectAsset(
  request: IncomingMessage,
  response: ServerResponse,
  input: {
    readonly publication: HtmlPublication;
    readonly path: string;
    readonly signal: AbortSignal;
    readonly ancestors: readonly string[];
  },
): Promise<void> {
  if (!['GET', 'HEAD'].includes(request.method ?? ''))
    throw new ApiError('forbidden', 'Project assets permit GET and HEAD only.');
  const read = input.publication.readAsset;
  if (read === undefined)
    throw new ApiError('not_found', 'This publication has no project assets.');
  const entry = input.publication.view.project_source?.entry;
  if (input.path === '/' && entry !== undefined) {
    response.writeHead(307, { location: projectEntryUrl(entry), 'cache-control': 'no-store' });
    response.end();
    return;
  }
  const signal = previewRequester(request, response, input.signal);
  signal.throwIfAborted();
  const first = await read(input.path, 0, 1);
  signal.throwIfAborted();
  const range = requestedRange(request, response, first.size);
  if (range === null) return;
  assetHeaders(response, { path: input.path, range, size: first.size, ancestors: input.ancestors });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  await streamAsset(response, read, { path: input.path, range, version: first.version, signal });
}
