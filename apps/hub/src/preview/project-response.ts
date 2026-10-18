import { basename } from 'node:path/posix';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import mime from 'mime-types';
import parseRange from 'range-parser';
import { ApiError, AI_PROJECT_CHUNK_BYTES } from '@smarteverything/domain';
import type { HtmlPublication } from './documents';
import { pageHeaders } from './headers';
import { projectEntryUrl } from './project-content';

type ReadAsset = NonNullable<HtmlPublication['readAsset']>;

interface AssetRange {
  readonly start: number;
  readonly end: number;
  readonly partial: boolean;
}

function requestedRange(header: string | undefined, size: number): AssetRange | null {
  const full = { start: 0, end: size - 1, partial: false };
  if (header === undefined) return full;
  const ranges = parseRange(size, header);
  if (ranges === -1) return null;
  if (ranges === -2 || ranges.type !== 'bytes' || ranges.length !== 1) return full;
  const [range] = ranges;
  return range === undefined ? full : { ...range, partial: true };
}

function assetType(path: string): string {
  const decoded = decodeURIComponent(new URL(path, 'https://preview.invalid').pathname);
  const type = mime.contentType(basename(decoded) === '' ? 'index.html' : basename(decoded));
  return type === false ? 'application/octet-stream' : type;
}

async function* assetChunks(
  read: ReadAsset,
  input: { readonly path: string; readonly range: AssetRange; readonly version: string },
): AsyncGenerator<Buffer> {
  const { path, range, version } = input;
  let offset = range.start;
  while (offset <= range.end) {
    const chunk = await read(
      path,
      offset,
      Math.min(AI_PROJECT_CHUNK_BYTES, range.end - offset + 1),
    );
    if (chunk.version !== version || chunk.bytes.length === 0)
      throw new ApiError('conflict', 'The project asset changed during streaming.');
    yield chunk.bytes;
    offset += chunk.bytes.length;
  }
}

function writeHead(
  response: ServerResponse,
  input: {
    readonly path: string;
    readonly range: AssetRange | null;
    readonly size: number;
    readonly ancestors: readonly string[];
  },
): void {
  const { range, size } = input;
  if (range === null) {
    response.writeHead(416, { 'content-range': `bytes */${String(size)}`, 'content-length': 0 });
    return;
  }
  response.writeHead(range.partial ? 206 : 200, {
    ...pageHeaders(input.ancestors),
    'content-type': assetType(input.path),
    'content-length': range.end - range.start + 1,
    'accept-ranges': 'bytes',
    ...(range.partial
      ? { 'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(size)}` }
      : {}),
  });
}

export async function serveProjectAsset(
  request: IncomingMessage,
  response: ServerResponse,
  input: {
    readonly publication: HtmlPublication;
    readonly path: string;
    readonly signal: AbortSignal;
    readonly ancestors: readonly string[];
    readonly prefix?: string;
  },
): Promise<void> {
  if (!['GET', 'HEAD'].includes(request.method ?? ''))
    throw new ApiError('forbidden', 'Project assets permit GET and HEAD only.');
  const read = input.publication.readAsset;
  if (read === undefined)
    throw new ApiError('not_found', 'This publication has no project assets.');
  const redirect = entryRedirect(
    input.path,
    input.prefix,
    input.publication.view.project_source?.entry,
  );
  if (redirect !== null) {
    response.writeHead(307, { location: redirect, 'cache-control': 'no-store' });
    response.end();
    return;
  }
  const first = await read(input.path, 0, 1);
  input.signal.throwIfAborted();
  const range = requestedRange(request.headers.range, first.size);
  writeHead(response, { path: input.path, range, size: first.size, ancestors: input.ancestors });
  if (range === null || request.method === 'HEAD') {
    response.end();
    return;
  }
  const chunks = assetChunks(read, { path: input.path, range, version: first.version });
  await pipeline(Readable.from(chunks, { objectMode: false }), response, { signal: input.signal });
}

function entryRedirect(
  path: string,
  prefix: string | undefined,
  entry: string | undefined,
): string | null {
  if (entry === undefined) return null;
  const url = new URL(path, 'http://page.invalid');
  return url.pathname === '/' ? `${prefix ?? ''}${projectEntryUrl(entry)}${url.search}` : null;
}
