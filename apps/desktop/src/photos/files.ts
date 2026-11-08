import { createReadStream } from 'node:fs';
import parseRange from 'range-parser';
import { Logger } from '@smarteverything/logging';
import type { PhotoLibrary } from './library.js';
import type { PhotoFile } from './scan.js';

const log = new Logger('desktop.photos');
export const LOCAL_MEDIA_PREFIX = '/local-media/';

function streamFile(
  file: PhotoFile,
  request: Request,
  range?: parseRange.Range,
): ReadableStream<Uint8Array> {
  const stream = createReadStream(file.path, { ...range, signal: request.signal });
  const iterator = stream[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      const chunk = await iterator.next();
      if (chunk.done === true) controller.close();
      else if (chunk.value instanceof Uint8Array) controller.enqueue(chunk.value);
      else throw new TypeError('Media stream produced text.');
    },
    async cancel(): Promise<void> {
      await iterator.return?.();
    },
  });
}

function rangeOf(request: Request, bytes: number): parseRange.Range | null | undefined {
  const header = request.headers.get('range');
  if (request.method === 'HEAD' || header === null) return undefined;
  const ranges = parseRange(bytes, header, { combine: true });
  if (typeof ranges === 'number' || ranges.type !== 'bytes' || ranges.length !== 1) return null;
  return ranges[0] ?? null;
}

function responseOf(file: PhotoFile, request: Request): Response {
  const bytes = file.item.bytes;
  const headers = new Headers({
    'content-type': file.item.mimeType,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const range = rangeOf(request, bytes);
  if (range === null) {
    headers.set('content-range', `bytes */${String(bytes)}`);
    headers.set('content-length', '0');
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-length', String(range === undefined ? bytes : range.end - range.start + 1));
  if (range !== undefined)
    headers.set(
      'content-range',
      `bytes ${String(range.start)}-${String(range.end)}/${String(bytes)}`,
    );
  const body = request.method === 'HEAD' || bytes === 0 ? null : streamFile(file, request, range);
  return new Response(body, { status: range === undefined ? 200 : 206, headers });
}

export async function localMediaResponse(
  library: Pick<PhotoLibrary, 'file'>,
  request: Request,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405 });
  const id = new URL(request.url).pathname.slice(LOCAL_MEDIA_PREFIX.length);
  if (!/^[0-9a-f]{64}$/.test(id)) return new Response(null, { status: 404 });
  try {
    return responseOf(await library.file(id), request);
  } catch (cause) {
    log.warn('media.unavailable', {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return new Response(null, { status: 410 });
  }
}
