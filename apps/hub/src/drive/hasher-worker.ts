import { parentPort } from 'node:worker_threads';
import { background } from '@smarteverything/logging';
import { HASH_REQUEST, hashRequested } from './blocks';

parentPort?.on('message', (raw: unknown) => {
  const request = HASH_REQUEST.parse(raw);
  background(
    hashRequested(request).then((response) => {
      parentPort?.postMessage(response);
    }),
    'drive.hash_worker_failed',
    { relPath: request.relPath },
  );
});
