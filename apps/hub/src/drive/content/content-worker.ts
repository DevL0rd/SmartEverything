import { parentPort } from 'node:worker_threads';
import { background } from '@smarteverything/logging';
import { ContentExtractor } from './content-extractor';
import { CONTENT_REQUEST } from './content-protocol';

const extractor = new ContentExtractor();

parentPort?.on('message', (raw: unknown) => {
  const request = CONTENT_REQUEST.parse(raw);
  background(
    extractor.handle(request).then((response) => {
      parentPort?.postMessage(response);
    }),
    'drive.content_worker_failed',
    { path: request.path },
  );
});
