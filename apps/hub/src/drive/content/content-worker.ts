import { parentPort } from 'node:worker_threads';
import { background } from '@smarteverything/logging';
import { CONTENT_REQUEST } from './content-protocol';
import { extractText } from './extract';

parentPort?.on('message', (raw: unknown) => {
  const request = CONTENT_REQUEST.parse(raw);
  background(
    extractText(request.path, request.name, request.mime).then((result) => {
      parentPort?.postMessage({ id: request.id, result });
    }),
    'drive.content_worker_failed',
    { path: request.path },
  );
});
