import { parentPort } from 'node:worker_threads';
import { background } from '@smarteverything/logging';
import { readMediaFile } from './metadata-file';
import { METADATA_REQUEST } from './metadata-protocol';
import { TimedProbe } from './metadata-read';

const probe = new TimedProbe();
let queue: Promise<void> = Promise.resolve();

parentPort?.on('message', (raw: unknown) => {
  const request = METADATA_REQUEST.parse(raw);
  queue = queue.then(async () => {
    const outcome = await readMediaFile(probe, request);
    parentPort?.postMessage({ id: request.id, outcome });
  });
  background(queue, 'drive.metadata_worker_failed', { relPath: request.relPath });
});
