import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import parseRange from 'range-parser';
import { matchesEntityTag } from './entity-tag';

const ACTIVE_CONTENT = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml']);

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export interface ByteSource {
  readonly size: number;
  readonly etag?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly stream: (range?: ByteRange) => Readable;
}

function isActiveContent(contentType: string | undefined): boolean {
  const essence = contentType?.split(';')[0]?.trim().toLowerCase();
  return essence !== undefined && ACTIVE_CONTENT.has(essence);
}

function responseHeaders(source: ByteSource): Record<string, string> {
  const headers: Record<string, string> = {
    ...source.headers,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
  };
  if (source.etag !== undefined) headers['etag'] = `"${source.etag}"`;
  if (isActiveContent(headers['content-type']) && headers['content-disposition'] === undefined) {
    headers['content-disposition'] = 'attachment';
  }
  return headers;
}

function rangeOf(
  source: ByteSource,
  request: IncomingMessage,
): ReturnType<typeof parseRange> | undefined {
  const header = request.headers.range;
  if (header === undefined) return undefined;
  const condition = request.headers['if-range'];
  if (condition !== undefined && (source.etag === undefined || condition !== `"${source.etag}"`)) {
    return undefined;
  }
  return parseRange(source.size, header, { combine: true });
}

function singleRange(ranges: ReturnType<typeof parseRange> | undefined): ByteRange | undefined {
  return typeof ranges === 'object' && ranges.type === 'bytes' && ranges.length === 1
    ? ranges[0]
    : undefined;
}

function sendNotModified(
  headers: Readonly<Record<string, string>>,
  response: ServerResponse,
): void {
  const kept: Record<string, string> = {};
  for (const name of ['etag', 'cache-control', 'x-content-type-options']) {
    const value = headers[name];
    if (value !== undefined) kept[name] = value;
  }
  response.writeHead(304, kept);
  response.end();
}

export async function serveBytes(
  source: ByteSource,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const headers = responseHeaders(source);
  if (
    source.etag !== undefined &&
    matchesEntityTag(request.headers['if-none-match'], source.etag)
  ) {
    sendNotModified(headers, response);
    return;
  }
  const ranges = rangeOf(source, request);
  if (ranges === -1) {
    response.writeHead(416, {
      'content-range': `bytes */${String(source.size)}`,
      'content-length': 0,
    });
    response.end();
    return;
  }
  const range = singleRange(ranges);
  if (range === undefined) {
    response.writeHead(200, { ...headers, 'content-length': source.size });
    await pipeline(source.stream(), response);
    return;
  }
  response.writeHead(206, {
    ...headers,
    'content-length': range.end - range.start + 1,
    'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(source.size)}`,
  });
  await pipeline(source.stream(range), response);
}
