import { Worker } from 'node:worker_threads';
import { z } from 'zod';

const COPY_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync, backup } = require('node:sqlite');
let source = null;
try {
  source = new DatabaseSync(workerData.source, { readOnly: true });
  source.exec('pragma busy_timeout = ' + String(workerData.busyTimeoutMs));
} catch (cause) {
  parentPort.postMessage({ failure: cause instanceof Error ? cause.message : String(cause) });
}
if (source !== null) {
  backup(source, workerData.target, {
    rate: workerData.rate,
    progress: ({ totalPages, remainingPages }) => {
      parentPort.postMessage({ totalPages, remainingPages });
    },
  }).then(
    () => {
      source.close();
      parentPort.postMessage({ done: true });
    },
    (cause) => {
      source.close();
      parentPort.postMessage({ failure: cause instanceof Error ? cause.message : String(cause) });
    },
  );
}
`;

const REPLY = z.union([
  z.strictObject({ totalPages: z.int(), remainingPages: z.int() }),
  z.strictObject({ done: z.literal(true) }),
  z.strictObject({ failure: z.string() }),
]);

export class DatabaseCopyError extends Error {
  override readonly name = 'DatabaseCopyError';

  constructor(
    readonly target: string,
    reason: string,
  ) {
    super(`The database copy to ${target} failed: ${reason}.`);
  }
}

export interface DatabaseCopy {
  readonly source: string;
  readonly target: string;
  readonly rate: number;
  readonly busyTimeoutMs: number;
  readonly progress: (pages: {
    readonly totalPages: number;
    readonly remainingPages: number;
  }) => void;
}

export function copiedDatabase(copy: DatabaseCopy): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(COPY_SOURCE, {
      eval: true,
      workerData: {
        source: copy.source,
        target: copy.target,
        rate: copy.rate,
        busyTimeoutMs: copy.busyTimeoutMs,
      },
    });
    let settled = false;
    const settle = (cause: Error | null): void => {
      if (settled) return;
      settled = true;
      if (cause === null) resolve();
      else reject(cause);
    };
    worker.on('message', (raw: unknown) => {
      const reply = REPLY.parse(raw);
      if ('done' in reply) settle(null);
      else if ('failure' in reply) settle(new DatabaseCopyError(copy.target, reply.failure));
      else copy.progress(reply);
    });
    worker.once('error', (cause: Error) => {
      settle(cause);
    });
    worker.once('exit', (code) => {
      settle(
        new DatabaseCopyError(copy.target, `the copy thread stopped with code ${String(code)}`),
      );
    });
  });
}
