import { Worker } from 'node:worker_threads';
import { z } from 'zod';

const INTEGRITY_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
try {
  const copy = new DatabaseSync(workerData.path, { readOnly: true });
  try {
    parentPort.postMessage({ verdict: copy.prepare('pragma integrity_check').get().integrity_check });
  } finally {
    copy.close();
  }
} catch (cause) {
  parentPort.postMessage({ failure: cause instanceof Error ? cause.message : String(cause) });
}
`;

const REPLY = z.union([
  z.strictObject({ verdict: z.string() }),
  z.strictObject({ failure: z.string() }),
]);

export class IntegrityCheckError extends Error {
  override readonly name = 'IntegrityCheckError';

  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`The integrity check of ${path} could not run: ${reason}.`);
  }
}

export function integrityOf(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(INTEGRITY_SOURCE, { eval: true, workerData: { path } });
    worker.once('message', (raw: unknown) => {
      const reply = REPLY.parse(raw);
      if ('verdict' in reply) resolve(reply.verdict);
      else reject(new IntegrityCheckError(path, reply.failure));
    });
    worker.once('error', (cause: Error) => {
      reject(cause);
    });
    worker.once('exit', (code) => {
      reject(new IntegrityCheckError(path, `the check thread stopped with code ${String(code)}`));
    });
  });
}
