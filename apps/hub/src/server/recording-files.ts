import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MediaSize, RecordingRow } from '@smarteverything/domain';
import parseRange from 'range-parser';
import type { Thumbnails } from '../cameras/thumbnails';

const JPEG = 'image/jpeg';

const CONTENT_TYPES: Readonly<Record<RecordingRow['kind'], string>> = {
  snapshot: JPEG,
  clip: 'video/mp4',
};

export interface RecordingFile {
  readonly path: string;
  readonly contentType: string;
}

export async function recordingFile(
  recording: RecordingRow,
  path: string,
  size: MediaSize,
  thumbnails: Thumbnails,
): Promise<RecordingFile> {
  return size === 'thumb'
    ? { path: await thumbnails.of(path), contentType: JPEG }
    : { path, contentType: CONTENT_TYPES[recording.kind] };
}

export interface ByteSource {
  readonly size: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly stream: (range?: { readonly start: number; readonly end: number }) => Readable;
}

export async function sendBytes(
  { size, headers: extra, stream }: ByteSource,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const ranges =
    request.headers.range === undefined
      ? undefined
      : parseRange(size, request.headers.range, { combine: true });
  if (ranges === -1) {
    response.writeHead(416, { 'content-range': `bytes */${String(size)}`, 'content-length': 0 });
    response.end();
    return;
  }
  const range =
    typeof ranges === 'object' && ranges.type === 'bytes' && ranges.length === 1
      ? ranges[0]
      : undefined;
  const headers = { ...extra, 'accept-ranges': 'bytes' };
  if (range === undefined) {
    response.writeHead(200, { ...headers, 'content-length': size });
    await pipeline(stream(), response);
    return;
  }
  response.writeHead(206, {
    ...headers,
    'content-length': range.end - range.start + 1,
    'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
  });
  await pipeline(stream(range), response);
}

export async function sendRecording(
  { path, contentType }: RecordingFile,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await sendBytes(
    {
      size: (await stat(path)).size,
      headers: { 'content-type': contentType, 'cache-control': 'private, max-age=600' },
      stream: (range) => createReadStream(path, range),
    },
    request,
    response,
  );
}
