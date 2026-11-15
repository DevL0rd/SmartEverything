import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { parentPort } from 'node:worker_threads';
import { background, messageOf } from '@smarteverything/logging';
import { HASH_REQUEST, type HashResponse } from './workers';

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function answer(id: number, path: string): Promise<HashResponse> {
  try {
    return { id, sha256: await hashFile(path), error: null };
  } catch (cause) {
    return { id, sha256: null, error: messageOf(cause) };
  }
}

parentPort?.on('message', (raw: unknown) => {
  const request = HASH_REQUEST.parse(raw);
  background(
    answer(request.id, request.path).then((response) => {
      parentPort?.postMessage(response);
    }),
    'drive_mount.hash_worker_failed',
    { path: request.path },
  );
});
