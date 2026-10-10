import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { ApiError, type MediaSize, type RecordingRow } from '@smarteverything/domain';
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

interface Range {
  readonly start: number;
  readonly end: number;
}

function refused(header: string, reason: string): ApiError {
  return new ApiError('invalid_request', `The Range ${header} ${reason}.`);
}

function boundsOf(first: string, last: string, size: number): Range {
  if (first === '') {
    return { start: Math.max(size - Number(last), 0), end: size - 1 };
  }
  return { start: Number(first), end: last === '' ? size - 1 : Math.min(Number(last), size - 1) };
}

function rangeOf(header: string | undefined, size: number): Range | null {
  if (header === undefined) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  const first = match?.[1] ?? '';
  const last = match?.[2] ?? '';
  if (first === '' && last === '') {
    throw refused(header, 'is not a single byte range');
  }
  const range = boundsOf(first, last, size);
  if (range.start > range.end || range.start >= size) {
    throw refused(header, `lies outside the ${String(size)} bytes`);
  }
  return range;
}

export async function sendRecording(
  { path, contentType }: RecordingFile,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const size = (await stat(path)).size;
  const range = rangeOf(request.headers.range, size);
  const headers = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=600',
  };
  if (range === null) {
    response.writeHead(200, { ...headers, 'content-length': size });
    await pipeline(createReadStream(path), response);
    return;
  }
  response.writeHead(206, {
    ...headers,
    'content-length': range.end - range.start + 1,
    'content-range': `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`,
  });
  await pipeline(createReadStream(path, range), response);
}
