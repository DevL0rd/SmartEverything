import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MediaSize, RecordingRow } from '@smarteverything/domain';
import type { Thumbnails } from '../cameras/thumbnails';
import { serveBytes } from './file-serve';

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

export async function sendRecording(
  { path, contentType }: RecordingFile,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await serveBytes(
    {
      size: (await stat(path)).size,
      headers: { 'content-type': contentType, 'cache-control': 'private, max-age=600' },
      stream: (range) => createReadStream(path, range),
    },
    request,
    response,
  );
}
