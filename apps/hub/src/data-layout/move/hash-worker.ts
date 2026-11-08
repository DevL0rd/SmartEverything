import { parentPort } from 'node:worker_threads';
import { background } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import { hashAndScan, SCAN_REQUEST, type ScanRequest, type ScanResponse } from './prefix-scan';

async function respond(request: ScanRequest): Promise<ScanResponse> {
  try {
    const scan = await hashAndScan(request.path, request.prefix);
    return { kind: 'scanned', id: request.id, ...scan };
  } catch (cause) {
    return { kind: 'failed', id: request.id, code: fsCode(cause) ?? 'UNKNOWN' };
  }
}

parentPort?.on('message', (raw: unknown) => {
  const request = SCAN_REQUEST.parse(raw);
  background(
    respond(request).then((response) => {
      parentPort?.postMessage(response);
    }),
    'data_layout.move_hash_worker_failed',
    { path: request.path },
  );
});
